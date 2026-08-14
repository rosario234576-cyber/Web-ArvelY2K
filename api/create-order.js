const ALLOWED_ORIGINS = new Set([
  "https://arvelcustomy2k.store", "https://www.arvelcustomy2k.store",
  "https://web-arvel-y2-k.vercel.app", "https://rosario234576-cyber.github.io"
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

  try {
    const firebaseAdmin = require("./_firebase-admin");
    const { getAdminDb } = firebaseAdmin;

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { orderNumber, fullName, email, phone, items } = body;

    if (!orderNumber || !fullName || !email || !phone || !Array.isArray(items)) {
      return res.status(400).json({ error: "Faltan datos requeridos." });
    }

    const db = getAdminDb();
    const ordersCollection = db.collection("orders");

    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    await ordersCollection.doc(orderNumber).set({
      orderNumber,
      firstName,
      lastName,
      fullName,
      email,
      phone,
      items: items.map(item => ({
        id: item.id || item.documentId,
        name: item.name,
        quantity: item.quantity,
        price: item.price
      })),
      status: "pending",
      createdAt: new Date(),
      paidAt: null
    });

    return res.status(201).json({ ok: true, orderNumber });
  } catch (error) {
    console.error("create-order:", error);
    return res.status(500).json({ error: "No pudimos guardar el pedido." });
  }
};
