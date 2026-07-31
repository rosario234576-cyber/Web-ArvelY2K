const crypto = require("crypto");

function isValidSignature(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return process.env.MP_ALLOW_UNSIGNED_WEBHOOKS === "true";

  const signature = String(req.headers["x-signature"] || "");
  const requestId = String(req.headers["x-request-id"] || "");
  const dataId = String(req.query?.["data.id"] || req.body?.data?.id || "");
  const parts = Object.fromEntries(
    signature.split(",").map((part) => part.split("=").map((value) => value.trim()))
  );
  if (!parts.ts || !parts.v1 || !dataId || !requestId) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  const received = Buffer.from(parts.v1, "hex");
  const calculated = Buffer.from(expected, "hex");
  return received.length === calculated.length && crypto.timingSafeEqual(received, calculated);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  if (!isValidSignature(req)) return res.status(401).json({ error: "Firma inválida." });

  const paymentId = String(req.query?.["data.id"] || req.body?.data?.id || "");
  if (!paymentId) return res.status(200).json({ received: true });

  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    const payment = await response.json();
    if (!response.ok) return res.status(200).json({ received: true });

    console.log("Mercado Pago payment", {
      paymentId: payment.id,
      orderNumber: payment.external_reference,
      status: payment.status,
      statusDetail: payment.status_detail
    });
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("mercadopago-webhook", error);
    return res.status(200).json({ received: true });
  }
};
