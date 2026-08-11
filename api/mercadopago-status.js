const ALLOWED_ORIGINS = new Set([
  "https://arvelcustomy2k.store",
  "https://www.arvelcustomy2k.store",
  "https://web-arvel-y2-k.vercel.app",
  "https://rosario234576-cyber.github.io"
]);

module.exports = async function handler(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido." });

  const paymentId = String(req.query?.payment_id || "");
  if (!/^\d{4,30}$/.test(paymentId)) {
    return res.status(400).json({ error: "Pago inválido." });
  }

  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    const payment = await response.json();
    if (!response.ok) return res.status(404).json({ error: "No encontramos el pago." });
    return res.status(200).json({
      id: payment.id,
      orderNumber: payment.external_reference,
      status: payment.status,
      statusDetail: payment.status_detail
    });
  } catch (error) {
    console.error("mercadopago-status", error);
    return res.status(500).json({ error: "No pudimos consultar el pago." });
  }
};
