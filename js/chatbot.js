(function () {
  "use strict";

  const panel = document.querySelector("#chatbot-panel");
  const toggle = document.querySelector("#chatbot-toggle");
  const close = document.querySelector("#chatbot-close");
  const messages = document.querySelector("#chatbot-messages");
  const form = document.querySelector("#chatbot-form");
  const input = document.querySelector("#chatbot-input");
  const whatsapp = document.querySelector("#chatbot-whatsapp");
  if (!panel || !toggle || !close || !messages || !form || !input) return;

  const conversation = [];
  const stopWords = new Set([
    "que", "como", "para", "con", "una", "uno", "unos", "unas", "del",
    "las", "los", "por", "quiero", "tienen", "tenes", "hay", "algo",
    "busco", "necesito", "sobre", "esta", "este", "esto", "hola"
  ]);

  const knowledge = [
    {
      keywords: ["talle", "medida", "calce", "queda", "pecho", "cintura", "cadera"],
      answer: "Para elegir el talle, compará las medidas de la ficha con una prenda tuya apoyada en plano. Las etiquetas pueden variar entre marcas. Decime el nombre de la pieza y qué medida necesitás revisar."
    },
    {
      keywords: ["envio", "correo", "codigo postal", "cp", "sucursal", "domicilio", "retiro", "entrega"],
      answer: "Hacemos envíos a toda Argentina y también coordinamos entregas en CABA. El cotizador por código postal muestra una estimación; la modalidad y el importe definitivo se eligen al finalizar la compra."
    },
    {
      keywords: ["pago", "transferencia", "mercado pago", "efectivo", "tarjeta", "cuotas", "descuento"],
      answer: "Por el momento el pago es únicamente por transferencia bancaria. Completá el checkout y el alias aparecerá después de tocar Comprar."
    },
    {
      keywords: ["cambio", "devolver", "devolucion", "problema", "falla", "reclamo"],
      answer: "Para revisar un cambio necesitamos el número de pedido, la prenda y el motivo. Como muchas piezas son únicas, revisá medidas y estado antes de comprar. Un caso particular siempre lo confirma una persona de Arvel."
    },
    {
      keywords: ["custom", "personalizada", "personalizado", "intervenir", "transformar", "idea propia"],
      answer: "Podemos transformar una prenda tuya o trabajar sobre una seleccionada por Arvel. Contanos prenda, talle, idea, colores, fecha y presupuesto. Cada diseño es una interpretación propia; no realizamos copias exactas."
    },
    {
      keywords: ["stock", "disponible", "vendida", "vendido"],
      answer: "El stock se controla por combinación de talle y color. La ficha muestra la disponibilidad publicada, pero una pieza no queda reservada hasta que el pedido se registra y Arvel confirma el pago."
    },
    {
      keywords: ["pedido", "comprar", "carrito", "confirmar", "seguimiento", "estado", "numero"],
      answer: "Agregá la variante correcta al carrito y completá el checkout. Si el sistema todavía trabaja por WhatsApp, el pedido no se considera recibido hasta que envíes el mensaje preparado. Guardá siempre tu número de pedido."
    },
    {
      keywords: ["lavar", "lavado", "cuidado", "material", "planchar", "secar"],
      answer: "Cada pieza puede necesitar un cuidado diferente. Revisá “Material y cuidados” en su ficha. En prendas intervenidas recomendamos lavado suave, agua fría, del revés y sin secadora, salvo que la ficha indique otra cosa."
    },
    {
      keywords: ["drop", "lanzamiento", "proximo", "novedad", "comunidad"],
      answer: "Los drops y accesos anticipados se anuncian en la home, Instagram y la comunidad de WhatsApp. Las piezas limitadas pueden no reponerse."
    },
    {
      keywords: ["remera", "remeras", "top", "tops"],
      answer: "En Remeras encontrás básicos personalizados y diseños únicos. Podés filtrar por talle y color en la tienda. Cada pieza tiene medidas exactas en su ficha para que elijas bien."
    },
    {
      keywords: ["falda", "faldas", "pollera", "polleras"],
      answer: "Nuestras Faldas son piezas Y2K únicas. Muchas son customizadas o seleccionadas con criterio. Revisá el talle comparando las medidas de tu falda favorita apoyada en plano."
    },
    {
      keywords: ["pantalon", "pantalones", "jean", "jeans", "denim"],
      answer: "Los Pantalones incluyen jeans customizados, denim vintage y diseños propios. Recordá que las etiquetas varían entre marcas; comparate siempre con una prenda tuya."
    },
    {
      keywords: ["campera", "camperas", "abrigo", "abrigos", "buzos", "buzo"],
      answer: "Camperas, Buzos y Abrigos son piezas de abrigo únicas y personalizadas. El talle es importante; usá el cotizador de envío o buscá con \"Ayudame con el talle\" si dudás."
    },
    {
      keywords: ["accesorio", "accesorios", "bolso", "mochila", "cinturon", "collar"],
      answer: "En Accesorios hay piezas complementarias: mochilas, bolsos, y más. Son seleccionadas por Arvel o customizadas. Cada detalle está en la ficha del producto."
    },
    {
      keywords: ["corta", "short", "shorts", "pantalon corto"],
      answer: "Los Shorts son prendas de verano únicas y personalizadas. Revisá siempre el largo y la cintura en la ficha antes de comprar."
    },
    {
      keywords: ["camisa", "camisas"],
      answer: "Las Camisas son piezas seleccionadas y customizadas. Encontrá tu estilo en la tienda; cada una tiene medidas exactas y descripción de material."
    },
    {
      keywords: ["precio", "costo", "valor", "caro", "barato"],
      answer: "Cada pieza tiene un precio justo según su complejidad y materialidad. Si es custom, el presupuesto se confirma después de revisar el proyecto."
    },
    {
      keywords: ["colores", "color", "blanco", "negro", "rosa", "azul", "verde", "rojo", "gris"],
      answer: "Cada prenda muestra sus colores disponibles en la ficha. Si buscás un color específico, escribi "busco algo rosa" o el que prefieras."
    },
    {
      keywords: ["unica", "pieza unica", "unicas", "piezas unicas", "limitada", "limitadas"],
      answer: "Muchas prendas son únicas o limitadas en cantidad. Si una te gusta, te recomendamos no esperar demasiado; pueden no reponerse."
    },
    {
      keywords: ["ofertas", "oferta", "descuento", "rebaja"],
      answer: "Las ofertas aparecen marcadas en cada prenda. Revisá la tienda para ver cuáles tienen descuento. Los descuentos son por tiempo limitado."
    }
  ];

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getProducts() {
    return Array.isArray(window.PRODUCTOS)
      ? window.PRODUCTOS.filter((product) => product && product.status !== "hidden")
      : [];
  }

  function getCurrentProduct() {
    if (!/producto\.html$/i.test(location.pathname)) return null;
    const id = new URLSearchParams(location.search).get("id");
    return getProducts().find((product) => String(product.id) === String(id)) || null;
  }

  function productStock(product) {
    const values = Object.values(product?.stockByVariant || {});
    if (values.length) {
      return values.reduce((total, value) => total + Number(value || 0), 0);
    }
    return Number(product?.stock || 0);
  }

  function appendMessage(text, sender, options = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = `chatbot-message chatbot-message--${sender}`;
    wrapper.textContent = text;

    if (options.link) {
      const link = document.createElement("a");
      link.className = "chatbot-message__link";
      link.href = options.link.href;
      link.textContent = options.link.label;
      if (options.link.external) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      wrapper.append(document.createElement("br"), link);
    }

    messages.append(wrapper);
    messages.scrollTop = messages.scrollHeight;
    return wrapper;
  }

  function showTyping() {
    const typing = appendMessage("Arvel Assistant está escribiendo…", "bot");
    typing.classList.add("chatbot-message--typing");
    return typing;
  }

  function updateWhatsAppLink() {
    if (!whatsapp || !window.Arvel?.createWhatsAppUrl) return;
    const transcript = conversation
      .slice(-4)
      .map((item) => `${item.sender === "user" ? "Clienta" : "Asistente"}: ${item.text}`)
      .join("\n");
    const current = getCurrentProduct();
    const context = current ? `\nProducto que estaba viendo: ${current.name}` : "";
    whatsapp.href = window.Arvel.createWhatsAppUrl(
      `Hola Arvel, necesito ayuda con esta consulta:${context}\n\n${transcript}`
    );
  }

  function productRecommendation(question) {
    const terms = normalize(question)
      .split(" ")
      .filter((term) => term.length > 2 && !stopWords.has(term));
    if (!terms.length) return null;

    return getProducts()
      .map((product) => {
        const searchable = normalize([
          product.name,
          product.category,
          product.collection,
          product.shortDescription,
          product.description,
          ...(product.tags || []),
          ...(product.colors || [])
        ].join(" "));
        const score = terms.reduce(
          (total, term) => total + (searchable.includes(term) ? 1 : 0),
          0
        );
        return { product, score };
      })
      .filter((item) => item.score > 0 && productStock(item.product) > 0)
      .sort((a, b) => b.score - a.score)[0]?.product || null;
  }

  function answerForCurrentProduct(normalized) {
    const product = getCurrentProduct();
    if (!product) return null;
    const asksAboutVariant = [
      "stock", "disponible", "talle", "color", "medida", "material"
    ].some((term) => normalized.includes(term));
    if (!asksAboutVariant) return null;

    const stock = productStock(product);
    const sizes = product.sizes?.length ? product.sizes.join(", ") : "consultar en la ficha";
    const colors = product.colors?.length ? product.colors.join(", ") : "consultar en la ficha";
    return {
      text: `${product.name}: ${stock > 0 ? `hay ${stock} unidad${stock === 1 ? "" : "es"} entre sus variantes` : "no figura con stock disponible"}. Talles: ${sizes}. Colores: ${colors}. Revisá la variante exacta antes de agregarla al carrito.`,
      link: { href: location.href, label: "Volver a la ficha del producto" }
    };
  }

  function findAnswer(question) {
    const normalized = normalize(question);

    if (/^(hola|buenas|buen dia|buenas tardes|buenas noches|holi)\b/.test(normalized)) {
      return { text: "¡Hola! ♡ Soy el asistente virtual de Arvel. ¿Buscás una prenda, ayuda con un talle, información de envío o querés pedir una custom?" };
    }
    if (/\b(gracias|genial|perfecto|listo)\b/.test(normalized)) {
      return { text: "¡De nada! ♡ Si necesitás una confirmación personal, podés pasar la conversación a WhatsApp desde el botón de abajo." };
    }
    if (/\b(persona|humano|humana|asesora|whatsapp|contacto)\b/.test(normalized)) {
      return {
        text: "Te paso con Arvel por WhatsApp. Ya preparé el enlace con el contexto de esta conversación.",
        link: {
          href: whatsapp?.href || "#",
          label: "Hablar con Arvel por WhatsApp",
          external: true
        }
      };
    }

    const contextual = answerForCurrentProduct(normalized);
    if (contextual) return contextual;

    const recommendation = productRecommendation(question);
    const asksForProduct = /\b(busco|producto|prenda|top|pollera|pantalon|vestido|remera|campera|denim|rosa|negro)\b/.test(normalized);
    if (asksForProduct && recommendation) {
      return {
        text: `Encontré una opción que puede servirte: ${recommendation.name}. Tiene stock publicado y podés revisar sus talles, colores, medidas y fotos en la ficha.`,
        link: {
          href: `producto.html?id=${encodeURIComponent(recommendation.id)}`,
          label: `Ver ${recommendation.name}`
        }
      };
    }
    if (asksForProduct) {
      return {
        text: "Contame un poco más: ¿qué tipo de prenda, color, talle o estilo buscás? Por ejemplo: “busco un top negro” o “quiero algo denim”.",
        link: { href: "tienda.html", label: "Ver todo el shop" }
      };
    }

    const matched = knowledge
      .map((entry) => ({
        entry,
        score: entry.keywords.reduce(
          (total, keyword) => total + (normalized.includes(normalize(keyword)) ? 1 : 0),
          0
        )
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (matched?.score > 0) return { text: matched.entry.answer };
    return {
      text: "No quiero inventarte una respuesta. Puedo ayudarte con productos, stock, talles, envíos, pagos, pedidos, cambios, cuidados o customs. Para algo más específico, pasá la consulta a WhatsApp."
    };
  }

  function answerQuestion(question) {
    appendMessage(question, "user");
    conversation.push({ sender: "user", text: question });
    input.value = "";
    updateWhatsAppLink();

    const typing = showTyping();
    window.setTimeout(() => {
      typing.remove();
      const answer = findAnswer(question);
      appendMessage(answer.text, "bot", answer);
      conversation.push({ sender: "bot", text: answer.text });
      updateWhatsAppLink();
    }, 380);
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
})();
