function accessToken() {
  return process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN || "";
}

function configured() {
  return Boolean(
    accessToken() &&
    process.env.INSTAGRAM_USER_ID
  );
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    return res.status(200).json({
      connected: configured(),
      canConnect: Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET),
      connectionMode: process.env.FACEBOOK_PAGE_ACCESS_TOKEN ? "facebook" : "instagram",
      username: process.env.INSTAGRAM_USERNAME || ""
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  if (!configured()) {
    return res.status(503).json({ error: "Instagram todavía no está conectado. Completá las variables privadas en Vercel." });
  }

  try {
    const url = new URL(`https://graph.facebook.com/v26.0/${encodeURIComponent(process.env.INSTAGRAM_USER_ID)}/media`);
    url.searchParams.set("fields", "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp");
    url.searchParams.set("limit", "50");
    url.searchParams.set("access_token", accessToken());
    const response = await fetch(url);
    const result = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: result?.error?.message || "Meta rechazó la lectura del feed." });
    return res.status(200).json({
      imported: 0,
      updated: 0,
      detected: Array.isArray(result.data) ? result.data.length : 0,
      message: "Conexión verificada. El feed se leyó correctamente."
    });
  } catch (error) {
    return res.status(502).json({ error: error.message || "No pudimos consultar Instagram." });
  }
};
