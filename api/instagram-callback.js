const crypto = require("crypto");

function getRedirectUri(req) {
  if (process.env.INSTAGRAM_REDIRECT_URI) return process.env.INSTAGRAM_REDIRECT_URI;
  const protocol = req.headers["x-forwarded-proto"] || "https";
  return `${protocol}://${req.headers.host}/api/instagram-callback`;
}
function escapeHtml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function render(res, title, body, status = 200) {
  res.status(status).setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.end(`<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;background:#180b13;color:#fff;font:16px Arial,sans-serif;display:grid;min-height:100vh;place-items:center}.card{width:min(680px,calc(100% - 40px));background:#fff;color:#171217;border-radius:24px;padding:32px;box-sizing:border-box}.eyebrow{letter-spacing:.16em;text-transform:uppercase;font-size:12px;font-weight:800;color:#d62d91}h1{font-family:Georgia,serif;font-size:42px;margin:10px 0 16px}textarea{box-sizing:border-box;width:100%;min-height:130px;border:1px solid #aaa;border-radius:12px;padding:12px;overflow-wrap:anywhere}a{display:inline-block;margin-top:14px;border-radius:999px;background:#ed4fb1;color:#111;padding:13px 20px;font-weight:800;text-decoration:none}.note{color:#625b60;line-height:1.5}</style><main class="card"><span class="eyebrow">Arvel · Meta</span><h1>${escapeHtml(title)}</h1>${body}</main></html>`);
}
function validState(state, secret) {
  const [nonce, signature] = String(state || "").split(".");
  if (!nonce || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(nonce).digest("hex");
  const a = Buffer.from(signature); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return render(res, "Metodo no permitido", "<p>Volvé al panel administrador.</p>", 405);
  const appId = process.env.INSTAGRAM_APP_ID;
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !secret) return render(res, "Falta configurar Vercel", "<p>Agregá las variables privadas de Meta y volvé a intentarlo.</p>", 503);
  if (req.query.error) return render(res, "Autorización cancelada", `<p>${escapeHtml(req.query.error_description || req.query.error)}</p><a href="/admin-productos.html">Volver</a>`, 400);
  if (!validState(req.query.state, secret)) return render(res, "Solicitud no válida", "<p>Iniciá la conexión nuevamente desde el panel.</p>", 400);
  try {
    const form = new URLSearchParams({ client_id: appId, client_secret: secret, grant_type: "authorization_code", redirect_uri: getRedirectUri(req), code: String(req.query.code || "") });
    const shortResponse = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
    const shortData = await shortResponse.json();
    if (!shortResponse.ok || !shortData.access_token) throw new Error(shortData.error_message || "Meta no devolvió un token válido.");
    const longUrl = new URL("https://graph.instagram.com/access_token");
    longUrl.searchParams.set("grant_type", "ig_exchange_token"); longUrl.searchParams.set("client_secret", secret); longUrl.searchParams.set("access_token", shortData.access_token);
    const longResponse = await fetch(longUrl); const longData = await longResponse.json();
    const token = longResponse.ok && longData.access_token ? longData.access_token : shortData.access_token;
    const userId = shortData.user_id || process.env.INSTAGRAM_USER_ID || "";
    return render(res, "Instagram autorizado", `<p class="note">Copiá estos valores directamente a Vercel. El token se muestra una sola vez; no lo publiques ni lo subas a GitHub.</p><p><strong>INSTAGRAM_ACCESS_TOKEN</strong></p><textarea readonly onclick="this.select()">${escapeHtml(token)}</textarea><p><strong>INSTAGRAM_USER_ID:</strong> ${escapeHtml(userId)}</p><p><strong>INSTAGRAM_USERNAME:</strong> arvel.customsy2k</p><a href="/admin-productos.html">Volver al administrador</a>`);
  } catch (error) {
    return render(res, "No se pudo conectar Instagram", `<p>${escapeHtml(error.message)}</p><a href="/admin-productos.html">Volver e intentar nuevamente</a>`, 502);
  }
};
