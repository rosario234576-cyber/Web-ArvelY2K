const { Timestamp } = require("firebase-admin/firestore");
const { getAdminDb, verifyFirebaseUser } = require("./_firebase-admin");

function allowCors(req, res) {
  const origins = new Set([
    "https://arvelcustomy2k.store", "https://www.arvelcustomy2k.store",
    "https://web-arvel-y2-k.vercel.app", "https://rosario234576-cyber.github.io"
  ]);
  const origin = req.headers.origin;
  if (origins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

function rows(map) {
  return [...map.entries()].map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function increase(map, label) {
  const key = label || "Sin dato";
  map.set(key, (map.get(key) || 0) + 1);
}

module.exports = async function handler(req, res) {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido." });
  try {
    const decoded = await verifyFirebaseUser(req);
    const db = getAdminDb();
    const admin = await db.collection("admins").doc(decoded.uid).get();
    if (!admin.exists) return res.status(403).json({ error: "No tenés acceso a las métricas." });

    const now = new Date();
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - 6);
    const [recentSnapshot, totalSnapshot] = await Promise.all([
      db.collection("analytics_events").where("createdAt", ">=", Timestamp.fromDate(start)).orderBy("createdAt", "asc").get(),
      db.collection("analytics_events").count().get()
    ]);
    const devices = new Map(); const browsers = new Map(); const systems = new Map();
    const pages = new Map(); const products = new Map(); const visitors = new Set(); const sessions = new Set();
    const dailyVisitors = new Map();
    let pageViews = 0; let productViews = 0; let productClicks = 0; let addToCart = 0; let checkoutStarts = 0; let sessionEnds = 0;
    for (const document of recentSnapshot.docs) {
      const event = document.data();
      const type = event.eventType || "";
      visitors.add(event.visitorId || document.id);
      sessions.add(event.sessionId || document.id);
      if (type === "page_view") {
        pageViews += 1;
        increase(devices, event.deviceType);
        increase(browsers, event.browser);
        increase(systems, event.operatingSystem);
        increase(pages, event.pageTitle || event.pagePath);
        const day = event.day || "Sin fecha";
        if (!dailyVisitors.has(day)) dailyVisitors.set(day, new Set());
        dailyVisitors.get(day).add(event.visitorId || document.id);
      }
      if (type === "product_view") productViews += 1;
      if (type === "product_click") productClicks += 1;
      if (type === "add_to_cart") addToCart += 1;
      if (type === "checkout_start") checkoutStarts += 1;
      if (type === "session_end") sessionEnds += 1;
      if (["product_view", "product_click", "add_to_cart", "checkout_start"].includes(type) && (event.productName || event.productId)) {
        const label = event.productName || `Producto ${event.productId}`;
        increase(products, label);
      }
    }
    const timeline = [];
    for (let index = 6; index >= 0; index -= 1) {
      const day = new Date(now);
      day.setUTCHours(0, 0, 0, 0);
      day.setUTCDate(day.getUTCDate() - index);
      const key = day.toISOString().slice(0, 10);
      timeline.push({
        label: key,
        shortLabel: day.toLocaleDateString("es-AR", { weekday: "short", day: "numeric" }).replace(".", ""),
        value: (dailyVisitors.get(key) || new Set()).size
      });
    }
    return res.status(200).json({
      generatedAt: now.toISOString(),
      totalEvents: totalSnapshot.data().count || 0,
      summary: { uniqueVisitors: visitors.size, sessions: sessions.size, sessionEnds, pageViews, productViews, productClicks, addToCart, checkoutStarts },
      devices: rows(devices), browsers: rows(browsers), operatingSystems: rows(systems),
      topPages: rows(pages), topProducts: rows(products), timeline
    });
  } catch (error) {
    console.error("admin-metrics", error);
    const status = error && error.message === "AUTH_REQUIRED" ? 401 : 500;
    return res.status(status).json({ error: status === 401 ? "Tu sesión venció. Volvé a ingresar." : "No pudimos cargar las métricas." });
  }
};
