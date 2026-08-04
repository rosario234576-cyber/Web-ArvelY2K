const ALLOWED_ORIGINS = new Set([
  "https://arvelcustomy2k.store",
  "https://www.arvelcustomy2k.store",
  "https://web-arvel-y2-k.vercel.app",
  "https://rosario234576-cyber.github.io"
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function firestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(firestoreValue);
  }
  if ("mapValue" in value) {
    return firestoreFields(value.mapValue.fields || {});
  }
  return null;
}

function firestoreFields(fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, firestoreValue(value)])
  );
}

function cleanText(value, maxLength = 120) {
  return String(value || "").trim().slice(0, maxLength);
}

function validOrderNumber(value) {
  return /^ARV-\d{8}-\d{4}$/.test(String(value || ""));
}

function shippingZone(postalCode) {
  const code = cleanText(postalCode, 12).replace(/\s+/g, "").toUpperCase();
  const letterZones = {
    C: "near", B: "near",
    X: "middle", S: "middle", E: "middle", L: "middle", M: "middle",
    D: "middle", J: "middle",
    A: "far", F: "far", G: "far", H: "far", K: "far", N: "far",
    P: "far", T: "far", W: "far", Y: "far", Q: "far", R: "far",
    U: "far", Z: "far", V: "far"
  };
  if (/^[A-Z]\d{4}[A-Z]{3}$/.test(code)) return letterZones[code[0]] || null;
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
  if (subtotal >= 100000 && ["correo-sucursal", "correo-domicilio", "punto"].includes(delivery.method)) {
    return 0;
  }
  if (delivery.method === "punto") return 4500;
  if (delivery.method === "encuentro") {
    const meetingCosts = {
      "Estación Once": 0,
      "Congreso de la Nación": 0,
      "Estación SUBTE Congreso (Línea A)": 0,
      "Obelisco": 1500,
      "Abasto Shopping": 1500,
      "Teatro Colón": 1500,
      "Facultad de Medicina": 1500,
      "Plaza de Mayo": 1500,
      "Constitución": 1500,
      "Estación Retiro": 1500,
      "Barrio Chino": 2000,
      "Shopping Alto Palermo": 2000,
      "Parque Centenario": 2000,
      "Parque Patricios": 2000
    };
    const point = cleanText(delivery.meetingPoint, 100);
    return Object.hasOwn(meetingCosts, point) ? meetingCosts[point] : null;
  }
  if (delivery.method === "correo-sucursal" || delivery.method === "correo-domicilio") {
    const zone = shippingZone(delivery.postalCode);
    if (!zone) return null;
    const rates = {
      near: { "correo-sucursal": 5500, "correo-domicilio": 7800 },
      middle: { "correo-sucursal": 6500, "correo-domicilio": 9800 },
      far: { "correo-sucursal": 7200, "correo-domicilio": 9900 }
    };
    return rates[zone][delivery.method];
  }
  return null;
}

async function getPublishedProduct(documentId) {
  const projectId = process.env.FIREBASE_PROJECT_ID || "arvelcustomy2k";
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) throw new Error("Falta FIREBASE_WEB_API_KEY.");

  const path = encodeURIComponent(documentId);
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/products/${path}?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  const document = await response.json();
  const product = firestoreFields(document.fields || {});
  return product.status === "published" ? product : null;
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(503).json({ error: "Mercado Pago todavía no está configurado." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const orderNumber = cleanText(body?.orderNumber, 32);
    const customer = body?.customer || {};
    const requestedItems = Array.isArray(body?.items) ? body.items : [];
    const delivery = body?.delivery || {};

    if (!validOrderNumber(orderNumber)) {
      return res.status(400).json({ error: "Número de pedido inválido." });
    }
    if (!requestedItems.length || requestedItems.length > 30) {
      return res.status(400).json({ error: "El pedido no contiene productos válidos." });
    }

    const items = [];
    for (const requested of requestedItems) {
      const documentId = cleanText(requested.documentId, 160);
      const size = cleanText(requested.size, 40);
      const color = cleanText(requested.color, 60);
      const quantity = Math.max(1, Math.min(10, Math.floor(Number(requested.quantity) || 0)));
      if (!documentId || !size || !color) {
        return res.status(400).json({ error: "Faltan datos de una variante." });
      }

      const product = await getPublishedProduct(documentId);
      if (!product) {
        return res.status(409).json({ error: "Uno de los productos ya no está publicado." });
      }

      const stock = Number(product.stockByVariant?.[`${size}|${color}`] || 0);
      const price = Math.round(Number(product.price) || 0);
      if (stock < quantity || price <= 0) {
        return res.status(409).json({ error: `No hay stock disponible de ${product.name}.` });
      }

      items.push({
        id: documentId,
        title: cleanText(`${product.name} · ${size} · ${color}`, 120),
        quantity,
        currency_id: "ARS",
        unit_price: price
      });
    }

    const subtotal = items.reduce(
      (total, item) => total + item.unit_price * item.quantity,
      0
    );
    const shippingCost = calculateShipping(delivery, subtotal);
    if (shippingCost === null) {
      return res.status(400).json({ error: "La modalidad de entrega no es válida." });
    }

    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const apiBase = `https://${host}`;
    const storeBase = "https://www.arvelcustomy2k.store";
    const fullName = cleanText(customer.fullName, 160).split(/\s+/).filter(Boolean);
    const preference = {
      items,
      payer: {
        name: cleanText(customer.firstName || fullName[0], 80),
        surname: cleanText(customer.lastName || fullName.slice(1).join(" "), 80),
        email: cleanText(customer.email, 160)
      },
      shipments: { cost: shippingCost, mode: "not_specified" },
      external_reference: orderNumber,
      statement_descriptor: "ARVEL CUSTOMS",
      back_urls: {
        success: `${storeBase}/pago-resultado.html?resultado=aprobado`,
        pending: `${storeBase}/pago-resultado.html?resultado=pendiente`,
        failure: `${storeBase}/pago-resultado.html?resultado=rechazado`
      },
      auto_return: "approved",
      notification_url: `${apiBase}/api/mercadopago-webhook`,
      metadata: { order_number: orderNumber }
    };

    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": orderNumber
      },
      body: JSON.stringify(preference)
    });
    const result = await response.json();
    if (!response.ok) {
      console.error("Mercado Pago preference error", response.status, result);
      return res.status(502).json({ error: "Mercado Pago no pudo preparar el pago." });
    }

    const configuredMode = cleanText(process.env.MP_MODE, 20).toLowerCase();
    const testMode = configuredMode
      ? configuredMode !== "production"
      : accessToken.startsWith("TEST-");
    const checkoutUrl = testMode
      ? result.sandbox_init_point || result.init_point
      : result.init_point || result.sandbox_init_point;
    if (!checkoutUrl) {
      console.error("Mercado Pago preference without checkout URL", result);
      return res.status(502).json({ error: "Mercado Pago no devolvió el enlace de pago." });
    }
    return res.status(200).json({
      checkoutUrl,
      preferenceId: result.id,
      mode: testMode ? "test" : "production"
    });
  } catch (error) {
    console.error("create-mercadopago-preference", error);
    return res.status(500).json({ error: "No pudimos preparar el pago." });
  }
};
