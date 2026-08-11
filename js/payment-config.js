window.ARVEL_API_BASE = "https://web-arvel-y2-k.vercel.app";
window.ARVEL_PAYMENT_API_BASE = window.ARVEL_API_BASE;

(async () => {
  const option = document.querySelector("#mercadopago-payment-option");
  if (!option) return;

  const input = option.querySelector('input[value="mercadopago"]');
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), 7000);

  try {
    const response = await fetch(`${window.ARVEL_API_BASE}/api/mercadopago-health`, {
      cache: "no-store",
      signal: timeout.signal
    });
    const result = await response.json().catch(() => ({}));

    // Esta configuraciÃ³n es pÃºblica: solamente contiene porcentajes de cobro,
    // nunca el access token ni ninguna credencial de Mercado Pago.
    window.ARVEL_MERCADOPAGO_CONFIG = {
      connected: response.ok && result.connected === true,
      mode: result.mode || "unknown",
      fees: result.fees || {}
    };

    // Si la verificaciÃ³n temporal falla no ocultamos una forma de pago que sÃ­
    // puede estar disponible. El backend vuelve a validar todo al crear la
    // preferencia y mostrarÃ¡ el motivo seguro si realmente no puede cobrar.
    option.hidden = false;
    option.classList.remove("is-disabled");
    if (input) input.disabled = false;
  } catch (error) {
    console.warn("Mercado Pago health check unavailable", error);
    window.ARVEL_MERCADOPAGO_CONFIG = { connected: false, mode: "unknown", fees: {} };
    option.hidden = false;
    option.classList.remove("is-disabled");
    if (input) input.disabled = false;
  } finally {
    window.clearTimeout(timer);
    window.dispatchEvent(new CustomEvent("arvel:mercadopago-status", {
      detail: window.ARVEL_MERCADOPAGO_CONFIG
    }));
  }
})();
