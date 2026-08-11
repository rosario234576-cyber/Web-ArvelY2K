const { FieldValue } = require("firebase-admin/firestore");
const { getAdminDb } = require("./_firebase-admin");

const ALLOWED_ORIGINS = new Set([
  "https://www.arvelcustomy2k.store",
  "https://arvelcustomy2k.store",
  "https://web-arvel-y2-k.vercel.app",
  "https://rosario234576-cyber.github.io"
]);

const ALLOWED_EVENTS = new Set([
  "page_view", "session_end", "product_click", "product_view", "add_to_cart",
  "cart_view", "checkout_start", "checkout_view", "checkout_complete", "favorite_add"
]);

function text(value, max) {
  return String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

function allowedId(value) {
  const sanitized = text(value, 100);
  return /^[a-z0-9-]{8,100}$/i.test(sanitized) ? sanitized : "";
}

function deviceFromUserAgent(ua) {
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobile|android|iphone|ipod|phone/i.test(ua)) return "mobile";
  return "desktop";
}

function browserFromUserAgent(ua) {
  if (/edg/i.test(ua)) return "Edge";
  if (/firefox/i.test(ua)) return "Firefox";
  if (/chrome|crios/i.test(ua) && !/edg/i.test(ua)) return "Chrome";
  if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) return "Safari";
  return "Otro";
}

function osFromUserAgent(ua) {
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/android/i.test(ua)) return "Android";
  if (/windows/i.test(ua)) return "Windows";
  if (/mac os|macintosh/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Otro";
}

module.exports = async function handler(req, res) {
  const origin = String(req.headers.origin || "");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ error: "Origen no autorizado." });
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const eventType = text(payload.eventType, 48);
    const visitorId = allowedId(payload.visitorId);
    const sessionId = allowedId(payload.sessionId);
    if (!ALLOWED_EVENTS.has(eventType) || !visitorId || !sessionId) {
      return res.status(400).json({ error: "Evento inválido." });
    }
    const ua = text(req.headers["user-agent"], 400);
    await getAdminDb().collection("analytics_events").add({
      eventType,
      visitorId,
      sessionId,
      pagePath: text(payload.pagePath, 180) || "/",
      pageTitle: text(payload.pageTitle, 160),
      productId: text(payload.productId, 120),
      productName: text(payload.productName, 120),
      source: text(payload.source, 80),
      deviceType: deviceFromUserAgent(ua),
      browser: browserFromUserAgent(ua),
      operatingSystem: osFromUserAgent(ua),
      day: new Date().toISOString().slice(0, 10),
      createdAt: FieldValue.serverTimestamp()
    });
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error("analytics-event", error);
    return res.status(500).json({ error: "No se pudo registrar la métrica." });
  }
};
