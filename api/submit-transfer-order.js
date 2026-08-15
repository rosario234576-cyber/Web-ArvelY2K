const ALLOWED_ORIGINS = new Set([
  "https://arvelcustomy2k.store", "https://www.arvelcustomy2k.store",
  "https://web-arvel-y2-k.vercel.app", "https://rosario234576-cyber.github.io"
]);
const REVIEW_WINDOW_MS = 5 * 60 * 1000;

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  try {
    const { getAdminDb, verifyFirebaseUser } = require("./_firebase-admin");
    const user = await verifyFirebaseUser(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const orderNumber = String(body.orderNumber || "").trim();
    if (!/^ARV-\d{8}-\d{4}$/.test(orderNumber)) return res.status(400).json({ error: "Pedido inválido." });
    const db = getAdminDb(), orderRef = db.collection("orders").doc(orderNumber);
    const serverNowMs = Date.now(), expiresAtMs = serverNowMs + REVIEW_WINDOW_MS;
    await db.runTransaction(async (transaction) => {
      const orderSnapshot = await transaction.get(orderRef);
      const order = orderSnapshot.exists ? orderSnapshot.data() : null;
      if (!order || order.uid !== user.uid) throw Object.assign(new Error("Pedido no encontrado."), { statusCode: 404 });
      if (Number(order.reservationExpiresAtMs || 0) <= serverNowMs || order.status !== "reserved_pending_payment") throw Object.assign(new Error("La reserva venció. Volvé al carrito para intentarlo nuevamente."), { statusCode: 410 });
      const productRefs = [...new Set(order.items.map((item) => item.documentId))].map((id) => db.collection("products").doc(id));
      const productSnapshots = await Promise.all(productRefs.map((ref) => transaction.get(ref)));
      for (const snapshot of productSnapshots) {
        const reservations = { ...(snapshot.data()?.reservations || {}) };
        const reservation = reservations[orderNumber];
        if (!reservation || Number(reservation.expiresAtMs || 0) <= serverNowMs) throw Object.assign(new Error("La reserva venció. Volvé al carrito para intentarlo nuevamente."), { statusCode: 410 });
        reservations[orderNumber] = { ...reservation, stage: "review", expiresAtMs };
        transaction.update(snapshot.ref, { reservations, updatedAt: new Date(serverNowMs) });
      }
      transaction.update(orderRef, { status: "awaiting_payment_review", reservationStage: "review", reservationExpiresAtMs: expiresAtMs, submittedAt: new Date(serverNowMs), updatedAt: new Date(serverNowMs) });
    });
    await db.collection("users").doc(user.uid).collection("orders").doc(orderNumber).set({ status: "awaiting_payment_review", reservationExpiresAtMs: expiresAtMs, updatedAt: new Date(serverNowMs) }, { merge: true });
    return res.status(200).json({ ok: true, serverNowMs, expiresAtMs });
  } catch (error) {
    console.error("submit-transfer-order", error);
    if (String(error?.message) === "AUTH_REQUIRED") return res.status(401).json({ error: "Iniciá sesión para continuar." });
    return res.status(Number(error?.statusCode) || 500).json({ error: Number(error?.statusCode) ? error.message : "No pudimos confirmar el envío del pedido." });
  }
};
