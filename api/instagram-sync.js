function configured() {
  return Boolean(
    process.env.INSTAGRAM_ACCESS_TOKEN &&
    process.env.INSTAGRAM_USER_ID &&
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL &&
    process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY
  );
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    return res.status(200).json({
      connected: configured(),
      username: process.env.INSTAGRAM_USERNAME || ""
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido." });
  }

  if (!configured()) {
    return res.status(503).json({
      error: "Instagram todavía no está conectado. Completá las variables privadas en Vercel."
    });
  }

  return res.status(501).json({
    error: "La conexión está configurada, pero falta autorizar la primera sincronización con Meta."
  });
};
