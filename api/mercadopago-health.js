const ALLOWED_ORIGINS = new Set([
  "https://arvelcustomy2k.store",
  "https://www.arvelcustomy2k.store",
  "https://web-arvel-y2-k.vercel.app",
  "https://rosario234576-cyber.github.io"
]);

function feeRate(name, fallback = null) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 && value < 0.9 ? value : fallback;
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({ connected: false, error: "Método no permitido." });
  }

  const accessToken = String(process.env.MP_ACCESS_TOKEN || "").trim();
  // Son valores públicos de cotización, no credenciales. La fuente de verdad
  // sigue siendo el backend al crear la preferencia.
  const fees = {
    mercadopago_money: feeRate("MP_MONEY_FEE_RATE", 0),
    mercadopago_card_1: feeRate("MP_CARD_1_FEE_RATE"),
    mercadopago_card_2: feeRate("MP_CARD_2_FEE_RATE"),
    mercadopago_card_3: feeRate("MP_CARD_3_FEE_RATE")
  };
  if (!accessToken) {
    return res.status(503).json({ connected: false, reason: "missing_token" });
  }

  try {
    const response = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      return res.status(503).json({ connected: false, reason: "invalid_token" });
    }
    return res.status(200).json({
      connected: true,
      mode: accessToken.startsWith("TEST-") ? "test" : "production",
      fees,
      installments: 3
    });
  } catch (error) {
    console.error("mercadopago-health", error);
    return res.status(503).json({ connected: false, reason: "unavailable" });
  }
};
