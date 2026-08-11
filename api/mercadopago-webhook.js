const crypto = require("crypto");
const { getAdminDb } = require("./_firebase-admin");

function validOrderNumber(value) {
  return /^ARV-\d{8}-\d{4}$/.test(String(value || ""));
}

async function registerPayment(payment) {
  const orderNumber = String(payment.external_reference || payment.metadata?.order_number || "");
  if (!validOrderNumber(orderNumber)) return;

  const db = getAdminDb();
  const orderRef = db.collection("orders").doc(orderNumber);
  await db.runTransaction(async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);
    if (!orderSnapshot.exists) return;
    const order = orderSnapshot.data();
    const approved = payment.status === "approved";
    const shouldCommitStock = approved && !order.stockCommitted;
    const productSnapshots = [];

    if (shouldCommitStock) {
      const itemsByProduct = new Map();
      for (const item of order.items || []) {
        const documentId = String(item.documentId || "");
        if (!documentId) continue;
        if (!itemsByProduct.has(documentId)) itemsByProduct.set(documentId, []);
        itemsByProduct.get(documentId).push(item);
      }
      for (const [documentId, items] of itemsByProduct) {
        const ref = db.collection("products").doc(documentId);
        productSnapshots.push({ items, ref, snapshot: await transaction.get(ref) });
      }
    }

    let stockConflict = false;
    const productUpdates = [];
    for (const entry of productSnapshots) {
      const product = entry.snapshot.data();
      const stockByVariant = { ...(product?.stockByVariant || {}) };
      const hasVariantStock = Object.keys(stockByVariant).length > 0;
      let legacyStock = Number(product?.stock || 0);
      if (!entry.snapshot.exists) stockConflict = true;
      for (const item of entry.items) {
        const quantity = Number(item.quantity || 0);
        const current = hasVariantStock
          ? Number(stockByVariant[item.variantKey] || 0)
          : legacyStock;
        if (current < quantity || quantity < 1) {
          stockConflict = true;
          break;
        }
        if (hasVariantStock) stockByVariant[item.variantKey] = current - quantity;
        else legacyStock = current - quantity;
      }
      if (stockConflict) break;
      const totalStock = hasVariantStock
        ? Object.values(stockByVariant).reduce((sum, value) => sum + Number(value || 0), 0)
        : legacyStock;
      productUpdates.push({
        ref: entry.ref,
        data: hasVariantStock
          ? { stockByVariant, stock: totalStock, soldOut: totalStock <= 0, updatedAt: new Date() }
          : { stock: totalStock, soldOut: totalStock <= 0, updatedAt: new Date() }
      });
    }

    if (shouldCommitStock && !stockConflict) {
      productUpdates.forEach((entry) => transaction.update(entry.ref, entry.data));
    }

    const paymentData = {
      mercadoPagoPaymentId: String(payment.id),
      mercadoPagoStatusDetail: String(payment.status_detail || ""),
      paymentStatus: String(payment.status || "pending"),
      paidAmount: Number(payment.transaction_amount || 0),
      updatedAt: new Date()
    };
    if (approved) {
      paymentData.paidAt = payment.date_approved ? new Date(payment.date_approved) : new Date();
      paymentData.status = stockConflict ? "stock_conflict" : "payment_confirmed";
      paymentData.stockCommitted = !stockConflict;
      if (stockConflict) paymentData.adminAttention = "Pago aprobado con conflicto de stock";
    }

    transaction.set(orderRef, paymentData, { merge: true });
    if (order.uid) {
      transaction.set(
        db.collection("users").doc(order.uid).collection("orders").doc(orderNumber),
        { ...order, ...paymentData, orderNumber },
        { merge: true }
      );
    }
  });
}

function isValidSignature(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return process.env.MP_ALLOW_UNSIGNED_WEBHOOKS === "true";

  const signature = String(req.headers["x-signature"] || "");
  const requestId = String(req.headers["x-request-id"] || "");
  const dataId = String(req.query?.["data.id"] || req.body?.data?.id || "");
  const parts = Object.fromEntries(
    signature.split(",").map((part) => part.split("=").map((value) => value.trim()))
  );
  if (!parts.ts || !parts.v1 || !dataId || !requestId) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  const received = Buffer.from(parts.v1, "hex");
  const calculated = Buffer.from(expected, "hex");
  return received.length === calculated.length && crypto.timingSafeEqual(received, calculated);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  if (!isValidSignature(req)) return res.status(401).json({ error: "Firma inválida." });

  const paymentId = String(req.query?.["data.id"] || req.body?.data?.id || "");
  if (!paymentId) return res.status(200).json({ received: true });

  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    const payment = await response.json();
    if (!response.ok) return res.status(200).json({ received: true });

    console.log("Mercado Pago payment", {
      paymentId: payment.id,
      orderNumber: payment.external_reference,
      status: payment.status,
      statusDetail: payment.status_detail
    });
    await registerPayment(payment);
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("mercadopago-webhook", error);
    return res.status(200).json({ received: true });
  }
};
