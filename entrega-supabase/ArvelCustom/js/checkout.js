const CREATE_ORDER_URL = "https://uwhnxaaivjreeyheuarw.supabase.co/functions/v1/create-order";
(function () {
  "use strict";

  const FREE_SHIPPING_THRESHOLD = 120000;
  const products = Array.isArray(window.ARVEL_PRODUCTS) ? window.ARVEL_PRODUCTS : [];
  let cart = window.ArvelStore.readStoredArray(window.ArvelStore.storageKeys.cart);

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
    cashChoice: document.querySelector("#cash-choice"),
    cashInput: document.querySelector('input[value="efectivo"]'),
    postalCode: document.querySelector("#postal-code"),
    dniField: document.querySelector("#dni-field"),
    dni: document.querySelector("#dni"),
    correoBranchInput: document.querySelector('input[name="delivery"][value="correo-sucursal"]'),
    correoHomeInput: document.querySelector('input[name="delivery"][value="correo-domicilio"]'),
    correoBranchCostLabel: document.querySelector("#correo-branch-cost-label"),
    correoHomeCostLabel: document.querySelector("#correo-home-cost-label"),
    meetingPointSelector: document.querySelector("#meeting-point-selector"),
    meetingPoint: document.querySelector("#meeting-point"),
    meetingPointCost: document.querySelector("#meeting-point-cost"),
    confirmation: document.querySelector("#order-confirmation"),
    confirmationName: document.querySelector("#confirmation-name"),
    confirmationOrder: document.querySelector("#confirmation-order-number"),
    confirmationSummary: document.querySelector("#confirmation-summary"),
    confirmationWhatsApp: document.querySelector("#confirmation-whatsapp"),
    confirmationWhatsAppLabel: document.querySelector("#confirmation-whatsapp-label"),
    confirmationNotice: document.querySelector("#confirmation-notice")
  };

  function findProduct(id) {
    return products.find((product) => product.id === Number(id));
  }

  function getVariantStock(product, size, color) {
    const key = `${size}|${color}`;
    if (Object.hasOwn(product.stockByVariant, key)) return product.stockByVariant[key];
    return Object.keys(product.stockByVariant).length ? 0 : product.stock;
  }

  function getValidCart() {
    return cart.filter((item) => {
      const product = findProduct(item.id);
      if (!product || product.soldOut || product.archived || item.quantity <= 0) return false;
      return item.quantity <= getVariantStock(product, item.size, item.color);
    });
  }

  function getSubtotal() {
    return cart.reduce((total, item) => {
      const product = findProduct(item.id);
      return total + (product ? product.price * item.quantity : 0);
    }, 0);
  }

  function getDelivery() {
    const selected = elements.form.elements.delivery?.value;
    if (!selected) return null;
    const input = elements.form.querySelector(`input[name="delivery"][value="${selected}"]`);
    const meetingOption = elements.meetingPoint?.selectedOptions?.[0];
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
        : input.dataset.label,
      cost: freeByThreshold ? 0 : baseCost
    };
  }

  function getPayment() {
    const selected = elements.form.elements.payment?.value;
    if (!selected) return null;
    const input = elements.form.querySelector(`input[name="payment"][value="${selected}"]`);
    return { value: selected, label: input.dataset.label };
  }

  function renderItems() {
    elements.items.innerHTML = cart
      .map((item) => {
        const product = findProduct(item.id);
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
    const delivery = getDelivery();
    const allowsCash = delivery?.value === "encuentro";
    elements.cashInput.disabled = !allowsCash;
    elements.cashChoice.classList.toggle("is-disabled", !allowsCash);

    if (!allowsCash && elements.cashInput.checked) {
      elements.cashInput.checked = false;
    }
  }

  function updateDniAvailability() {
    if (!elements.dniField || !elements.dni) return;
    const deliveryType = elements.form.elements.delivery?.value || "";
    const needsDni = deliveryType.startsWith("correo-");
    elements.dniField.hidden = !needsDni;
    elements.dni.required = needsDni;

    if (!needsDni) {
      elements.dni.value = "";
      elements.dni.removeAttribute("aria-invalid");
      document.querySelector("#dni-error").textContent = "";
    }
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
        firstName: data.get("firstName").trim(),
        lastName: data.get("lastName").trim(),
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
        notes: data.get("notes").trim()
      },
      delivery,
      payment,
      subtotal,
      total,
      items: cart.map((item) => ({
        ...item,
        product: findProduct(item.id)
      }))
    };
  }

  function buildWhatsAppMessage(order) {
    const productLines = order.items.map(
      (item) =>
        `• ${item.product.name} | Talle: ${item.size} | Color: ${item.color} | Cantidad: ${item.quantity} | ${window.Arvel.formatPrice(item.product.price * item.quantity)}`
    );

    return [
      "Hola Arvel, quiero enviar este pedido para revisión:",
      "",
      `Pedido: ${order.orderNumber}`,
      `Fecha: ${new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(order.createdAt)}`,
      `Clienta: ${order.customer.firstName} ${order.customer.lastName}`,
      `Teléfono: ${order.customer.phone}`,
      `Correo: ${order.customer.email}`,
      order.customer.dni ? `DNI para el envío: ${order.customer.dni}` : "",
      "",
      "Productos:",
      ...productLines,
      "",
      `Subtotal: ${window.Arvel.formatPrice(order.subtotal)}`,
      order.payment.value === "transferencia"
        ? `Descuento por transferencia: ${window.Arvel.formatPrice(order.discount)}`
        : "",
      `Envío: ${order.delivery.cost === 0 ? "Gratis / sin costo" : window.Arvel.formatPrice(order.delivery.cost)}`,
      `Método de entrega: ${order.delivery.label}`,
      `Método de pago: ${order.payment.label}`,
      `Total: ${window.Arvel.formatPrice(order.total)}`,
      "",
      `Entrega: ${order.address.street} ${order.address.streetNumber}${order.address.apartment ? `, ${order.address.apartment}` : ""}, ${order.address.city}, ${order.address.province} (${order.address.postalCode})`,
      order.address.references ? `Referencias: ${order.address.references}` : "",
      order.address.notes ? `Observaciones: ${order.address.notes}` : "",
      "",
      "Entiendo que el pedido recién será recibido cuando envíe este mensaje y queda sujeto a confirmación de stock y pago."
    ]
      .filter((line) => line !== "")
      .join("\n");
  }

  function showConfirmation(order) {
    elements.content.hidden = true;
    elements.confirmation.hidden = false;
    elements.confirmationName.textContent = order.customer.firstName;
    elements.confirmationOrder.textContent = order.orderNumber;
    elements.confirmationSummary.innerHTML = `
      <dl>
        <div><dt>Productos</dt><dd>${order.items.reduce((total, item) => total + item.quantity, 0)}</dd></div>
        <div><dt>Entrega</dt><dd>${order.delivery.label}</dd></div>
        <div><dt>Pago</dt><dd>${order.payment.label}</dd></div>
        <div><dt>Subtotal</dt><dd>${window.Arvel.formatPrice(order.subtotal)}</dd></div>
        ${order.payment.value === "transferencia"
          ? `<div><dt>Descuento por transferencia</dt><dd>${window.Arvel.formatPrice(order.discount)}</dd></div>`
          : ""}
        <div><dt>Envío</dt><dd>${order.delivery.cost === 0 ? "Sin costo" : window.Arvel.formatPrice(order.delivery.cost)}</dd></div>
        <div><dt>Total</dt><dd>${window.Arvel.formatPrice(order.total)}</dd></div>
      </dl>
    `;
    elements.confirmationWhatsApp.href = window.Arvel.createWhatsAppUrl(
      buildWhatsAppMessage(order)
    );
    elements.confirmationNotice.textContent =
      "El pedido todavía no fue recibido, guardado, cobrado ni reservado. Para enviarlo a Arvel tenés que tocar el botón y confirmar el mensaje en WhatsApp.";
    elements.confirmationWhatsAppLabel.textContent = "Enviar pedido por WhatsApp";
    elements.confirmation.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bindEvents() {
    elements.postalCode.addEventListener("change", updateCorreoEstimate);
    elements.postalCode.addEventListener("blur", updateCorreoEstimate);
    elements.form.addEventListener("change", (event) => {
      if (event.target.name === "delivery") {
        updateMeetingAvailability();
        updateDniAvailability();
        updatePaymentAvailability();
        updateTotals();
      }
      if (event.target.name === "meetingPoint") {
        updateMeetingAvailability();
        updateTotals();
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

    elements.form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!validateForm()) return;
      const order = buildOrderData(generateOrderNumber());
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
    updateDniAvailability();
    updatePaymentAvailability();
    updateTotals();
    bindEvents();
  }
})();
