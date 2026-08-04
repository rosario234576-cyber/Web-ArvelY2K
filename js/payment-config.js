window.ARVEL_API_BASE = "https://web-arvel-y2-k.vercel.app";
window.ARVEL_PAYMENT_API_BASE = window.ARVEL_API_BASE;

(async () => {
  const option = document.querySelector("#mercadopago-payment-option");
  if (!option) return;
  const input = option.querySelector('input[value="mercadopago"]');
  try {
    const response = await fetch(`${window.ARVEL_API_BASE}/api/mercadopago-health`, {
      cache: "no-store"
    });
    const result = await response.json();
    const ready = response.ok && result.connected === true && result.mode === "production";
    option.hidden = !ready;
    option.classList.toggle("is-disabled", !ready);
    if (input) input.disabled = !ready;
    if (!ready) {
      if (input) input.checked = false;
    }
  } catch (_error) {
    // Un fallo transitorio de red no debe hacer desaparecer el medio de pago.
    // El backend vuelve a validar la conexión al crear la preferencia.
    option.hidden = false;
    option.classList.remove("is-disabled");
    if (input) input.disabled = false;
  }
})();
