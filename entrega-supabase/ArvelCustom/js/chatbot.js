(function () {
  "use strict";

  const panel = document.querySelector("#chatbot-panel");
  const toggle = document.querySelector("#chatbot-toggle");
  const close = document.querySelector("#chatbot-close");
  const messages = document.querySelector("#chatbot-messages");
  const form = document.querySelector("#chatbot-form");
  const input = document.querySelector("#chatbot-input");
  if (!panel || !toggle || !close || !messages || !form || !input) return;

  const answers = [
    {
      keywords: ["talle", "medida", "queda", "calce"],
      response: "Para elegir bien, compará las medidas publicadas con una prenda tuya apoyada en plano. Si me decís qué pieza estás viendo y tus medidas aproximadas, te indico qué revisar."
    },
    {
      keywords: ["envio", "correo", "codigo postal"],
      response: "Hacemos envíos a toda Argentina. En cada ficha podés ingresar tu código postal para ver un valor orientativo; el importe final se confirma manualmente antes de despachar."
    },
    {
      keywords: ["pago", "mercado pago", "transferencia", "efectivo"],
      response: "Podés elegir Mercado Pago o transferencia. El efectivo se ofrece solo cuando coordinamos una entrega presencial en CABA. No ingreses datos de tarjeta en el chat."
    },
    {
      keywords: ["cambio", "devolver", "devolucion"],
      response: "Como muchas piezas son únicas, conviene revisar medidas y condición antes de comprar. Para un caso puntual, escribinos con el nombre de la prenda y te explicamos las opciones."
    },
    {
      keywords: ["drop", "lanzamiento", "proximo"],
      response: "El próximo drop anunciado es “After Internet”. En la home tenés la cuenta regresiva y el acceso a la comunidad de WhatsApp."
    },
    {
      keywords: ["custom", "personalizada", "personalizado", "intervenir"],
      response: "Sí, hacemos customs. Contanos qué prenda tenés, talle, idea, colores y presupuesto. Arvel crea una interpretación propia: no hacemos copias exactas."
    },
    {
      keywords: ["stock", "disponible", "vendida", "vendido"],
      response: "El stock visible se vuelve a revisar al enviar el pedido por WhatsApp. Si una pieza figura vendida, podemos conversar una custom inspirada, nunca una copia exacta."
    }
  ];

  function normalize(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function appendMessage(text, sender) {
    const message = document.createElement("div");
    message.className = `chatbot-message chatbot-message--${sender}`;
    message.textContent = text;
    messages.append(message);
    messages.scrollTop = messages.scrollHeight;
  }

  function findAnswer(question) {
    const normalized = normalize(question);
    const match = answers.find((answer) =>
      answer.keywords.some((keyword) => normalized.includes(normalize(keyword)))
    );
    return match?.response || "Quiero ayudarte bien, pero esa consulta necesita que la vea Arvel. Escribinos por WhatsApp y contanos un poco más; te respondemos personalmente.";
  }

  function answerQuestion(question) {
    appendMessage(question, "user");
    input.value = "";
    window.setTimeout(() => appendMessage(findAnswer(question), "bot"), 180);
  }

  function openPanel() {
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    input.focus();
  }

  function closePanel() {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  }

  toggle.addEventListener("click", () => panel.hidden ? openPanel() : closePanel());
  close.addEventListener("click", closePanel);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (question) answerQuestion(question);
  });
  panel.addEventListener("click", (event) => {
    const quickReply = event.target.closest("[data-chat-question]");
    if (quickReply) answerQuestion(quickReply.dataset.chatQuestion);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) closePanel();
  });

  /*
   * Integración futura: reemplazar findAnswer() por un endpoint propio seguro.
   * Las claves de Tidio, Botpress, Chatbase o IA deben vivir en el backend,
   * nunca en este JavaScript público.
   */
})();

