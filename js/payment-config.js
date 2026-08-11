window.ARVEL_API_BASE = "https://web-arvel-y2-k.vercel.app";
window.ARVEL_PAYMENT_API_BASE = window.ARVEL_API_BASE;

// Pago manual mediante un link creado por Arvel desde Mercado Pago.
// Estos porcentajes son configuracion comercial publica: no contienen claves.
window.ARVEL_MANUAL_PAYMENT_LINK = Object.freeze({
  enabled: true,
  minimumAmount: 50000,
  whatsappNumber: "5491160153234",
  plans: Object.freeze({
    1: Object.freeze({ label: "1 pago", rate: 0.0629 }),
    2: Object.freeze({ label: "2 cuotas", rate: 0.1408 }),
    3: Object.freeze({ label: "3 cuotas", rate: 0.1678 })
  }),
  calculate(baseAmount, installments) {
    const base = Math.max(0, Number(baseAmount) || 0);
    const plan = this.plans[Number(installments)] || this.plans[1];
    // Gross-up: el total cubre el cargo para que Arvel reciba el valor base.
    const finalAmount = Math.ceil(base / (1 - plan.rate));
    return {
      baseAmount: base,
      feeAmount: Math.max(0, finalAmount - base),
      finalAmount,
      installmentAmount: Math.ceil(finalAmount / Number(installments || 1)),
      installments: Number(installments || 1),
      rate: plan.rate,
      label: plan.label
    };
  }
});

// Compatibilidad con componentes existentes. El modo manual nunca crea una
// preferencia ni expone credenciales de Mercado Pago en el navegador.
window.ARVEL_MERCADOPAGO_CONFIG = {
  connected: false,
  mode: "manual-link",
  fees: {
    mercadopago_card_1: 0.0629,
    mercadopago_card_2: 0.1408,
    mercadopago_card_3: 0.1678
  }
};

window.dispatchEvent(new CustomEvent("arvel:mercadopago-status", {
  detail: window.ARVEL_MERCADOPAGO_CONFIG
}));
