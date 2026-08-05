(async function () {
  "use strict";

  const authenticated = await (window.ARVEL_CHECKOUT_AUTH_READY || Promise.resolve(false));
  if (!authenticated) return;

  const FREE_SHIPPING_THRESHOLD = 100000;
  const products = await (
    window.ARVEL_PRODUCTS_READY ||
    Promise.resolve(Array.isArray(window.ARVEL_PRODUCTS) ? window.ARVEL_PRODUCTS : [])
  );
  let cart = window.ArvelStore.readStoredArray(window.ArvelStore.storageKeys.cart);
  let preparedOrder = null;
  let receiptObjectUrl = "";

  const elements = {
    empty: document.querySelector("#checkout-empty"),
    content: document.querySelector("#checkout-content"),
    form: document.querySelector("#checkout-form"),
    globalError: document.querySelector("#checkout-global-error"),
    progressSteps: document.querySelectorAll("[data-checkout-step]"),
    items: document.querySelector("#checkout-items"),
    subtotal: document.querySelector("#checkout-subtotal"),
    shipping: document.querySelector("#checkout-shipping"),
    total: document.querySelector("#checkout-total"),
    deliveryGroup: document.querySelector("#delivery-group"),
    paymentGroup: document.querySelector("#payment-group"),
    mercadopagoInstallments: document.querySelector("#mercadopago-installments"),
    cashChoice: document.querySelector("#cash-choice"),
    cashInput: document.querySelector('input[value="efectivo"]'),
    postalCode: document.querySelector("#postal-code"),
    dniField: document.querySelector("#dni-field"),
    dni: document.querySelector("#dni"),
    correoBranchInput: document.querySelector('input[name="delivery"][value="correo-sucursal"]'),
    correoHomeInput: document.querySelector('input[name="delivery"][value="correo-domicilio"]'),
    correoBranchCostLabel: document.querySelector("#correo-branch-cost-label"),
    correoHomeCostLabel: document.querySelector("#correo-home-cost-label"),
    province: document.querySelector("#province"),
    correoAgencySelector: document.querySelector("#correo-agency-selector"),
    correoAgency: document.querySelector("#correo-agency"),
    correoAgencyAddress: document.querySelector("#correo-agency-address"),
    correoAgencyStatus: document.querySelector("#correo-agency-status"),
    homeDeliveryFields: document.querySelectorAll("[data-home-delivery-field]"),
    meetingPointSelector: document.querySelector("#meeting-point-selector"),
    meetingPoint: document.querySelector("#meeting-point"),
    meetingPointCost: document.querySelector("#meeting-point-cost"),
    confirmation: document.querySelector("#order-confirmation"),
    confirmationName: document.querySelector("#confirmation-name"),
    confirmationOrder: document.querySelector("#confirmation-order-number"),
    confirmationSummary: document.querySelector("#confirmation-summary"),
    confirmationWhatsApp: document.querySelector("#confirmation-whatsapp"),
    confirmationWhatsAppLabel: document.querySelector("#confirmation-whatsapp-label"),
    confirmationNotice: document.querySelector("#confirmation-notice"),
    transferAlias: document.querySelector("#transfer-alias"),
    copyTransferAlias: document.querySelector("#copy-transfer-alias"),
    transferWallet: document.querySelector("#transfer-wallet"),
    transferHolder: document.querySelector("#transfer-holder"),
    transferCvu: document.querySelector("#transfer-cvu"),
    receipt: document.querySelector("#payment-receipt"),
    receiptPreview: document.querySelector("#receipt-preview"),
    receiptPreviewImage: document.querySelector("#receipt-preview-image"),
    receiptFileName: document.querySelector("#receipt-file-name"),
    receiptFileSize: document.querySelector("#receipt-file-size"),
    receiptError: document.querySelector("#receipt-error"),
    receiptHelp: document.querySelector("#receipt-help"),
    removeReceipt: document.querySelector("#remove-receipt")
  };

  function findProduct(itemOrId) {
    const key = String(
      typeof itemOrId === "object"
        ? itemOrId?.documentId || itemOrId?.id || ""
        : itemOrId ?? ""
    );
    return products.find(
      (product) =>
        String(product.documentId || product.id || "") === key ||
        String(product.id ?? "") === key
    );
  }

  function getVariantStock(product, size, color) {
    const key = `${size}|${color}`;
    if (Object.hasOwn(product.stockByVariant, key)) return product.stockByVariant[key];
    return Object.keys(product.stockByVariant).length ? 0 : product.stock;
  }

  function getValidCart() {
    return cart.filter((item) => {
      const product = findProduct(item);
      if (!product || product.soldOut || product.archived || item.quantity <= 0) return false;
      return item.quantity <= getVariantStock(product, item.size, item.color);
    });
  }

  function getSubtotal() {
    return cart.reduce((total, item) => {
      const product = findProduct(item);
      return total + (product ? product.price * item.quantity : 0);
    }, 0);
  }

  function getDelivery() {
    const selected = elements.form.elements.delivery?.value;
    if (!selected) return null;
    const input = elements.form.querySelector(`input[name="delivery"][value="${selected}"]`);
    const meetingOption = elements.meetingPoint?.selectedOptions?.[0];
    const agencyName = elements.correoAgency?.value?.trim() || "";
    const isMeeting = selected === "encuentro";
    const baseCost = isMeeting
      ? Number(meetingOption?.dataset.cost || 0)
      : Number(input.dataset.cost);
    const canBeFree = selected.startsWith("correo-") || selected === "punto";
    const freeByThreshold = getSubtotal() >= FREE_SHIPPING_THRESHOLD && canBeFree;
    return {
      value: selected,
      label: isMeeting && meetingOption?.value
        ? `${input.dataset.label} · ${meetingOption.value}`
        : selected === "correo-sucursal" && agencyName
          ? `${input.dataset.label} · ${agencyName}`
          : input.dataset.label,
      cost: freeByThreshold ? 0 : baseCost,
      agencyId: ""
    };
  }

  function getPayment() {
    const selected = elements.form.elements.payment?.value;
    if (!selected) return null;
    const input = elements.form.querySelector(`input[name="payment"][value="${selected}"]`);
    let installments = null;
    let paymentType = selected;

    if (selected === "mercadopago") {
      const installmentValue = elements.form.elements.installments?.value || "1";
      if (installmentValue === "dinero") {
        paymentType = "mercadopago_money";
        installments = null;
      } else {
        paymentType = "mercadopago_card";
        installments = installmentValue;
      }
    }

    return { value: selected, label: input.dataset.label, installments, paymentType };
  }

  function updateInstallmentsPrices() {
    const subtotal = getSubtotal();
    const delivery = getDelivery();
    const shipping = delivery?.cost || 0;
    const total = subtotal + shipping;

    // Comisiones de Mercado Pago según método de pago
    const commissions = {
      dinero: 0.0629,    // Dinero en Mercado Pago: 6.29%
      1: 0.0629,         // 1 cuota (tarjeta): 6.29%
      2: 0.0779,         // 2 cuotas (tarjeta): 7.79%
      3: 0.1049          // 3 cuotas (tarjeta): 10.49%
    };

    const prices = {};
    for (const [method, commission] of Object.entries(commissions)) {
      const priceWithCommission = total / (1 - commission);
      if (method === "dinero") {
        prices.dinero = Math.round(priceWithCommission * 100) / 100;
      } else {
        const cuotas = Number(method);
        prices[cuotas] = Math.round((priceWithCommission / cuotas) * 100) / 100;
      }
    }

    // Actualizar dinero en Mercado Pago
    const dineroElement = document.querySelector("#installments-dinero-price");
    if (dineroElement) {
      dineroElement.textContent = window.Arvel.formatPrice(prices.dinero);
    }

    // Actualizar cuotas con tarjeta
    for (const [cuotas, price] of Object.entries(prices)) {
      if (cuotas !== "dinero") {
        const priceElement = document.querySelector(`#installments-${cuotas}-price`);
        if (priceElement) {
          priceElement.textContent = `${window.Arvel.formatPrice(price)} c/u`;
        }
      }
    }
  }

  function updateInstallmentsVisibility() {
    const paymentMethod = elements.form.elements.payment?.value;
    if (elements.mercadopagoInstallments) {
      elements.mercadopagoInstallments.hidden = paymentMethod !== "mercadopago";
      if (paymentMethod === "mercadopago") {
        updateInstallmentsPrices();
      }
    }
  }

  function renderItems() {
    elements.items.innerHTML = cart
      .map((item) => {
        const product = findProduct(item);
        if (!product) return "";
        const image = product.images[0] || "assets/images/moodboard/arvel-editorial-hero.png";
        return `
          <article class="checkout-item">
            <img src="${image}" alt="" width="90" height="120">
            <div>
              <h3>${product.name}</h3>
              <p>${item.size} · ${item.color} · Cant. ${item.quantity}</p>
            </div>
            <strong>${window.Arvel.formatPrice(product.price * item.quantity)}</strong>
          </article>
        `;
      })
      .join("");
  }

  function updateTotals() {
    const subtotal = getSubtotal();
    const delivery = getDelivery();
    const shipping = delivery?.cost || 0;
    elements.subtotal.textContent = window.Arvel.formatPrice(subtotal);
    elements.shipping.textContent = delivery
      ? shipping === 0
        ? "Gratis"
        : window.Arvel.formatPrice(shipping)
      : "A calcular";
    elements.total.textContent = window.Arvel.formatPrice(subtotal + shipping);
  }

  function updatePaymentAvailability() {
    return;
  }

  function updateDniAvailability() {
    if (!elements.dniField || !elements.dni) return;
    elements.dniField.hidden = false;
    elements.dni.required = true;
  }

  function updateDeliveryFields() {
    const isHome = elements.form.elements.delivery?.value === "correo-domicilio";
    elements.homeDeliveryFields.forEach((wrapper) => {
      wrapper.hidden = !isHome;
      wrapper.querySelectorAll("input, textarea").forEach((field) => {
        field.required = isHome;
        if (!isHome) field.removeAttribute("aria-invalid");
      });
    });
  }

  function updateMeetingAvailability() {
    if (!elements.meetingPointSelector || !elements.meetingPoint) return;

    const isMeeting = elements.form.elements.delivery?.value === "encuentro";
    elements.meetingPointSelector.hidden = !isMeeting;
    elements.meetingPoint.required = isMeeting;

    if (!isMeeting) {
      elements.meetingPoint.value = "";
      elements.meetingPoint.removeAttribute("aria-invalid");
      document.querySelector("#meeting-point-error").textContent = "";
      return;
    }

    const option = elements.meetingPoint.selectedOptions[0];
    const cost = Number(option?.dataset.cost || 0);
    elements.meetingPointCost.textContent = option?.value
      ? `${cost === 0 ? "Sin viático" : `Viático: ${window.Arvel.formatPrice(cost)}`}. Día y horario a coordinar.`
      : "El día y horario se coordinan después de confirmar la compra.";
  }

  function updateCorreoEstimate() {
    const itemCount = cart.reduce((total, item) => total + item.quantity, 0);
    const estimate = window.ArvelShipping.estimate(elements.postalCode.value, itemCount);

    if (!estimate) {
      elements.correoBranchInput.dataset.cost = "5500";
      elements.correoHomeInput.dataset.cost = "7800";
      elements.correoBranchCostLabel.textContent = "Ingresá un CP válido para estimar el costo.";
      elements.correoHomeCostLabel.textContent = "Ingresá un CP válido para estimar el costo.";
      updateTotals();
      return;
    }

    elements.postalCode.value = estimate.postalCode;
    elements.correoBranchInput.dataset.cost = String(estimate.branchCost);
    elements.correoHomeInput.dataset.cost = String(estimate.homeCost);
    elements.correoBranchCostLabel.textContent =
      `${window.Arvel.formatPrice(estimate.branchCost)} estimados · ${estimate.minDays} a ${estimate.maxDays} días hábiles.`;
    elements.correoHomeCostLabel.textContent =
      `${window.Arvel.formatPrice(estimate.homeCost)} estimados · ${estimate.minDays} a ${estimate.maxDays} días hábiles.`;
    updateTotals();
  }

  function updateCorreoAgencyAvailability() {
    if (!elements.correoAgencySelector || !elements.correoAgency) return;
    const isBranch = elements.form.elements.delivery?.value === "correo-sucursal";
    elements.correoAgencySelector.hidden = !isBranch;
    elements.correoAgency.required = isBranch;
    if (elements.correoAgencyAddress) elements.correoAgencyAddress.required = isBranch;
  }

  function getErrorElement(input) {
    return document.querySelector(`#${input.id}-error`);
  }

  function getFieldMessage(input) {
    if (input.validity.valueMissing) return "Este campo es obligatorio.";
    if (input.validity.typeMismatch) return "Ingresá un formato válido.";
    if (input.validity.patternMismatch) {
      return input.name === "dni"
        ? "Ingresá 7 u 8 números, sin puntos."
        : "Revisá el formato ingresado.";
    }
    if (input.validity.tooShort) return `Ingresá al menos ${input.minLength} caracteres.`;
    if (input.validity.tooLong) return `Ingresá como máximo ${input.maxLength} caracteres.`;
    return "";
  }

  function clearErrors() {
    elements.form.querySelectorAll("[aria-invalid]").forEach((field) => {
      field.removeAttribute("aria-invalid");
      field.removeAttribute("aria-describedby");
    });
    elements.form.querySelectorAll(".field-error").forEach((error) => {
      error.textContent = "";
    });
    elements.globalError.textContent = "";
  }

  function updateCheckoutProgress(activeSection = null) {
    elements.progressSteps.forEach((step) => {
      const section = document.querySelector(`#${step.dataset.checkoutStep}`);
      if (!section) return;

      const requiredFields = [...section.querySelectorAll("[required]:not(:disabled)")];
      const radioNames = new Set(
        requiredFields
          .filter((field) => field.type === "radio")
          .map((field) => field.name)
      );
      const regularFields = requiredFields.filter((field) => field.type !== "radio");
      const radiosComplete = [...radioNames].every((name) =>
        section.querySelector(`input[name="${name}"]:checked`)
      );
      const complete =
        regularFields.every((field) => field.checkValidity()) &&
        radiosComplete;

      step.classList.toggle("is-complete", complete);
      step.classList.toggle("is-active", step.dataset.checkoutStep === activeSection);
      step.setAttribute(
        "aria-label",
        `${step.querySelector("strong").textContent}: ${complete ? "completo" : "pendiente"}`
      );
    });
  }

  function validateForm() {
    clearErrors();
    const invalidFields = [];
    const fields = elements.form.querySelectorAll(
      "input:not([type='radio']):not([type='checkbox']), select, textarea"
    );

    fields.forEach((input) => {
      if (input.checkValidity()) return;
      const error = getErrorElement(input);
      if (error) {
        error.textContent = getFieldMessage(input);
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", error.id);
      }
      invalidFields.push(input);
    });

    const delivery = getDelivery();
    if (!delivery) {
      document.querySelector("#delivery-error").textContent = "Elegí un método de entrega.";
      elements.deliveryGroup.setAttribute("aria-invalid", "true");
      invalidFields.push(elements.form.querySelector('input[name="delivery"]'));
    }

    const payment = getPayment();
    if (!payment) {
      document.querySelector("#payment-error").textContent = "Elegí un método de pago.";
      elements.paymentGroup.setAttribute("aria-invalid", "true");
      invalidFields.push(elements.form.querySelector('input[name="payment"]:not(:disabled)'));
    }

    const terms = document.querySelector("#terms");
    if (!terms.checked) {
      document.querySelector("#terms-error").textContent = "Necesitamos que aceptes los términos para continuar.";
      terms.setAttribute("aria-invalid", "true");
      terms.setAttribute("aria-describedby", "terms-error");
      invalidFields.push(terms);
    }

    const privacy = document.querySelector("#privacy");
    if (!privacy.checked) {
      document.querySelector("#privacy-error").textContent = "Necesitamos tu autorización para preparar el pedido.";
      privacy.setAttribute("aria-invalid", "true");
      privacy.setAttribute("aria-describedby", "privacy-error");
      invalidFields.push(privacy);
    }

    if (invalidFields.length) {
      elements.globalError.textContent = "Revisá los campos marcados antes de continuar.";
      invalidFields[0]?.focus();
      return false;
    }

    return true;
  }

  function generateOrderNumber() {
    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    ].join("");
    const random = Math.floor(1000 + Math.random() * 9000);
    return `ARV-${date}-${random}`;
  }

  function buildOrderData(orderNumber = null) {
    const data = new FormData(elements.form);
    const delivery = getDelivery();
    const payment = getPayment();
    const subtotal = getSubtotal();
    const total = subtotal + delivery.cost;

    return {
      orderNumber,
      createdAt: new Date(),
      discount: 0,
      customer: {
        fullName: data.get("fullName").trim(),
        email: data.get("email").trim(),
        phone: data.get("phone").trim(),
        dni: data.get("dni").trim()
      },
      address: {
        province: data.get("province"),
        city: data.get("city").trim(),
        postalCode: data.get("postalCode").trim(),
        street: data.get("street").trim(),
        streetNumber: data.get("streetNumber").trim(),
        apartment: data.get("apartment").trim(),
        references: data.get("deliveryReferences").trim(),
        agencyName: String(data.get("correoAgency") || "").trim(),
        agencyAddress: String(data.get("correoAgencyAddress") || "").trim(),
        notes: data.get("notes").trim()
      },
      delivery,
      payment,
      subtotal,
      total,
      items: cart.map((item) => ({
        ...item,
        product: findProduct(item)
      }))
    };
  }

  function buildWhatsAppMessage(order, hasReceipt = false) {
    const productLines = order.items.map((item, index) =>
      `${index + 1}. *${item.product.name}*\n` +
      `   📏 Talle: ${item.size} · 🎨 Color: ${item.color}\n` +
      `   🔢 Cantidad: ${item.quantity} · 💲 ${window.Arvel.formatPrice(item.product.price * item.quantity)}`
    );
    const deliveryLines = order.delivery.value === "correo-sucursal"
      ? [
          `🏤 Sucursal: ${order.address.agencyName}`,
          `📍 Dirección: ${order.address.agencyAddress}`
        ]
      : order.delivery.value === "encuentro"
        ? [
            `🤝 Punto coordinado: ${elements.meetingPoint?.value || "A coordinar"}`,
            "🗓️ Día y horario: a coordinar con la vendedora"
          ]
      : [
          `🏠 Domicilio: ${order.address.street} ${order.address.streetNumber}${order.address.apartment ? `, ${order.address.apartment}` : ""}`,
          order.address.references ? `↔️ Entre calles: ${order.address.references}` : null
        ];

    return [
      "🛙️ *NUEVO PEDIDO ARVEL*",
      "Hola, quiero enviar este pedido para revisión.",
      "",
      "🔖 *DATOS DEL PEDIDO*",
      `Pedido: *${order.orderNumber}*`,
      `📅 Fecha: ${new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(order.createdAt)}`,
      "",
      "👤 *DATOS DE LA CLIENTA*",
      `Nombre: ${order.customer.fullName}`,
      `📱 Teléfono: ${order.customer.phone}`,
      `✉️ Correo: ${order.customer.email}`,
      order.customer.dni ? `🪪 DNI: ${order.customer.dni}` : null,
      "",
      "🛍️ *PRODUCTOS*",
      ...productLines,
      "",
      "💳 *PAGO*",
      `Método: ${order.payment.label}`,
      `Subtotal: ${window.Arvel.formatPrice(order.subtotal)}`,
      `Envío: ${order.delivery.cost === 0 ? "GRATIS" : window.Arvel.formatPrice(order.delivery.cost)}`,
      `💰 *TOTAL: ${window.Arvel.formatPrice(order.total)}*`,
      window.ARVEL_TRANSFER?.alias ? `Alias: *${window.ARVEL_TRANSFER.alias}*` : null,
      window.ARVEL_TRANSFER?.wallet ? `Billetera: ${window.ARVEL_TRANSFER.wallet}` : null,
      "",
      "📦 *ENTREGA*",
      `Modalidad: ${order.delivery.label}`,
      ...deliveryLines,
      `📍 Localidad: ${order.address.city}, ${order.address.province}`,
      `📮 Código postal: ${order.address.postalCode}`,
      order.address.notes ? `📝 Observaciones: ${order.address.notes}` : null,
      "",
      "🧾 *COMPROBANTE*",
      hasReceipt
        ? "✅ Confirmo que realicé la transferencia y adjunto el comprobante."
        : "⏳ Todavía no adjunté el comprobante de pago.",
      "",
      "⚠️ *IMPORTANTE*",
      "El pedido se considera enviado cuando confirme este mensaje. Queda sujeto a verificación de stock y acreditación del pago."
    ]
      .filter((line) => line !== null && line !== undefined)
      .join("\n");
  }

  function showConfirmation(order) {
    preparedOrder = order;
    elements.content.hidden = true;
    elements.confirmation.hidden = false;
    elements.confirmationName.textContent = order.customer.fullName;
    elements.confirmationOrder.textContent = order.orderNumber;
    elements.confirmationSummary.innerHTML = `
      <dl>
        <div><dt>Productos</dt><dd>${order.items.reduce((total, item) => total + item.quantity, 0)}</dd></div>
        <div><dt>Entrega</dt><dd>${order.delivery.label}</dd></div>
        <div><dt>Pago</dt><dd>${order.payment.label}</dd></div>
        <div><dt>Subtotal</dt><dd>${window.Arvel.formatPrice(order.subtotal)}</dd></div>
        <div><dt>Envío</dt><dd>${order.delivery.cost === 0 ? "Sin costo" : window.Arvel.formatPrice(order.delivery.cost)}</dd></div>
        <div><dt>Total</dt><dd>${window.Arvel.formatPrice(order.total)}</dd></div>
      </dl>
    `;
    elements.confirmationNotice.textContent =
      "El pedido todavía no fue recibido, guardado, cobrado ni reservado. Para enviarlo a Arvel tenés que tocar el botón y confirmar el mensaje en WhatsApp.";
    elements.confirmationWhatsAppLabel.textContent = "Abrir WhatsApp y enviar comprobante";
    const alias = String(window.ARVEL_TRANSFER?.alias || "").trim();
    elements.transferAlias.textContent = alias || "Alias todavía no configurado";
    elements.transferWallet.textContent = window.ARVEL_TRANSFER?.wallet || "";
    elements.transferHolder.textContent = window.ARVEL_TRANSFER?.holder || "";
    elements.transferCvu.textContent = window.ARVEL_TRANSFER?.cvu || "";
    elements.copyTransferAlias.disabled = !alias;
    elements.confirmation.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearReceipt() {
    if (receiptObjectUrl) URL.revokeObjectURL(receiptObjectUrl);
    receiptObjectUrl = "";
    elements.receipt.value = "";
    elements.receiptPreview.hidden = true;
    elements.receiptPreviewImage.hidden = true;
    elements.receiptPreviewImage.removeAttribute("src");
    elements.receiptFileName.textContent = "";
    elements.receiptFileSize.textContent = "";
    elements.receiptError.textContent = "";
  }

  function updateReceiptPreview() {
    const file = elements.receipt.files?.[0];
    elements.receiptError.textContent = "";
    if (!file) {
      clearReceipt();
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      clearReceipt();
      elements.receiptError.textContent = "El comprobante supera los 10 MB. Elegí un archivo más liviano.";
      return;
    }
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) {
      clearReceipt();
      elements.receiptError.textContent = "Usá una imagen JPG, PNG, WEBP o un archivo PDF.";
      return;
    }
    if (receiptObjectUrl) URL.revokeObjectURL(receiptObjectUrl);
    receiptObjectUrl = "";
    elements.receiptPreview.hidden = false;
    elements.receiptFileName.textContent = file.name;
    elements.receiptFileSize.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
    if (file.type.startsWith("image/")) {
      receiptObjectUrl = URL.createObjectURL(file);
      elements.receiptPreviewImage.src = receiptObjectUrl;
      elements.receiptPreviewImage.hidden = false;
    } else {
      elements.receiptPreviewImage.hidden = true;
    }
  }

  async function sendOrderWithReceipt() {
    if (!preparedOrder) return;
    const file = elements.receipt.files?.[0];
    if (!file) {
      elements.receiptError.textContent = "Subí el comprobante antes de enviar el pedido.";
      elements.receipt.focus();
      return;
    }

    const message = buildWhatsAppMessage(preparedOrder, true);
    elements.receiptError.textContent = "";
    const adminNumber = String(window.ARVEL_TRANSFER?.whatsappNumber || "5491160153234")
      .replace(/\D/g, "");
    const whatsappUrl = `https://wa.me/${adminNumber}?text=${encodeURIComponent(message)}`;
    const whatsappWindow = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    if (!whatsappWindow) window.location.href = whatsappUrl;
    elements.receiptHelp.textContent =
      "Se abrió el chat administrativo de Arvel al +54 9 11 6015-3234 con todos tus datos. WhatsApp no permite adjuntar el archivo desde un enlace: tocá el clip, elegí el comprobante y enviá el mensaje.";
  }

  async function startMercadoPago(order) {
    const submit = elements.form.querySelector('[type="submit"]');
    const originalLabel = submit.textContent;
    submit.disabled = true;
    submit.textContent = "Conectando con Mercado Pago…";
    elements.globalError.textContent = "";

    try {
      const paymentApiBase = String(
        window.ARVEL_PAYMENT_API_BASE || window.ARVEL_API_BASE || ""
      ).replace(/\/+$/, "");
      if (!paymentApiBase) {
        throw new Error("Falta configurar la dirección segura de Mercado Pago.");
      }

      const response = await fetch(
        `${paymentApiBase}/api/create-mercadopago-preference`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${await window.ARVEL_CHECKOUT_USER.getIdToken()}`
          },
          body: JSON.stringify({
            orderNumber: order.orderNumber,
            customer: order.customer,
            delivery: {
              method: order.delivery.value,
              postalCode: order.address.postalCode,
              meetingPoint: elements.meetingPoint?.value || "",
              agencyId: order.delivery.agencyId || ""
            },
            address: order.address,
            installments: order.payment.installments ? Number(order.payment.installments) : 0,
            paymentType: order.payment.paymentType,
            items: order.items.map((item) => ({
              documentId: item.product.documentId || item.documentId || "",
              variant_id: item.variant_id || item.variantId || `${item.product.documentId || item.documentId || item.product.id}::${item.size}::${item.color}`,
              size: item.size,
              color: item.color,
              quantity: item.quantity
            }))
          })
        }
      );
      const contentType = response.headers.get("content-type") || "";
      const result = contentType.includes("application/json")
        ? await response.json()
        : { error: "El servidor de pagos devolvió una respuesta inválida." };
      if (!response.ok || !result.checkoutUrl) {
        throw new Error(result.error || "No pudimos iniciar Mercado Pago.");
      }
      location.href = result.checkoutUrl;
    } catch (error) {
      const networkFailure = error instanceof TypeError && /fetch|network|load/i.test(error.message || "");
      elements.globalError.textContent = networkFailure
        ? "No pudimos comunicarnos con Mercado Pago. Actualizá la página e intentá nuevamente. Si continúa, el servicio de pagos necesita un nuevo despliegue."
        : error.message || "No pudimos conectar con Mercado Pago. Intentá nuevamente.";
      submit.disabled = false;
      submit.textContent = originalLabel;
    }
  }

  function bindEvents() {
    elements.copyTransferAlias?.addEventListener("click", async () => {
      const alias = String(window.ARVEL_TRANSFER?.alias || "").trim();
      if (!alias) return;
      await navigator.clipboard.writeText(alias);
      elements.copyTransferAlias.textContent = "Alias copiado ✓";
    });
    elements.receipt?.addEventListener("change", updateReceiptPreview);
    elements.removeReceipt?.addEventListener("click", clearReceipt);
    elements.confirmationWhatsApp?.addEventListener("click", sendOrderWithReceipt);
    elements.postalCode.addEventListener("change", updateCorreoEstimate);
    elements.postalCode.addEventListener("blur", updateCorreoEstimate);
    elements.form.addEventListener("change", (event) => {
      if (event.target.name === "delivery") {
        updateMeetingAvailability();
        updateCorreoAgencyAvailability();
        updateDeliveryFields();
        updateDniAvailability();
        updatePaymentAvailability();
        updateTotals();
        updateInstallmentsVisibility();
      }
      if (event.target.name === "meetingPoint") {
        updateMeetingAvailability();
        updateTotals();
        updateInstallmentsVisibility();
      }
      if (event.target.name === "payment") {
        updateInstallmentsVisibility();
      }
      if (event.target.name === "installments") {
        updateCheckoutProgress(event.target.closest(".checkout-block")?.id || null);
      }
      if (event.target.name === "province") {
        updateCorreoAgencyAvailability();
      }
      if (event.target.matches("[aria-invalid]")) {
        event.target.removeAttribute("aria-invalid");
        const error = getErrorElement(event.target);
        if (error) error.textContent = "";
      }
      updateCheckoutProgress(event.target.closest(".checkout-block")?.id || null);
    });

    elements.form.addEventListener("input", (event) => {
      updateCheckoutProgress(event.target.closest(".checkout-block")?.id || null);
    });

    elements.form.addEventListener("focusin", (event) => {
      updateCheckoutProgress(event.target.closest(".checkout-block")?.id || null);
    });

    elements.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!validateForm()) return;
      const order = buildOrderData(generateOrderNumber());
      if (order.payment.value === "mercadopago") {
        await startMercadoPago(order);
        return;
      }
      showConfirmation(order);
    });

    updateCheckoutProgress("checkout-customer");
  }

  cart = getValidCart();
  const hasItems = cart.length > 0;
  elements.empty.hidden = hasItems;
  elements.content.hidden = !hasItems;

  if (hasItems) {
    renderItems();
    updateMeetingAvailability();
    updateCorreoAgencyAvailability();
    updateDeliveryFields();
    updateDniAvailability();
    updatePaymentAvailability();
    updateTotals();
    updateInstallmentsVisibility();
    bindEvents();
  }
})();
