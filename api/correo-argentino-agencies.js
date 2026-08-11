const ALLOWED_ORIGINS = new Set([
  "https://arvelcustomy2k.store",
  "https://www.arvelcustomy2k.store",
  "https://rosario234576-cyber.github.io",
  "https://web-arvel-y2-k.vercel.app"
]);

const STATE_CODES = new Set("ABCDEFGHJKLMNPQRSTUVWXYZ".split(""));

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function clean(value, max = 160) {
  return String(value || "").trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido." });

  const apiKey = process.env.CORREO_ARGENTINO_API_KEY;
  const agreement = process.env.CORREO_ARGENTINO_AGREEMENT;
  const baseUrl = clean(
    process.env.CORREO_ARGENTINO_API_BASE_URL ||
      "https://api.correoargentino.com.ar/paqar/v1",
    240
  ).replace(/\/$/, "");

  if (!apiKey || !agreement) {
    return res.status(503).json({
      error: "Correo Argentino todavía no está configurado.",
      code: "CORREO_NOT_CONFIGURED"
    });
  }

  const stateId = clean(req.query?.stateId, 1).toUpperCase();
  if (stateId && !STATE_CODES.has(stateId)) {
    return res.status(400).json({ error: "Código de provincia inválido." });
  }

  const query = new URLSearchParams({ pickup_availability: "true" });
  if (stateId) query.set("stateId", stateId);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const response = await fetch(`${baseUrl}/agencies?${query}`, {
      headers: {
        Authorization: `Apikey ${apiKey}`,
        agreement,
        Accept: "application/json"
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("Correo Argentino agencies", response.status, result);
      return res.status(response.status === 401 || response.status === 403 ? 503 : 502).json({
        error: response.status === 401 || response.status === 403
          ? "Las credenciales de Correo Argentino no fueron aceptadas."
          : "Correo Argentino no pudo consultar las sucursales."
      });
    }

    const agencies = (Array.isArray(result) ? result : [])
      .filter((agency) => agency?.pickup_availability !== false)
      .map((agency) => ({
        id: clean(agency.agency_id, 30),
        name: clean(agency.agency_name, 120),
        address: clean([agency.location?.street_name, agency.location?.street_number].filter(Boolean).join(" "), 180),
        city: clean(agency.location?.city_name, 100),
        province: clean(agency.location?.state_name, 100),
        postalCode: clean(agency.location?.zip_code, 12),
        schedule: clean(agency.schedule, 180)
      }))
      .filter((agency) => agency.id && agency.name)
      .sort((a, b) => `${a.city} ${a.name}`.localeCompare(`${b.city} ${b.name}`, "es"));

    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json({ agencies });
  } catch (error) {
    console.error("correo-argentino-agencies", error);
    return res.status(502).json({ error: "Correo Argentino no está respondiendo en este momento." });
  }
};
