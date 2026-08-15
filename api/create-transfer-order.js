const ALLOWED_ORIGINS = new Set([
  "https://arvelcustomy2k.store", "https://www.arvelcustomy2k.store",
  "https://web-arvel-y2-k.vercel.app", "https://rosario234576-cyber.github.io"
]);
const PAYMENT_WINDOW_MS = 5 * 60 * 1000;
const LEGACY_REVIEW_EXPIRY_MS = 1786768723687;

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
function activeReservations(value, nowMs, excludedOrder) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(Object.entries(source).filter(([orderNumber, reservation]) => {
    const storedExpiry = Number(reservation?.expiresAtMs || 0);
    const expiresAtMs = reservation?.stage === "review" && storedExpiry - nowMs > PAYMENT_WINDOW_MS
      ? Math.min(storedExpiry, LEGACY_REVIEW_EXPIRY_MS)
      : storedExpiry;
    return orderNumber !== excludedOrder && expiresAtMs > nowMs;
  }));
}
function reservedForVariant(reservations, variantKey) {
  return Object.values(reservations).reduce((total, reservation) => total + (Array.isArray(reservation?.items) ? reservation.items : []).filter((item) => item.variantKey === variantKey).reduce((sum, item) => sum + Number(item.quantity || 0), 0), 0);
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  try {
    const { getAdminDb, verifyFirebaseUser } = require("./_firebase-admin");
    const user = await verifyFirebaseUser(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const orderNumber = cleanText(body.orderNumber, 32);
    const requestedItems = Array.isArray(body.items) ? body.items : [];
    const customer = body.customer || {}, address = body.address || {}, delivery = body.delivery || {};
    if (!validOrderNumber(orderNumber) || !requestedItems.length || requestedItems.length > 30) return res.status(400).json({ error: "El pedido no tiene datos válidos." });
    const normalizedRequests = requestedItems.map((requested) => ({ documentId: cleanText(requested.documentId, 160), variantId: cleanText(requested.variant_id || requested.variantId, 240), size: cleanText(requested.size, 40), color: cleanText(requested.color, 60), quantity: Math.max(1, Math.min(10, Math.floor(Number(requested.quantity) || 0))) }));
    if (normalizedRequests.some((item) => !item.documentId || !item.size || !item.color)) return res.status(400).json({ error: "Falta una variante del producto." });

    const db = getAdminDb(), orderRef = db.collection("orders").doc(orderNumber);
    const productRefs = [...new Set(normalizedRequests.map((item) => item.documentId))].map((id) => db.collection("products").doc(id));
    const serverNowMs = Date.now(), expiresAtMs = serverNowMs + PAYMENT_WINDOW_MS;
    let savedOrder;
    await db.runTransaction(async (transaction) => {
      const [existingOrder, ...productSnapshots] = await Promise.all([transaction.get(orderRef), ...productRefs.map((ref) => transaction.get(ref))]);
      if (existingOrder.exists && existingOrder.data()?.uid !== user.uid) throw Object.assign(new Error("Conflicto al generar el pedido."), { statusCode: 409 });
      const productsById = new Map(productSnapshots.map((snapshot) => [snapshot.id, snapshot]));
      const items = [], reservationsByProduct = new Map();
      for (const requested of normalizedRequests) {
        const snapshot = productsById.get(requested.documentId), product = snapshot?.exists ? snapshot.data() : null;
        if (!product || product.status !== "published" || product.soldOut) throw Object.assign(new Error("Una pieza ya no está disponible."), { statusCode: 409 });
        const variantKey = `${requested.size}|${requested.color}`;
        const reservations = reservationsByProduct.get(requested.documentId) || activeReservations(product.reservations, serverNowMs, orderNumber);
        reservationsByProduct.set(requested.documentId, reservations);
        if (Object.keys(reservations).length) throw Object.assign(new Error(`${product.name || "Esta pieza"} está reservada por otra clienta.`), { statusCode: 409 });
        const hasVariantStock = Boolean(product.stockByVariant && Object.keys(product.stockByVariant).length);
        const stock = hasVariantStock ? Number(product.stockByVariant[variantKey] || 0) : Number(product.stock || 0);
        const alreadyRequested = items.filter((item) => item.documentId === requested.documentId && item.variantKey === variantKey).reduce((sum, item) => sum + item.quantity, 0);
        const available = stock - reservedForVariant(reservations, variantKey) - alreadyRequested;
        const unitPrice = Math.round(Number(product.transferPrice || product.price) || 0);
        if (available < requested.quantity || unitPrice <= 0) throw Object.assign(new Error(`No hay stock disponible de ${product.name || "esta pieza"}.`), { statusCode: 409 });
        items.push({ ...requested, variantKey, title: cleanText(product.name, 140), sku: cleanText(product.sku, 80), unitPrice, lineTotal: unitPrice * requested.quantity });
      }
      const subtotal = items.reduce((total, item) => total + item.lineTotal, 0), shippingCost = calculateShipping(delivery, subtotal);
      if (shippingCost === null) throw Object.assign(new Error("Revisá la modalidad de entrega y el código postal."), { statusCode: 400 });
      const fullName = cleanText(customer.fullName, 160), nameParts = fullName.split(/\s+/).filter(Boolean);
      const normalizedCustomer = { fullName, firstName: cleanText(customer.firstName || nameParts[0], 80), lastName: cleanText(customer.lastName || nameParts.slice(1).join(" "), 80), email: cleanText(customer.email || user.email, 160), phone: cleanText(customer.phone, 40), dni: cleanText(customer.dni, 30) };
      const normalizedAddress = { province: cleanText(address.province, 80), city: cleanText(address.city, 100), postalCode: cleanText(address.postalCode, 12), street: cleanText(address.street, 120), streetNumber: cleanText(address.streetNumber, 30), apartment: cleanText(address.apartment, 80), references: cleanText(address.references, 300), agencyName: cleanText(address.agencyName, 120), agencyAddress: cleanText(address.agencyAddress, 200), meetingPoint: cleanText(address.meetingPoint, 120), notes: cleanText(address.notes, 500) };
      const shipping = { type: cleanText(delivery.method, 40), province: normalizedAddress.province, city: normalizedAddress.city, postalCode: normalizedAddress.postalCode, street: normalizedAddress.street, number: normalizedAddress.streetNumber, floorApartment: normalizedAddress.apartment, reference: normalizedAddress.references, branch: { name: normalizedAddress.agencyName, address: normalizedAddress.agencyAddress }, meetingPoint: cleanText(delivery.meetingPoint || normalizedAddress.meetingPoint, 120) };
      const now = new Date(serverNowMs);
      savedOrder = { orderNumber, uid: user.uid, customer: normalizedCustomer, address: normalizedAddress, shipping, delivery: { method: shipping.type, postalCode: shipping.postalCode, meetingPoint: shipping.meetingPoint }, items, subtotal, discount: 0, shippingCost, total: subtotal + shippingCost, currency: "ARS", paymentMethod: "transferencia", paymentStatus: "pending", status: "reserved_pending_payment", stockCommitted: false, reservationExpiresAtMs: expiresAtMs, reservationStage: "payment", source: "web", createdAt: existingOrder.exists ? existingOrder.data().createdAt || now : now, updatedAt: now };
      for (const productRef of productRefs) {
        const reservations = reservationsByProduct.get(productRef.id) || {};
        reservations[orderNumber] = { uid: user.uid, expiresAtMs, stage: "payment", items: items.filter((item) => item.documentId === productRef.id).map((item) => ({ variantKey: item.variantKey, quantity: item.quantity })) };
        transaction.update(productRef, { reservations, updatedAt: now });
      }
      transaction.set(orderRef, savedOrder, { merge: true });
    });
    await db.collection("users").doc(user.uid).collection("orders").doc(orderNumber).set({ orderNumber, status: savedOrder.status, paymentStatus: savedOrder.paymentStatus, total: savedOrder.total, currency: savedOrder.currency, reservationExpiresAtMs: expiresAtMs, createdAt: savedOrder.createdAt, updatedAt: new Date(serverNowMs) }, { merge: true });
    return res.status(201).json({ ok: true, orderNumber, total: savedOrder.total, serverNowMs, expiresAtMs });
  } catch (error) {
    console.error("create-transfer-order", error);
    if (String(error?.message) === "AUTH_REQUIRED") return res.status(401).json({ error: "Iniciá sesión para continuar." });
    return res.status(Number(error?.statusCode) || 500).json({ error: Number(error?.statusCode) ? error.message : "No pudimos reservar el pedido. Intentá nuevamente." });
  }
};
