import { PRODUCT_CATALOG } from "./catalog.js";
import { getServerConfig } from "./config.js";

const PAYMENT_STATUS = "Pendiente de pago";
const MAX_ITEMS = 30;
const MAX_REQUEST_BYTES = 64 * 1024;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE,
    customer_id INTEGER,
    created_at TEXT NOT NULL,
    customer_first_name TEXT NOT NULL,
    customer_last_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    delivery_type TEXT NOT NULL,
    delivery_label TEXT NOT NULL,
    delivery_address TEXT NOT NULL,
    subtotal INTEGER NOT NULL,
    discount INTEGER NOT NULL DEFAULT 0,
    shipping_cost INTEGER NOT NULL,
    total INTEGER NOT NULL,
    payment_method TEXT NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'Pendiente de pago',
    order_status TEXT NOT NULL DEFAULT 'pendiente',
    mercado_pago_payment_id TEXT,
    tracking_code TEXT,
    observations TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  )`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    size TEXT NOT NULL,
    color TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price INTEGER NOT NULL,
    line_total INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  )`,
  `CREATE TABLE IF NOT EXISTS notification_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    channel TEXT NOT NULL,
    recipient TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_message_id TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  )`,
  "CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id)",
  "CREATE INDEX IF NOT EXISTS notification_logs_order_id_idx ON notification_logs(order_id)",
  "CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders(customer_id)",
  "CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(order_status)"
];

function json(data, status = 200) {
  return secureResponse(new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  }));
}

function secureResponse(response) {
  const secured = new Response(response.body, response);
  secured.headers.set("x-content-type-options", "nosniff");
  secured.headers.set("x-frame-options", "DENY");
  secured.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  secured.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );
  return secured;
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function getShippingCost(delivery, subtotal) {
  const type = cleanText(delivery?.value, 40);
  const requestedCost = Number(delivery?.cost);
  const allowedCosts = {
    "correo-sucursal": [0, 5500, 6500, 7200],
    "correo-domicilio": [0, 7800, 9800, 9900],
    punto: [0, 4500],
    encuentro: [0, 1500, 2000]
  };

  if (!allowedCosts[type]?.includes(requestedCost)) {
    throw new Error("La modalidad o el costo de entrega no son válidos.");
  }
  if (requestedCost === 0 && type !== "encuentro" && subtotal < 120000) {
    throw new Error("El envío gratis no corresponde al subtotal informado.");
  }

  return { type, label: cleanText(delivery.label, 140), cost: requestedCost };
}

function validateOrder(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Pedido inválido.");

  const customer = {
    firstName: cleanText(payload.customer?.firstName, 80),
    lastName: cleanText(payload.customer?.lastName, 80),
    phone: cleanText(payload.customer?.phone, 40),
    email: cleanText(payload.customer?.email, 160).toLowerCase()
  };

  if (!customer.firstName || !customer.lastName) throw new Error("Falta el nombre de la clienta.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) throw new Error("Correo electrónico inválido.");
  if (!/[\d]{6,}/.test(customer.phone.replace(/\D/g, ""))) throw new Error("Teléfono inválido.");

  if (!Array.isArray(payload.items) || payload.items.length === 0 || payload.items.length > MAX_ITEMS) {
    throw new Error("El pedido no contiene productos válidos.");
  }

  const items = payload.items.map((item) => {
    const productId = Number(item.id);
    const product = PRODUCT_CATALOG[productId];
    const size = cleanText(item.size, 40);
    const color = cleanText(item.color, 60);
    const quantity = Number(item.quantity);

    const availableStock = product?.stock?.[`${size}|${color}`] || 0;
    if (!product || availableStock === 0) {
      throw new Error("Uno de los productos o variantes no es válido.");
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > availableStock) {
      throw new Error("Cantidad de producto inválida.");
    }

    return {
      productId,
      productName: product.name,
      size,
      color,
      quantity,
      unitPrice: product.price,
      lineTotal: product.price * quantity
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const discount = 0;
  const delivery = getShippingCost(payload.delivery, subtotal);
  const total = subtotal - discount + delivery.cost;
  const paymentMethod = cleanText(payload.payment?.label || payload.payment?.value, 80);
  if (!paymentMethod) throw new Error("Método de pago inválido.");

  const address = {
    province: cleanText(payload.address?.province, 80),
    city: cleanText(payload.address?.city, 100),
    postalCode: cleanText(payload.address?.postalCode, 12),
    street: cleanText(payload.address?.street, 120),
    streetNumber: cleanText(payload.address?.streetNumber, 20),
    apartment: cleanText(payload.address?.apartment, 40),
    references: cleanText(payload.address?.references, 300),
    notes: cleanText(payload.address?.notes, 800)
  };
  if (!address.province || !address.city || !address.postalCode || !address.street || !address.streetNumber) {
    throw new Error("La dirección está incompleta.");
  }

  return { customer, items, subtotal, discount, delivery, total, paymentMethod, address };
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  }).format(value);
}

function formatAddress(address) {
  const apartment = address.apartment ? `, ${address.apartment}` : "";
  return `${address.street} ${address.streetNumber}${apartment}, ${address.city}, ${address.province} (${address.postalCode})`;
}

function buildAdminMessage(order, adminUrl) {
  const products = order.items
    .map((item) => `${item.productName} – talle ${item.size} – ${item.color} – x${item.quantity}`)
    .join("; ");
  const orderUrl = adminUrl ? `${adminUrl}/pedidos/${encodeURIComponent(order.orderNumber)}` : "Panel no configurado";

  return [
    `🛍️ Nuevo pedido: ${order.orderNumber}`,
    `Fecha: ${order.createdAt}`,
    `Clienta: ${order.customer.firstName} ${order.customer.lastName}`,
    `Teléfono: ${order.customer.phone}`,
    `Email: ${order.customer.email}`,
    `Productos: ${products}`,
    `Entrega: ${order.delivery.label} — ${formatAddress(order.address)}`,
    `Subtotal: ${formatCurrency(order.subtotal)}`,
    `Descuento: ${formatCurrency(order.discount)}`,
    `Envío: ${formatCurrency(order.delivery.cost)}`,
    `Total: ${formatCurrency(order.total)}`,
    `Pago: ${order.paymentMethod}`,
    `Estado: ${PAYMENT_STATUS}`,
    `Observaciones: ${order.address.notes || "Sin observaciones"}`,
    `Pedido: ${orderUrl}`
  ].join("\n");
}

async function ensureSchema(db) {
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
}

async function saveOrder(db, order) {
  const createdAt = new Date().toISOString();
  const address = formatAddress(order.address);
  const observations = [
    order.address.references && `Referencias: ${order.address.references}`,
    order.address.notes && `Observaciones: ${order.address.notes}`
  ].filter(Boolean).join("\n");

  await db
    .prepare(
      `INSERT INTO customers (
        first_name, last_name, email, phone, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        phone = excluded.phone,
        updated_at = excluded.updated_at`
    )
    .bind(
      order.customer.firstName,
      order.customer.lastName,
      order.customer.email,
      order.customer.phone,
      createdAt,
      createdAt
    )
    .run();

  const customer = await db
    .prepare("SELECT id FROM customers WHERE email = ?")
    .bind(order.customer.email)
    .first();

  const inserted = await db
    .prepare(
      `INSERT INTO orders (
        order_number, customer_id, created_at, customer_first_name, customer_last_name,
        customer_phone, customer_email, delivery_type, delivery_label,
        delivery_address, subtotal, discount, shipping_cost, total,
        payment_method, payment_status, observations
      ) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      customer?.id || null,
      createdAt,
      order.customer.firstName,
      order.customer.lastName,
      order.customer.phone,
      order.customer.email,
      order.delivery.type,
      order.delivery.label,
      address,
      order.subtotal,
      order.discount,
      order.delivery.cost,
      order.total,
      order.paymentMethod,
      PAYMENT_STATUS,
      observations
    )
    .run();

  const orderId = Number(inserted.meta.last_row_id);
  const orderNumber = `ARV-${String(orderId).padStart(4, "0")}`;

  const statements = [
    db.prepare("UPDATE orders SET order_number = ? WHERE id = ?").bind(orderNumber, orderId),
    ...order.items.map((item) =>
      db
        .prepare(
          `INSERT INTO order_items (
            order_id, product_id, product_name, size, color,
            quantity, unit_price, line_total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          orderId,
          item.productId,
          item.productName,
          item.size,
          item.color,
          item.quantity,
          item.unitPrice,
          item.lineTotal
        )
    )
  ];
  await db.batch(statements);

  return { ...order, orderId, orderNumber, createdAt };
}

async function logNotification(db, orderId, recipient, status, messageId = null, error = null) {
  await db
    .prepare(
      `INSERT INTO notification_logs (
        order_id, channel, recipient, status, provider_message_id, error_message, created_at
      ) VALUES (?, 'whatsapp', ?, ?, ?, ?, ?)`
    )
    .bind(orderId, recipient, status, messageId, error, new Date().toISOString())
    .run();
}

async function notifyAdmins(db, order, config) {
  const settings = config.whatsapp;
  const configured = Boolean(
    config.adminWhatsAppNumbers.length &&
    settings.phoneNumberId &&
    settings.accessToken &&
    settings.templateName
  );

  if (!configured) {
    await logNotification(db, order.orderId, config.adminWhatsAppNumbers[0] || "", "skipped", null, "WhatsApp API no configurada.");
    return { sent: false, configured: false };
  }

  const message = buildAdminMessage(order, config.adminBaseUrl);
  let allSent = true;

  for (const recipient of config.adminWhatsAppNumbers) {
    try {
      const response = await fetch(
        `https://graph.facebook.com/${settings.apiVersion}/${settings.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${settings.accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: recipient,
            type: "template",
            template: {
              name: settings.templateName,
              language: { code: settings.templateLanguage },
              components: [
                {
                  type: "body",
                  parameters: [{ type: "text", text: message }]
                }
              ]
            }
          })
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "La API rechazó la notificación.");
      await logNotification(db, order.orderId, recipient, "sent", result.messages?.[0]?.id || null);
    } catch (error) {
      allSent = false;
      await logNotification(db, order.orderId, recipient, "failed", null, cleanText(error.message, 500));
    }
  }

  return { sent: allSent, configured: true };
}

async function createOrder(request, env) {
  if (!env.DB) return json({ error: "La base de datos todavía no está configurada." }, 503);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return json({ error: "El pedido debe enviarse como JSON." }, 415);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return json({ error: "El pedido supera el tamaño permitido." }, 413);
  }

  let payload;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return json({ error: "El pedido supera el tamaño permitido." }, 413);
    }
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "El cuerpo del pedido debe ser JSON." }, 400);
  }

  try {
    const validated = validateOrder(payload);
    await ensureSchema(env.DB);
    const order = await saveOrder(env.DB, validated);
    let notification = { sent: false, configured: false };
    try {
      notification = await notifyAdmins(env.DB, order, getServerConfig(env));
    } catch {
      notification = { sent: false, configured: true };
    }

    return json(
      {
        order: {
          orderNumber: order.orderNumber,
          createdAt: order.createdAt,
          subtotal: order.subtotal,
          discount: order.discount,
          shippingCost: order.delivery.cost,
          total: order.total,
          paymentStatus: PAYMENT_STATUS
        },
        notification
      },
      201
    );
  } catch (error) {
    return json({ error: cleanText(error.message, 500) || "No se pudo registrar el pedido." }, 400);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/orders" && request.method === "POST") {
      return createOrder(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Ruta no encontrada." }, 404);
    }

    const response = env.ASSETS
      ? await env.ASSETS.fetch(request)
      : new Response("Arvel Custom API", { status: 200 });
    return secureResponse(response);
  }
};
