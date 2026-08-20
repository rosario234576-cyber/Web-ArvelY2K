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
  let reservationTimerId = null;
  let reservationClockOffset = 0;

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
    mercadopagoOption: document.querySelector("#mercadopago-payment-option"),
    mercadopagoInput: document.querySelector('input[name="payment"][value="mercadopago"]'),
    manualMpBase: document.querySelector("#manual-mp-base"),
    manualMpFee: document.querySelector("#manual-mp-fee"),
    manualMpFinal: document.querySelector("#manual-mp-final"),
    manualMpInstallmentTotal: document.querySelector("#manual-mp-installment-total"),
    mercadopagoMinimumNote: document.querySelector("#mercadopago-minimum-note"),
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
    correoAgencySelect: document.querySelector("#correo-agency-select"),
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
    reservationTimer: document.querySelector("#reservation-timer"),
    reservationCountdown: document.querySelector("#reservation-countdown"),
    transferAlias: document.querySelector("#transfer-alias"),
    copyTransferAlias: document.querySelector("#copy-transfer-alias"),
    transferWallet: document.querySelector("#transfer-wallet"),
    transferHolder: document.querySelector("#transfer-holder"),
    transferCvu: document.querySelector("#transfer-cvu")
  };

  const correoProvinceCodes = Object.freeze({
    "salta": "A", "buenos aires": "B", "ciudad autonoma de buenos aires": "C",
    "san luis": "D", "entre rios": "E", "la rioja": "F", "santiago del estero": "G",
    "chaco": "H", "san juan": "J", "catamarca": "K", "la pampa": "L", "mendoza": "M",
    "misiones": "N", "formosa": "P", "neuquen": "Q", "rio negro": "R", "santa fe": "S",
    "tucuman": "T", "chubut": "U", "tierra del fuego": "V", "corrientes": "W",
    "cordoba": "X", "jujuy": "Y", "santa cruz": "Z"
  });
  let agencyRequestId = 0;

  function normalizeText(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

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
    const variants =
      product?.stockByVariant && typeof product.stockByVariant === "object"
        ? product.stockByVariant
        : {};
    if (Object.hasOwn(variants, key)) return Number(variants[key] || 0);
    // Compatibilidad con piezas publicadas antes del stock por variante.
    return Object.keys(variants).length ? 0 : Number(product?.stock || 0);
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
      agencyId: elements.correoAgencySelect?.value || ""
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
      const cuotas = Math.min(3, Math.max(1, Number(installmentValue) || 1));
      paymentType = `mercadopago_manual_link_${cuotas}`;
      installments = cuotas;
    }

    return { value: selected, label: input.dataset.label, installments, paymentType };
  }

  function updateInstallmentsPrices() {
    const subtotal = getSubtotal();
    const delivery = getDelivery();
    const shipping = delivery?.cost || 0;
    const baseAmount = subtotal + shipping;
    const config = window.ARVEL_MANUAL_PAYMENT_LINK;
    if (!config) return;

    for (const cuotas of [1, 2, 3]) {
      const priceElement = document.querySelector(`#installments-${cuotas}-price`);
      if (priceElement) {
        const quote = config.calculate(baseAmount, cuotas);
        priceElement.textContent = cuotas === 1
          ? window.Arvel.formatPrice(quote.finalAmount)
          : `aprox. ${window.Arvel.formatPrice(quote.installmentAmount)} c/u`;
      }
    }

    const selectedInstallments = Number(elements.form.elements.installments?.value || 1);
    const quote = config.calculate(baseAmount, selectedInstallments);
    if (elements.manualMpBase) elements.manualMpBase.textContent = window.Arvel.formatPrice(quote.baseAmount);
    if (elements.manualMpFee) elements.manualMpFee.textContent = window.Arvel.formatPrice(quote.feeAmount);
    if (elements.manualMpFinal) elements.manualMpFinal.textContent = window.Arvel.formatPrice(quote.finalAmount);
    if (elements.manualMpInstallmentTotal) {
      elements.manualMpInstallmentTotal.textContent = quote.installments === 1
        ? "Un pago con link de Mercado Pago."
        : `${quote.installments} cuotas aproximadas de ${window.Arvel.formatPrice(quote.installmentAmount)}.`;
    }
  }

  function updateManualPaymentAvailability() {
    const config = window.ARVEL_MANUAL_PAYMENT_LINK;
    if (!config || !elements.mercadopagoInput) return;
    const eligible = getSubtotal() >= Number(config.minimumAmount || 50000);
    elements.mercadopagoInput.disabled = !eligible;
    elements.mercadopagoOption?.classList.toggle("is-disabled", !eligible);
    if (elements.mercadopagoMinimumNote) {
      elements.mercadopagoMinimumNote.textContent = eligible
        ? "El link se solicita manualmente por WhatsApp. Los porcentajes contemplan el costo informado de Mercado Pago; no incluyen impuestos o retenciones que pudieran corresponder."
        : `Esta opción se habilita cuando los productos suman ${window.Arvel.formatPrice(config.minimumAmount)}.`;
    }
    if (!eligible && elements.form.elements.payment?.value === "mercadopago") {
      const transfer = elements.form.querySelector('input[name="payment"][value="transferencia"]');
      if (transfer) transfer.checked = true;
    }
  }

  function updateSubmitLabel() {
    const submit = elements.form.querySelector('[type="submit"]');
    if (!submit || submit.disabled) return;
    submit.textContent = elements.form.elements.payment?.value === "mercadopago"
      ? "Solicitar link por WhatsApp"
      : "Confirmar pedido";
  }

  function updateInstallmentsVisibility() {
    updateManualPaymentAvailability();
    const paymentMethod = elements.form.elements.payment?.value;
    if (elements.mercadopagoInstallments) {
      elements.mercadopagoInstallments.hidden = paymentMethod !== "mercadopago";
      if (paymentMethod === "mercadopago") {
        updateInstallmentsPrices();
      }
    }
    updateSubmitLabel();
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
    const baseTotal = subtotal + shipping;
    const selectedPayment = elements.form.elements.payment?.value;
    const selectedInstallments = Number(elements.form.elements.installments?.value || 1);
    const manualQuote = selectedPayment === "mercadopago" && subtotal >= Number(window.ARVEL_MANUAL_PAYMENT_LINK?.minimumAmount || 50000)
      ? window.ARVEL_MANUAL_PAYMENT_LINK?.calculate(baseTotal, selectedInstallments)
      : null;
    elements.subtotal.textContent = window.Arvel.formatPrice(subtotal);
    elements.shipping.textContent = delivery
      ? shipping === 0
        ? "Gratis"
        : window.Arvel.formatPrice(shipping)
      : "A calcular";
    elements.total.textContent = window.Arvel.formatPrice(manualQuote?.finalAmount || baseTotal);
    updateManualPaymentAvailability();
    updateInstallmentsPrices();
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
    elements.homeDeliveryFields.forEach((wrapper) => {
      wrapper.hidden = false;
      wrapper.querySelectorAll("input, textarea").forEach((field) => {
        field.required = true;
      });
    });
  }

  function updateMeetingAvailability() {
    if (!elements.meetingPointSelector || !elements.meetingPoint) return;

    const isMeeting = elements.form.elements.delivery?.value === "encuentro";
    elements.meetingPointSelector.hidden = !isMeeting;
    elements.meetingPoint.required = isMeeting;

    if (!isMeeting) {
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

  async function loadCorreoAgencies() {
    if (!elements.correoAgencySelect || !elements.correoAgencyStatus) return;
    const provinceCode = correoProvinceCodes[normalizeText(elements.province.value)];
    const requestId = ++agencyRequestId;
    elements.correoAgency.value = "";
    elements.correoAgencyAddress.value = "";
    elements.correoAgencySelect.replaceChildren(new Option("Consultando sucursales…", ""));
    elements.correoAgencySelect.disabled = true;
    if (!provinceCode) {
      elements.correoAgencySelect.replaceChildren(new Option("Seleccioná primero tu provincia", ""));
      elements.correoAgencySelect.disabled = false;
      elements.correoAgencyStatus.textContent = "Seleccioná una provincia para consultar las sucursales disponibles.";
      return;
    }
    elements.correoAgencyStatus.textContent = "Consultando Correo Argentino…";
    try {
      const agencies = await window.ArvelShipping.getAgencies(provinceCode);
      if (requestId !== agencyRequestId) return;
      const options = [new Option("Elegí una sucursal", "")];
      agencies.forEach((agency) => {
        const label = [agency.name, agency.address, agency.city].filter(Boolean).join(" · ");
        const option = new Option(label, agency.id);
        option.dataset.name = agency.name;
        option.dataset.address = agency.address;
        options.push(option);
      });
      elements.correoAgencySelect.replaceChildren(...options);
      elements.correoAgencySelect.disabled = false;
      elements.correoAgencyStatus.textContent = agencies.length
        ? `${agencies.length} sucursal${agencies.length === 1 ? "" : "es"} disponible${agencies.length === 1 ? "" : "s"}.`
        : "Correo Argentino no informó sucursales de retiro para esta provincia.";
    } catch (error) {
      if (requestId !== agencyRequestId) return;
      elements.correoAgencySelect.replaceChildren(new Option("No pudimos cargar las sucursales", ""));
      elements.correoAgencySelect.disabled = false;
      elements.correoAgencyStatus.textContent = error.message || "No pudimos consultar Correo Argentino.";
    }
  }

  function updateSelectedCorreoAgency() {
    const option = elements.correoAgencySelect?.selectedOptions?.[0];
    elements.correoAgency.value = option?.dataset.name || "";
    elements.correoAgencyAddress.value = option?.dataset.address || "";
  }

  function updateCorreoAgencyAvailability() {
    if (!elements.correoAgencySelector || !elements.correoAgencySelect) return;
    const isBranch = elements.form.elements.delivery?.value === "correo-sucursal";
    elements.correoAgencySelector.hidden = !isBranch;
    elements.correoAgencySelect.required = isBranch;
    if (isBranch && elements.correoAgencySelect.options.length <= 1) loadCorreoAgencies();
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
    const baseTotal = subtotal + delivery.cost;
    const manualQuote = payment?.value === "mercadopago"
      ? window.ARVEL_MANUAL_PAYMENT_LINK?.calculate(baseTotal, payment.installments || 1)
      : null;
    if (manualQuote) {
      payment.baseAmount = manualQuote.baseAmount;
      payment.feeAmount = manualQuote.feeAmount;
      payment.finalAmount = manualQuote.finalAmount;
      payment.installmentAmount = manualQuote.installmentAmount;
      payment.rate = manualQuote.rate;
      payment.label = `Link de Mercado Pago · ${manualQuote.label}`;
    }
    const fullName = data.get("fullName").trim();
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const address = {
      province: data.get("province"),
      city: data.get("city").trim(),
      postalCode: data.get("postalCode").trim(),
      street: data.get("street").trim(),
      streetNumber: data.get("streetNumber").trim(),
      apartment: data.get("apartment").trim(),
      references: data.get("deliveryReferences").trim(),
      agencyName: String(data.get("correoAgency") || "").trim(),
      agencyAddress: String(data.get("correoAgencyAddress") || "").trim(),
      agencyId: String(data.get("correoAgencyId") || "").trim(),
      meetingPoint: String(data.get("meetingPoint") || "").trim(),
      notes: data.get("notes").trim()
    };

    return {
      orderNumber,
      createdAt: new Date(),
      discount: 0,
      customer: {
        fullName,
        firstName: nameParts[0] || "",
        lastName: nameParts.slice(1).join(" "),
        email: data.get("email").trim(),
        phone: data.get("phone").trim(),
        dni: data.get("dni").trim()
      },
      address,
      shipping: {
        type: delivery.value,
        province: address.province,
        city: address.city,
        postalCode: address.postalCode,
        street: address.street,
        number: address.streetNumber,
        floorApartment: address.apartment,
        reference: address.references,
        branch: { id: address.agencyId, name: address.agencyName, address: address.agencyAddress },
        meetingPoint: address.meetingPoint
      },
      delivery,
      payment,
      subtotal,
      baseTotal,
      total: manualQuote?.finalAmount || baseTotal,
      items: cart.map((item) => ({
        ...item,
        product: findProduct(item)
      }))
    };
  }

  function buildWhatsAppMessageLegacy(order, hasReceipt = false) {
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

    const isManualPaymentLink = order.payment.value === "mercadopago";
    const paymentLines = isManualPaymentLink
      ? [
          `Método: ${order.payment.label}`,
          `Total base (productos + envío): ${window.Arvel.formatPrice(order.baseTotal)}`,
          `Costo por cobro/cuotas: ${window.Arvel.formatPrice(order.payment.feeAmount)}`,
          `💰 *TOTAL DEL LINK: ${window.Arvel.formatPrice(order.payment.finalAmount)}*`,
          order.payment.installments > 1
            ? `Cuotas solicitadas: ${order.payment.installments} de aprox. ${window.Arvel.formatPrice(order.payment.installmentAmount)}`
            : "Modalidad solicitada: 1 pago"
        ]
      : [
          `Método: ${order.payment.label}`,
          `Subtotal: ${window.Arvel.formatPrice(order.subtotal)}`,
          `Envío: ${order.delivery.cost === 0 ? "GRATIS" : window.Arvel.formatPrice(order.delivery.cost)}`,
          `💰 *TOTAL: ${window.Arvel.formatPrice(order.total)}*`,
          window.ARVEL_TRANSFER?.alias ? `Alias: *${window.ARVEL_TRANSFER.alias}*` : null,
          window.ARVEL_TRANSFER?.wallet ? `Billetera: ${window.ARVEL_TRANSFER.wallet}` : null
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
      ...paymentLines,
      "",
      "📦 *ENTREGA*",
      `Modalidad: ${order.delivery.label}`,
      ...deliveryLines,
      `📍 Localidad: ${order.address.city}, ${order.address.province}`,
      `📮 Código postal: ${order.address.postalCode}`,
      order.address.notes ? `📝 Observaciones: ${order.address.notes}` : null,
      "",
      isManualPaymentLink ? "🔗 *SOLICITUD DE LINK*" : "🧾 *COMPROBANTE*",
      isManualPaymentLink
        ? "Solicito que me envíen el link de Mercado Pago por el total y las cuotas indicadas. Todavía no realicé el pago."
        : hasReceipt
          ? "✅ Confirmo que realicé la transferencia y adjunto el comprobante."
          : "⏳ Todavía no adjunté el comprobante de pago.",
      "",
      "⚠️ *IMPORTANTE*",
      isManualPaymentLink
        ? "El pedido queda sujeto a verificación de stock. Arvel enviará manualmente el link correspondiente; revisá el importe antes de pagarlo."
        : "El pedido se considera enviado cuando confirme este mensaje. Queda sujeto a verificación de stock y acreditación del pago."
    ]
      .filter((line) => line !== null && line !== undefined)
      .join("\n");
  }

  function buildWhatsAppMessage(order) {
    // Escapes Unicode: evitan que WhatsApp reciba rombos con signo de pregunta
    // cuando un servidor o navegador interpreta el archivo con otro charset.
    const icon = {
      shop: "\u{1F6CD}\uFE0F", receipt: "\u{1F9FE}", person: "\u{1F464}",
      bag: "\u{1F6D2}", payment: "\u{1F4B3}", delivery: "\u{1F4E6}",
      proof: "\u{1F4CE}", important: "\u26A0\uFE0F", heart: "\u{1F496}"
    };
    const productLines = order.items.flatMap((item, index) => [
      `${index + 1}. *${item.product.name}*`,
      `Talle: ${item.size || "Único"}`,
      `Color: ${item.color || "Sin especificar"}`,
      `Cantidad: ${item.quantity}`,
      `Precio: ${window.Arvel.formatPrice(item.product.price * item.quantity)}`,
      index < order.items.length - 1 ? "" : null
    ]);

    const deliveryLines = order.delivery.value === "correo-sucursal"
      ? [
          `Sucursal: ${order.address.agencyName}`,
          `Dirección: ${order.address.agencyAddress}`
        ]
      : order.delivery.value === "encuentro"
        ? [
            `Punto coordinado: ${elements.meetingPoint?.value || "A coordinar"}`,
            "Día y horario: a coordinar con la vendedora"
          ]
        : [
            `Dirección: ${order.address.street} ${order.address.streetNumber}${order.address.apartment ? `, ${order.address.apartment}` : ""}`,
            order.address.references ? `Entre calles / referencia: ${order.address.references}` : null
          ];

    const isManualPaymentLink = order.payment.value === "mercadopago";
    const paymentLines = isManualPaymentLink
      ? [
          `Método: ${order.payment.label}`,
          `Total base: ${window.Arvel.formatPrice(order.baseTotal)}`,
          `Recargo del link/cuotas: ${window.Arvel.formatPrice(order.payment.feeAmount)}`,
          `*TOTAL DEL LINK: ${window.Arvel.formatPrice(order.payment.finalAmount)}*`,
          order.payment.installments > 1
            ? `Cuotas solicitadas: ${order.payment.installments} de aprox. ${window.Arvel.formatPrice(order.payment.installmentAmount)}`
            : "Modalidad solicitada: 1 pago"
        ]
      : [
          `Método: ${order.payment.label}`,
          `Subtotal: ${window.Arvel.formatPrice(order.subtotal)}`,
          `Envío: ${order.delivery.cost === 0 ? "GRATIS" : window.Arvel.formatPrice(order.delivery.cost)}`,
          `*TOTAL: ${window.Arvel.formatPrice(order.total)}*`,
          window.ARVEL_TRANSFER?.alias ? `Alias: *${window.ARVEL_TRANSFER.alias}*` : null,
          window.ARVEL_TRANSFER?.wallet ? `Billetera: ${window.ARVEL_TRANSFER.wallet}` : null
        ];

    return [
      `${icon.shop} *NUEVO PEDIDO ARVEL*`,
      "¡Hola! Quiero enviar mi pedido para revisión y confirmación.",
      "",
      `${icon.receipt} *DATOS DEL PEDIDO*`,
      `Pedido: *${order.orderNumber}*`,
      `Fecha: ${new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(order.createdAt)}`,
      "",
      `${icon.person} *DATOS DE LA CLIENTA*`,
      `Nombre: ${order.customer.fullName}`,
      `Teléfono: ${order.customer.phone}`,
      `Correo: ${order.customer.email}`,
      order.customer.dni ? `DNI: ${order.customer.dni}` : null,
      "",
      `${icon.bag} *MI PEDIDO*`,
      ...productLines,
      "",
      `${icon.payment} *PAGO*`,
      ...paymentLines,
      "",
      `${icon.delivery} *ENTREGA*`,
      `Modalidad: ${order.delivery.label}`,
      ...deliveryLines,
      `Localidad: ${order.address.city}, ${order.address.province}`,
      `Código postal: ${order.address.postalCode}`,
      order.address.notes ? `Observaciones: ${order.address.notes}` : null,
      "",
      `${icon.proof} *${isManualPaymentLink ? "SOLICITUD DE LINK" : "COMPROBANTE"}*`,
      isManualPaymentLink
        ? "Solicito el link de Mercado Pago por el total y las cuotas indicadas. Todavía no realicé el pago."
        : "Confirmo que realicé la transferencia. Voy a adjuntar el comprobante de pago en este chat.",
      "",
      `${icon.important} *IMPORTANTE*`,
      isManualPaymentLink
        ? "Al enviar este mensaje, mi pedido queda enviado para revisión. Arvel confirmará el stock y me enviará manualmente el link correspondiente."
        : "Al enviar este mensaje, mi pedido queda enviado para revisión.",
      "La confirmación final queda sujeta a la verificación de stock y acreditación del pago.",
      "",
      `¡Gracias! ${icon.heart}`
    ]
      .filter((line) => line !== null && line !== undefined)
      .join("\n");
  }

  async function saveOrderToFirestore(order) {
    try {
      const apiBase = String(window.ARVEL_PAYMENT_API_BASE || window.ARVEL_API_BASE || "").replace(/\/+$/, "");
      const endpoint = apiBase ? `${apiBase}/api/create-order` : "/api/create-order";

      console.log("📦 Guardando orden:", { orderNumber: order.orderNumber, endpoint });

      const payload = {
        orderNumber: order.orderNumber,
        fullName: order.customer.fullName,
        email: order.customer.email,
        phone: order.customer.phone,
        items: order.items.map(item => ({
          id: item.id || item.documentId,
          name: (item.product?.name || "Producto"),
          quantity: item.quantity,
          price: item.product?.price || 0
        }))
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.error("❌ Error al guardar orden:", response.status, data);
        return;
      }

      console.log("✅ Orden guardada en Firestore:", data);
    } catch (error) {
      console.error("❌ Error guardando orden:", error);
    }
  }

  function showConfirmation(order, options = {}) {
    const registered = options.registered !== false;
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
    elements.confirmationNotice.textContent = registered
      ? "Tu producto está reservado. Transferí el total exacto y tocá el botón rosa antes de que termine el tiempo; después adjuntá el comprobante en el chat."
      : "El registro automático no está disponible en este momento. Conservamos tu resumen en esta pantalla, pero el pedido todavía no fue recibido: transferí el total exacto, abrí WhatsApp y adjuntá allí el comprobante para que Arvel lo revise manualmente.";
    elements.confirmationWhatsAppLabel.textContent = "Enviar pedido para confirmar la orden y adjuntar comprobante";
    const alias = String(window.ARVEL_TRANSFER?.alias || "").trim();
    elements.transferAlias.textContent = alias || "Alias todavía no configurado";
    elements.transferWallet.textContent = window.ARVEL_TRANSFER?.wallet || "";
    elements.transferHolder.textContent = window.ARVEL_TRANSFER?.holder || "";
    elements.transferCvu.textContent = window.ARVEL_TRANSFER?.cvu || "";
    elements.copyTransferAlias.disabled = !alias;
    elements.confirmation.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (registered) startReservationTimer(order);
  }

  function expireReservation() {
    window.clearInterval(reservationTimerId);
    reservationTimerId = null;
    if (elements.reservationCountdown) elements.reservationCountdown.textContent = "00:00";
    elements.reservationTimer?.classList.add("is-expired");
    if (elements.reservationTimer) elements.reservationTimer.firstElementChild.textContent = "La reserva venció";
    elements.confirmationWhatsApp.disabled = true;
    window.alert("Pasaron los 5 minutos y el producto se liberó automáticamente. Volvé a intentarlo desde el carrito.");
    window.location.replace("carrito.html?reserva=vencida");
  }

  function startReservationTimer(order) {
    window.clearInterval(reservationTimerId);
    const tick = () => {
      const remaining = Math.max(0, Number(order.reservationExpiresAtMs || 0) - (Date.now() + reservationClockOffset));
      const seconds = Math.ceil(remaining / 1000);
      if (elements.reservationCountdown) elements.reservationCountdown.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
      if (remaining <= 0) expireReservation();
    };
    tick();
    reservationTimerId = window.setInterval(tick, 250);
  }

  async function sendOrderToWhatsApp() {
    if (!preparedOrder) return;
    const button = elements.confirmationWhatsApp;
    const originalLabel = elements.confirmationWhatsAppLabel.textContent;
    button.disabled = true;
    elements.confirmationWhatsAppLabel.textContent = "Confirmando reserva…";
    try {
      const apiBase = String(window.ARVEL_PAYMENT_API_BASE || window.ARVEL_API_BASE || "").replace(/\/+$/, "");
      const response = await fetch(`${apiBase}/api/submit-transfer-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${await window.ARVEL_CHECKOUT_USER.getIdToken()}` },
        body: JSON.stringify({ orderNumber: preparedOrder.orderNumber })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        if (response.status === 410) return expireReservation();
        throw new Error(result.error || "No pudimos confirmar la reserva.");
      }
      preparedOrder.reservationExpiresAtMs = Number(result.expiresAtMs);
      reservationClockOffset = Number(result.serverNowMs) - Date.now();
      elements.reservationTimer.innerHTML = "<strong>Pedido enviado a revisión</strong><span>La reserva se libera en <b id=\"reservation-countdown\">05:00</b></span>";
      elements.reservationCountdown = elements.reservationTimer.querySelector("#reservation-countdown");
      elements.reservationTimer.classList.remove("is-expired");
      elements.confirmationWhatsAppLabel.textContent = "Abrir WhatsApp y adjuntar comprobante";
      startReservationTimer(preparedOrder);
    } catch (error) {
      elements.confirmationNotice.textContent = error.message || "No pudimos confirmar la reserva. Intentá nuevamente.";
      button.disabled = false;
      elements.confirmationWhatsAppLabel.textContent = originalLabel;
      return;
    }
    const message = buildWhatsAppMessage(preparedOrder);
    const adminNumber = String(window.ARVEL_TRANSFER?.whatsappNumber || "5491160153234")
      .replace(/\D/g, "");
    const whatsappUrl = `https://wa.me/${adminNumber}?text=${encodeURIComponent(message)}`;
    const whatsappWindow = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    if (!whatsappWindow) window.location.href = whatsappUrl;
    elements.confirmationNotice.textContent =
      "Abrimos el chat administrativo de Arvel con todos los datos del pedido. Antes de enviarlo, adjuntá el comprobante desde el clip de WhatsApp.";
  }

  function requestManualMercadoPagoLink(order) {
    const config = window.ARVEL_MANUAL_PAYMENT_LINK;
    if (!config || order.subtotal < Number(config.minimumAmount || 50000)) {
      elements.globalError.textContent = `El link de Mercado Pago está disponible desde ${window.Arvel.formatPrice(config?.minimumAmount || 50000)} en productos.`;
      return;
    }
    const message = buildWhatsAppMessage(order);
    const adminNumber = String(config.whatsappNumber || "5491160153234").replace(/\D/g, "");
    const whatsappUrl = `https://wa.me/${adminNumber}?text=${encodeURIComponent(message)}`;
    elements.globalError.textContent = "Se abrió WhatsApp para solicitar el link. El pedido todavía no está pagado ni confirmado.";
    const whatsappWindow = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    if (!whatsappWindow) window.location.href = whatsappUrl;
  }

  async function createTransferOrder(order) {
    const submit = elements.form.querySelector('[type="submit"]');
    const originalLabel = submit.textContent;
    submit.disabled = true;
    submit.textContent = "Registrando pedido…";
    elements.globalError.textContent = "";
    try {
      const apiBase = String(window.ARVEL_PAYMENT_API_BASE || window.ARVEL_API_BASE || "").replace(/\/+$/, "");
      if (!apiBase || !window.ARVEL_CHECKOUT_USER) {
        throw new Error("No pudimos validar tu sesión. Volvé a ingresar.");
      }
      const response = await fetch(`${apiBase}/api/create-transfer-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${await window.ARVEL_CHECKOUT_USER.getIdToken()}`
        },
        body: JSON.stringify({
          orderNumber: order.orderNumber,
          customer: order.customer,
          address: order.address,
          delivery: {
            method: order.delivery.value,
            postalCode: order.address.postalCode,
            meetingPoint: order.address.meetingPoint || ""
          },
          items: order.items.map((item) => ({
            documentId: item.product.documentId || item.documentId || "",
            variant_id: item.variant_id || item.variantId || "",
            size: item.size,
            color: item.color,
            quantity: item.quantity
          }))
        })
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "No pudimos registrar el pedido.");
      }
      order.total = Number(result.total) || order.total;
      order.reservationExpiresAtMs = Number(result.expiresAtMs);
      reservationClockOffset = Number(result.serverNowMs) - Date.now();
      showConfirmation(order, { registered: true });
    } catch (error) {
      console.error("No se pudo registrar el pedido por API", error);
      const message = String(error?.message || "");
      const isNetworkFailure =
        error instanceof TypeError ||
        /failed to fetch|networkerror|load failed|network request failed/i.test(message);

      elements.globalError.textContent = isNetworkFailure
        ? "No pudimos conectar con el sistema de reservas. No se generó ningún pedido; intentá nuevamente."
        : message || "No pudimos reservar el pedido. Intentá nuevamente.";
      submit.disabled = false;
      submit.textContent = originalLabel;
    }
  }

  function bindEvents() {
    window.addEventListener("arvel:mercadopago-status", () => {
      // La configuración centralizada permite recalcular los importes
      // sin tocar ningún dato que la clienta ya haya completado.
      updateInstallmentsPrices();
    });
    elements.copyTransferAlias?.addEventListener("click", async () => {
      const alias = String(window.ARVEL_TRANSFER?.alias || "").trim();
      if (!alias) return;
      await navigator.clipboard.writeText(alias);
      elements.copyTransferAlias.textContent = "Alias copiado ✓";
    });
    elements.confirmationWhatsApp?.addEventListener("click", sendOrderToWhatsApp);
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
        updateTotals();
      }
      if (event.target.name === "installments") {
        updateTotals();
        updateSubmitLabel();
        updateCheckoutProgress(event.target.closest(".checkout-block")?.id || null);
      }
      if (event.target.name === "province") {
        loadCorreoAgencies();
        updateCorreoAgencyAvailability();
      }
      if (event.target.name === "correoAgencyId") updateSelectedCorreoAgency();
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
        requestManualMercadoPagoLink(order);
        return;
      }
      await createTransferOrder(order);
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
