(async function () {
  "use strict";

  const params = new URLSearchParams(location.search);
  const paymentId = params.get("payment_id") || params.get("collection_id");
  const fallback = params.get("resultado") || "pendiente";
  const title = document.querySelector("#payment-result-title");
  const eyebrow = document.querySelector("#payment-result-eyebrow");
  const message = document.querySelector("#payment-result-message");
  const details = document.querySelector("#payment-result-details");

  function render(status, orderNumber = "") {
    const states = {
      approved: ["Pago aprobado", "Mercado Pago confirmó el pago. Arvel comenzará a preparar tu pedido."],
      pending: ["Pago pendiente", "Mercado Pago todavía está procesando el pago. No vuelvas a pagarlo."],
      rejected: ["Pago rechazado", "El pago no fue aprobado. Podés volver al carrito e intentar con otro medio."],
      failure: ["Pago no completado", "El pago no pudo completarse. No se realizó ningún cobro confirmado."]
    };
    const normalized = states[status] ? status : fallback === "aprobado"
      ? "approved"
      : fallback === "rechazado" ? "rejected" : "pending";
    eyebrow.textContent = normalized === "approved" ? "Confirmado" : "Estado del pago";
    title.textContent = states[normalized][0];
    message.textContent = states[normalized][1];
    if (orderNumber) {
      details.hidden = false;
      details.innerHTML = `<strong>Pedido</strong><span>${orderNumber}</span>`;
    }
  }

  if (!paymentId) {
    render(fallback === "aprobado" ? "approved" : fallback === "rechazado" ? "rejected" : "pending");
    return;
  }

  try {
    const response = await fetch(
      `${window.ARVEL_PAYMENT_API_BASE}/api/mercadopago-status?payment_id=${encodeURIComponent(paymentId)}`
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    render(result.status, result.orderNumber);
  } catch (error) {
    render("pending");
  }
})();
