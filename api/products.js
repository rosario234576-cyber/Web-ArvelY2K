const { getAdminDb } = require("./_firebase-admin");

const ALLOWED_ORIGINS = new Set([
  "https://arvelcustomy2k.store",
  "https://www.arvelcustomy2k.store",
  "https://web-arvel-y2-k.vercel.app",
  "https://rosario234576-cyber.github.io"
]);

function isoDate(value) {
  if (!value) return "";
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return value;
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
      return {
        ...data,
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
