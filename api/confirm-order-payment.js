const ALLOWED_ORIGINS = new Set([
  "https://arvelcustomy2k.store", "https://www.arvelcustomy2k.store",
  "https://web-arvel-y2-k.vercel.app", "https://rosario234576-cyber.github.io"
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

  try {
    const firebaseAdmin = require("./_firebase-admin");
    const { getAdminDb, verifyFirebaseUser } = firebaseAdmin;

    // Solo admin puede confirmar pagos
    try {
      await verifyFirebaseUser(req);
    } catch (authError) {
      return res.status(401).json({ error: "No autorizado." });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { orderNumber, productIds } = body;

    if (!orderNumber) {
      return res.status(400).json({ error: "Número de pedido requerido." });
    }

    const db = getAdminDb();

    // Marcar pedido como pagado
    await db.collection("orders").doc(orderNumber).update({
      status: "paid",
      paidAt: new Date()
    });

    // Marcar productos como vendidos
    if (Array.isArray(productIds) && productIds.length > 0) {
      const batch = db.batch();
      for (const productId of productIds) {
        const productRef = db.collection("products").doc(productId);
        batch.update(productRef, { soldOut: true });
      }
      await batch.commit();
    }

    return res.status(200).json({ ok: true, message: "Pago confirmado y productos marcados como vendidos." });
  } catch (error) {
    console.error("confirm-order-payment:", error);
    return res.status(500).json({ error: "No pudimos confirmar el pago." });
  }
};
