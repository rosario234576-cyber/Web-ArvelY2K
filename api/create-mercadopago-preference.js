const { getAdminDb, verifyFirebaseUser } = require("./_firebase-admin");

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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function cleanText(value, maxLength = 120) {
  return String(value || "").trim().slice(0, maxLength);
}

function readFeeRate(name, fallback = null) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 && value < 0.9 ? value : fallback;
}

function getPaymentTypeConfig(paymentType) {
  const types = {
    // Mercado Pago no aplica una comisión de tarjeta a una transferencia.
    mercadopago_money: { installments: 0, feeRate: readFeeRate("MP_MONEY_FEE_RATE", 0) },
    mercadopago_card_1: { installments: 1, feeRate: readFeeRate("MP_CARD_1_FEE_RATE") },
    mercadopago_card_2: { installments: 2, feeRate: readFeeRate("MP_CARD_2_FEE_RATE") },
    mercadopago_card_3: { installments: 3, feeRate: readFeeRate("MP_CARD_3_FEE_RATE") }
  };
  return types[paymentType] || null;
}

function grossUpPrice(basePrice, feeRate) {
  const base = Math.round(Number(basePrice) || 0);
  if (base <= 0) return 0;
  if (!feeRate) return base;
  // El precio publicado es el neto que debe recibir Arvel. Redondeamos hacia
  // arriba a $100 para que el cargo de Mercado Pago no reduzca ese importe.
  return Math.ceil((base / (1 - feeRate)) / 100) * 100;
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
  // La preferencia se crea en el servidor y nunca debe depender de la API key
  // pública de Firebase. Así se valida precio, stock y estado directamente
  // contra Firestore con las credenciales privadas de Vercel.
  const snapshot = await getAdminDb().collection("products").doc(documentId).get();
  if (!snapshot.exists) return null;
  const product = snapshot.data() || {};
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
    let authUser;
    try {
      authUser = await verifyFirebaseUser(req);
    } catch (error) {
      return res.status(401).json({ error: "Inicia sesion para continuar con la compra." });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const orderNumber = cleanText(body?.orderNumber, 32);
    const customer = body?.customer || {};
    const requestedItems = Array.isArray(body?.items) ? body.items : [];
    const delivery = body?.delivery || {};
    const address = body?.address || {};

    const paymentType = cleanText(body?.paymentType || "mercadopago_money", 30);
    const paymentConfig = getPaymentTypeConfig(paymentType);
    if (!paymentConfig) {
      return res.status(400).json({ error: "La opción de pago seleccionada no es válida." });
    }
    if (paymentConfig.feeRate === null) {
      return res.status(503).json({
        error: "Las cuotas todavía no están configuradas. Elegí transferencia o dinero disponible."
      });
    }
    const installments = paymentConfig.installments;

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

      const variantKey = `${size}|${color}`;
      // Compatibilidad con piezas cargadas antes de que existieran las variantes.
      const hasVariantStock = Boolean(product.stockByVariant && Object.keys(product.stockByVariant).length);
      const stock = hasVariantStock
        ? Number(product.stockByVariant[variantKey] || 0)
        : Number(product.stock || 0);
      const transferPrice = Math.round(Number(product.transferPrice || product.price) || 0);
      // El backend siempre calcula el importe desde Firestore: nunca se confía
      // en un precio enviado por el navegador.
      const priceWithCommission = grossUpPrice(transferPrice, paymentConfig.feeRate);
      if (stock < quantity || priceWithCommission <= 0) {
        return res.status(409).json({ error: `No hay stock disponible de ${product.name}.` });
      }

      items.push({
        id: documentId,
        documentId,
        size,
        color,
        variantKey,
        title: cleanText(`${product.name} · ${size} · ${color}`, 120),
        quantity,
        currency_id: "ARS",
        unit_price: priceWithCommission,
        base_unit_price: transferPrice
      });
    }

    // Envío y precio de referencia se calculan sobre el valor de transferencia.
    const subtotalWithCommission = items.reduce(
      (total, item) => total + item.unit_price * item.quantity,
      0
    );
    // Para calcular envío, usar el precio base sin comisión
    const baseSubtotal = items.reduce(
      (total, item) => total + item.base_unit_price * item.quantity,
      0
    );
    const shippingCost = calculateShipping(delivery, baseSubtotal);
    if (shippingCost === null) {
      return res.status(400).json({ error: "La modalidad de entrega no es válida." });
    }

    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const apiBase = `https://${host}`;
    const storeBase = "https://www.arvelcustomy2k.store";
    const fullName = cleanText(customer.fullName, 160).split(/\s+/).filter(Boolean);
    const preference = {
      items: items.map(({ id, title, quantity, currency_id, unit_price }) => ({
        id, title, quantity, currency_id, unit_price
      })),
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
      metadata: {
        order_number: orderNumber,
        installments: installments,
        payment_type: paymentType,
        commission_rate: paymentConfig.feeRate
      }
    };
    // Para "dinero disponible" dejamos que Mercado Pago muestre sus métodos.
    // Para tarjeta limitamos la cantidad de cuotas solicitada.
    if (installments > 0) {
      preference.payment_methods = {
        installments,
        default_installments: installments
      };
    }

    const db = getAdminDb();
    const orderRef = db.collection("orders").doc(orderNumber);
    const existingOrder = await orderRef.get();
    if (existingOrder.exists && existingOrder.data()?.uid !== authUser.uid) {
      return res.status(409).json({ error: "El numero de pedido ya existe." });
    }
    const now = new Date();
    await orderRef.set({
      orderNumber,
      uid: authUser.uid,
      customer: {
        fullName: cleanText(customer.fullName, 160),
        firstName: cleanText(customer.firstName, 80),
        lastName: cleanText(customer.lastName, 80),
        email: cleanText(customer.email || authUser.email, 160),
        phone: cleanText(customer.phone, 40),
        dni: cleanText(customer.dni, 20)
      },
      address,
      shipping: {
        type: cleanText(delivery.method, 40),
        province: cleanText(address.province, 80),
        city: cleanText(address.city, 100),
        postalCode: cleanText(address.postalCode, 20),
        street: cleanText(address.street, 120),
        number: cleanText(address.streetNumber, 20),
        floorApartment: cleanText(address.apartment, 80),
        reference: cleanText(address.references, 500),
        branch: {
          name: cleanText(address.agencyName, 120),
          address: cleanText(address.agencyAddress, 200)
        },
        meetingPoint: cleanText(delivery.meetingPoint || address.meetingPoint, 120)
      },
      delivery,
      items: items.map(({ documentId, title, quantity, unit_price, size, color, variantKey }) => ({
        documentId, title, quantity, unitPrice: unit_price, size, color, variantKey
      })),
      subtotal: subtotalWithCommission,
      transferSubtotal: baseSubtotal,
      paymentFeeRate: paymentConfig.feeRate,
      paymentFeeAmount: subtotalWithCommission - baseSubtotal,
      shippingCost,
      total: subtotalWithCommission + shippingCost,
      currency: "ARS",
      paymentMethod: "mercadopago",
      paymentStatus: "pending",
      status: "pending_payment",
      stockCommitted: false,
      createdAt: existingOrder.exists ? existingOrder.data().createdAt || now : now,
      updatedAt: now
    }, { merge: true });
    // El resumen permite que la clienta consulte el pedido desde Mi cuenta
    // incluso antes de que Mercado Pago confirme el pago por webhook.
    await db.collection("users").doc(authUser.uid).collection("orders").doc(orderNumber).set({
      orderNumber,
      status: "pending_payment",
      paymentStatus: "pending",
      paymentMethod: "mercadopago",
      customer: {
        fullName: cleanText(customer.fullName, 160),
        email: cleanText(customer.email || authUser.email, 160),
        phone: cleanText(customer.phone, 40)
      },
      shipping: {
        type: cleanText(delivery.method, 40),
        province: cleanText(address.province, 80),
        city: cleanText(address.city, 100),
        postalCode: cleanText(address.postalCode, 20),
        branch: {
          name: cleanText(address.agencyName, 120),
          address: cleanText(address.agencyAddress, 200)
        }
      },
      items: items.map(({ documentId, title, quantity, unit_price, size, color, variantKey }) => ({
        documentId, title, quantity, unitPrice: unit_price, size, color, variantKey
      })),
      total: subtotalWithCommission + shippingCost,
      currency: "ARS",
      createdAt: existingOrder.exists ? existingOrder.data().createdAt || now : now,
      updatedAt: now
    }, { merge: true });

    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": orderNumber
      },
      body: JSON.stringify(preference)
    });
    const contentType = response.headers.get("content-type") || "";
    const result = contentType.includes("application/json") ? await response.json() : {};
    if (!response.ok) {
      console.error("Mercado Pago preference error", response.status, result);
      await orderRef.set({ paymentPreferenceStatus: "error", updatedAt: new Date() }, { merge: true });
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
    await orderRef.set({
      mercadoPagoPreferenceId: result.id,
      paymentPreferenceStatus: "created",
      updatedAt: new Date()
    }, { merge: true });
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
