const { getAdminDb, verifyFirebaseUser } = require("./_firebase-admin");

const ALLOWED_ORIGINS = new Set([
  "https://arvelcustomy2k.store", "https://www.arvelcustomy2k.store",
  "https://web-arvel-y2-k.vercel.app", "https://rosario234576-cyber.github.io"
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
function cleanText(value, limit = 160) { return String(value || "").trim().slice(0, limit); }
function validOrderNumber(value) { return /^ARV-\d{8}-\d{4}$/.test(String(value || "")); }
function shippingZone(postalCode) {
  const code = cleanText(postalCode, 12).replace(/\s+/g, "").toUpperCase();
  const letters = { C: "near", B: "near", X: "middle", S: "middle", E: "middle", L: "middle", M: "middle", D: "middle", J: "middle", A: "far", F: "far", G: "far", H: "far", K: "far", N: "far", P: "far", T: "far", W: "far", Y: "far", Q: "far", R: "far", U: "far", Z: "far", V: "far" };
  if (/^[A-Z]\d{4}[A-Z]{3}$/.test(code)) return letters[code[0]] || null;
  if (!/^\d{4}$/.test(code)) return null;
  const number = Number(code);
  if (number >= 1000 && number <= 1999) return "near";
  if (number >= 2000 && number <= 3999) return "middle";
  if (number >= 4000 && number <= 5999) return "far";
  if (number >= 6000 && number <= 7999) return "middle";
  if (number >= 8000 && number <= 9999) return "far";
  return null;
}
function calculateShipping(delivery, subtotal) {
  const method = cleanText(delivery?.method, 40);
  if (subtotal >= 100000 && ["correo-sucursal", "correo-domicilio", "punto"].includes(method)) return 0;
  if (method === "punto") return 4500;
  if (method === "encuentro") {
    const points = { "Estación Once": 0, "Congreso de la Nación": 0, "Estación SUBTE Congreso (Línea A)": 0, Obelisco: 1500, "Abasto Shopping": 1500, "Teatro Colón": 1500, "Facultad de Medicina": 1500, "Plaza de Mayo": 1500, Constitución: 1500, "Estación Retiro": 1500, "Barrio Chino": 2000, "Shopping Alto Palermo": 2000, "Parque Centenario": 2000, "Parque Patricios": 2000 };
    return Object.hasOwn(points, delivery?.meetingPoint) ? points[delivery.meetingPoint] : null;
  }
  if (!["correo-sucursal", "correo-domicilio"].includes(method)) return null;
  const zone = shippingZone(delivery?.postalCode);
  const rates = { near: { "correo-sucursal": 5500, "correo-domicilio": 7800 }, middle: { "correo-sucursal": 6500, "correo-domicilio": 9800 }, far: { "correo-sucursal": 7200, "correo-domicilio": 9900 } };
  return zone ? rates[zone][method] : null;
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  try {
    const user = await verifyFirebaseUser(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const orderNumber = cleanText(body.orderNumber, 32);
    const requestedItems = Array.isArray(body.items) ? body.items : [];
    const customer = body.customer || {}, address = body.address || {}, delivery = body.delivery || {};
    if (!validOrderNumber(orderNumber) || !requestedItems.length || requestedItems.length > 30) return res.status(400).json({ error: "El pedido no tiene datos válidos." });
    const db = getAdminDb(), items = [];
    for (const requested of requestedItems) {
      const documentId = cleanText(requested.documentId, 160), size = cleanText(requested.size, 40), color = cleanText(requested.color, 60);
      const quantity = Math.max(1, Math.min(10, Math.floor(Number(requested.quantity) || 0)));
      if (!documentId || !size || !color) return res.status(400).json({ error: "Falta una variante del producto." });
      const snapshot = await db.collection("products").doc(documentId).get(), product = snapshot.exists ? snapshot.data() : null;
      if (!product || product.status !== "published") return res.status(409).json({ error: "Una pieza ya no está disponible." });
      const variantKey = `${size}|${color}`, stock = Number(product.stockByVariant?.[variantKey] || 0), unitPrice = Math.round(Number(product.transferPrice || product.price) || 0);
      if (stock < quantity || unitPrice <= 0) return res.status(409).json({ error: `No hay stock disponible de ${product.name || "esta pieza"}.` });
      items.push({ documentId, variantId: cleanText(requested.variant_id || requested.variantId, 240), variantKey, title: cleanText(product.name, 140), sku: cleanText(product.sku, 80), size, color, quantity, unitPrice, lineTotal: unitPrice * quantity });
    }
    const subtotal = items.reduce((total, item) => total + item.lineTotal, 0), shippingCost = calculateShipping(delivery, subtotal);
    if (shippingCost === null) return res.status(400).json({ error: "Revisá la modalidad de entrega y el código postal." });
    const fullName = cleanText(customer.fullName, 160), nameParts = fullName.split(/\s+/).filter(Boolean);
    const normalizedCustomer = { fullName, firstName: cleanText(customer.firstName || nameParts[0], 80), lastName: cleanText(customer.lastName || nameParts.slice(1).join(" "), 80), email: cleanText(customer.email || user.email, 160), phone: cleanText(customer.phone, 40), dni: cleanText(customer.dni, 30) };
    const normalizedAddress = { province: cleanText(address.province, 80), city: cleanText(address.city, 100), postalCode: cleanText(address.postalCode, 12), street: cleanText(address.street, 120), streetNumber: cleanText(address.streetNumber, 30), apartment: cleanText(address.apartment, 80), references: cleanText(address.references, 300), agencyName: cleanText(address.agencyName, 120), agencyAddress: cleanText(address.agencyAddress, 200), meetingPoint: cleanText(address.meetingPoint, 120), notes: cleanText(address.notes, 500) };
    const shipping = { type: cleanText(delivery.method, 40), province: normalizedAddress.province, city: normalizedAddress.city, postalCode: normalizedAddress.postalCode, street: normalizedAddress.street, number: normalizedAddress.streetNumber, floorApartment: normalizedAddress.apartment, reference: normalizedAddress.references, branch: { name: normalizedAddress.agencyName, address: normalizedAddress.agencyAddress }, meetingPoint: cleanText(delivery.meetingPoint || normalizedAddress.meetingPoint, 120) };
    const now = new Date(), orderRef = db.collection("orders").doc(orderNumber), existing = await orderRef.get();
    if (existing.exists && existing.data()?.uid !== user.uid) return res.status(409).json({ error: "No pudimos generar un número de pedido único." });
    const order = { orderNumber, uid: user.uid, customer: normalizedCustomer, address: normalizedAddress, shipping, delivery: { method: shipping.type, postalCode: shipping.postalCode, meetingPoint: shipping.meetingPoint }, items, subtotal, discount: 0, shippingCost, total: subtotal + shippingCost, currency: "ARS", paymentMethod: "transferencia", paymentStatus: "pending", status: "pending_payment", stockCommitted: false, source: "web", createdAt: existing.exists ? existing.data().createdAt || now : now, updatedAt: now };
    await orderRef.set(order, { merge: true });
    await db.collection("users").doc(user.uid).collection("orders").doc(orderNumber).set({ orderNumber, status: order.status, paymentStatus: order.paymentStatus, total: order.total, currency: order.currency, createdAt: order.createdAt, updatedAt: now }, { merge: true });
    return res.status(201).json({ ok: true, orderNumber, total: order.total });
  } catch (error) {
    console.error("create-transfer-order", error);
    if (String(error?.message) === "AUTH_REQUIRED") return res.status(401).json({ error: "Iniciá sesión para continuar." });
    return res.status(500).json({ error: "No pudimos registrar el pedido. Intentá nuevamente." });
  }
};
