const crypto = require("crypto");

function getRedirectUri(req) {
  if (process.env.INSTAGRAM_REDIRECT_URI) return process.env.INSTAGRAM_REDIRECT_URI;
  const protocol = req.headers["x-forwarded-proto"] || "https";
  return `${protocol}://${req.headers.host}/api/instagram-callback`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Metodo no permitido." });
  const appId = process.env.INSTAGRAM_APP_ID;
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !secret) return res.status(503).json({ error: "Faltan INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET en Vercel." });

  const nonce = crypto.randomBytes(18).toString("hex");
  const signature = crypto.createHmac("sha256", secret).update(nonce).digest("hex");
  const params = new URLSearchParams({
    enable_fb_login: "0",
    force_authentication: "1",
    client_id: appId,
    redirect_uri: getRedirectUri(req),
    response_type: "code",
    scope: "instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages",
    state: `${nonce}.${signature}`
  });
  res.setHeader("Cache-Control", "no-store");
  return res.redirect(302, `https://www.instagram.com/oauth/authorize?${params}`);
};
