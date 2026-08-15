const { getAdminDb } = require("./_firebase-admin");

const ALLOWED_ORIGINS = new Set([
  "https://arvelcustomy2k.store",
  "https://www.arvelcustomy2k.store",
  "https://web-arvel-y2-k.vercel.app",
  "https://rosario234576-cyber.github.io"
]);
// Las reservas de revisión creadas por la versión anterior duraban una hora.
// Este límite único las reduce a cinco minutos sin afectar reservas nuevas.
const LEGACY_REVIEW_EXPIRY_MS = 1786768723687;

function isoDate(value) {
  if (!value) return "";
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return value;
}

function publicStock(data) {
  const nowMs = Date.now();
  const reservations = Object.values(data.reservations && typeof data.reservations === "object" ? data.reservations : {})
    .map((reservation) => {
      const storedExpiry = Number(reservation?.expiresAtMs || 0);
      const expiresAtMs = reservation?.stage === "review" && storedExpiry - nowMs > 5 * 60 * 1000
        ? Math.min(storedExpiry, LEGACY_REVIEW_EXPIRY_MS)
        : storedExpiry;
      return { ...reservation, expiresAtMs };
    })
    .filter((reservation) => reservation.expiresAtMs > nowMs);
  const reservedByVariant = {};
  for (const reservation of reservations) {
    for (const item of Array.isArray(reservation?.items) ? reservation.items : []) {
      reservedByVariant[item.variantKey] = (reservedByVariant[item.variantKey] || 0) + Number(item.quantity || 0);
    }
  }
  const reservationActive = reservations.length > 0;
  const reservedUntilMs = reservationActive
    ? Math.min(...reservations.map((reservation) => Number(reservation.expiresAtMs)))
    : 0;
  const availableByVariant = data.stockByVariant && typeof data.stockByVariant === "object"
    ? Object.fromEntries(Object.entries(data.stockByVariant).map(([key, stock]) => [key, Math.max(0, Number(stock || 0) - Number(reservedByVariant[key] || 0))]))
    : data.stockByVariant;
  const reservedTotal = Object.values(reservedByVariant).reduce((sum, quantity) => sum + quantity, 0);
  const availableStock = availableByVariant && Object.keys(availableByVariant).length
    ? Object.values(availableByVariant).reduce((sum, quantity) => sum + Number(quantity || 0), 0)
    : Math.max(0, Number(data.stock || 0) - reservedTotal);
  const stockByVariant = reservationActive && availableByVariant
    ? Object.fromEntries(Object.keys(availableByVariant).map((key) => [key, 0]))
    : availableByVariant;
  return {
    stock: reservationActive ? 0 : availableStock,
    stockByVariant,
    soldOut: Boolean(data.soldOut),
    reservationActive,
    reservedUntilMs
  };
}

module.exports = async function handler(req, res) {
  // El panel puede publicar, ocultar o destacar productos en cualquier momento.
  // No se debe servir una copia anterior del catalogo desde el CDN de Vercel.
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const origin = String(req.headers.origin || "");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ error: "Origen no autorizado." });
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const snapshot = await getAdminDb()
      .collection("products")
      .where("status", "==", "published")
      .get();

    const products = snapshot.docs.map((item) => {
      const data = item.data();
      const availability = publicStock(data);
      return {
        ...data,
        reservations: undefined,
        ...availability,
        documentId: item.id,
        id: item.id,
        createdAt: isoDate(data.createdAt),
        updatedAt: isoDate(data.updatedAt)
      };
    });

    return res.status(200).json({ products });
  } catch (error) {
    console.error("Public products error:", error);
    return res.status(500).json({ error: "No pudimos cargar el catalogo." });
  }
};
