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
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({ connected: false, error: "Método no permitido." });
  }

  const accessToken = String(process.env.MP_ACCESS_TOKEN || "").trim();
  const configuredFeeRate = Number(process.env.MP_3_INSTALLMENTS_FEE_RATE || 0);
  const installmentFeeRate = Number.isFinite(configuredFeeRate)
    && configuredFeeRate >= 0
    && configuredFeeRate < 0.9
      ? configuredFeeRate
      : 0;
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
      installmentFeeRate,
      installments: 3
    });
  } catch (error) {
    console.error("mercadopago-health", error);
    return res.status(503).json({ connected: false, reason: "unavailable" });
  }
};
