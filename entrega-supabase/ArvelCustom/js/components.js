(function () {
  "use strict";

  const ARVEL_CONFIG = Object.freeze({
    whatsappNumber: "5491132547101",
    whatsappCommunityUrl: "https://chat.whatsapp.com/DsmmL631iS27FqwRp3zRrU",
    instagramUrl: "https://www.instagram.com/arvel.customsy2k/",
    instagramClientsUrl: "https://www.instagram.com/stories/highlights/18113605399635699/",
    tiktokUrl: "https://www.tiktok.com/@arvel.customsy2k?is_from_webapp=1&sender_device=pc",
    brandName: "Arvel Customs"
  });

  const navigationItems = [
    ["Inicio", "index.html"],
    ["Shop", "tienda.html"],
    ["Próximo drop", "index.html#proximo-drop"],
    ["Custom by Arvel", "custom.html"],
    ["Nosotros", "nosotros.html"]
  ];

  function getCurrentPage() {
    const page = window.location.pathname.split("/").pop();
    return page || "index.html";
  }

  function createNavigationLinks(className) {
    const currentPage = getCurrentPage();

    return navigationItems
      .map(([label, href]) => {
        const targetPage = href.split("#")[0];
        const current = currentPage === targetPage ? ' aria-current="page"' : "";
        return `<a class="${className}" href="${href}"${current}>${label}</a>`;
      })
      .join("");
  }

  function createHeader() {
    return `
      <div class="promo-bar" aria-label="Información importante">
        <div class="promo-bar__track">
          <div class="promo-bar__group">
            <span>Envíos a todo el país</span>
            <span aria-hidden="true">✦</span>
            <span>Piezas únicas: cuando se van, no vuelven</span>
            <span aria-hidden="true">♡</span>
            <span>Acceso anticipado por WhatsApp</span>
            <span aria-hidden="true">✦</span>
            <span>Customizadas en Buenos Aires</span>
            <span aria-hidden="true">♡</span>
          </div>
          <div class="promo-bar__group" aria-hidden="true">
            <span>Envíos a todo el país</span>
            <span>✦</span>
            <span>Piezas únicas: cuando se van, no vuelven</span>
            <span>♡</span>
            <span>Acceso anticipado por WhatsApp</span>
            <span>✦</span>
            <span>Customizadas en Buenos Aires</span>
            <span>♡</span>
          </div>
        </div>
      </div>
      <header class="site-header" id="site-header-inner">
        <div class="container site-header__inner">
          <button
            class="header-action menu-toggle"
            type="button"
            aria-expanded="false"
            aria-controls="mobile-navigation"
            aria-label="Abrir menú principal"
          >
            <span class="menu-icon" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="header-action__label">Menú</span>
          </button>

          <a class="site-logo" href="index.html" aria-label="Arvel Customs, inicio">
            <img src="assets/logo/LogoBlanco.png" alt="" width="1080" height="1080">
          </a>

          <nav class="desktop-navigation" aria-label="Navegación principal">
            ${createNavigationLinks("desktop-navigation__link")}
          </nav>

          <div class="header-actions">
            <button
              class="header-action search-toggle"
              type="button"
              aria-haspopup="dialog"
              aria-controls="search-dialog"
              aria-expanded="false"
              aria-label="Buscar productos"
            >
              <img class="header-action__icon" src="assets/icons/lupa.png" alt="" width="512" height="512">
              <span class="header-action__label">Buscar</span>
            </button>
            <a class="header-action" href="tienda.html?favoritos=1" aria-label="Ver favoritos">
              <img class="header-action__icon" src="assets/icons/favorito.png" alt="" width="512" height="512">
              <span class="header-action__label">Favoritos</span>
              <span class="counter" id="favorites-count" aria-label="0 favoritos">0</span>
            </a>
            <a class="header-action" href="carrito.html" aria-label="Ver carrito">
              <img class="header-action__icon" src="assets/icons/carrito-de-compras.png" alt="" width="512" height="512">
              <span class="header-action__label">Carrito</span>
              <span class="counter" id="cart-count" aria-label="0 productos">0</span>
            </a>
          </div>
        </div>

        <nav
          class="mobile-navigation"
          id="mobile-navigation"
          aria-label="Navegación móvil"
          aria-hidden="true"
        >
          <div class="mobile-navigation__header">
            <span class="eyebrow">Navegación</span>
            <button class="mobile-navigation__close" type="button" aria-label="Cerrar menú">×</button>
          </div>
          <div class="mobile-navigation__links">
            ${createNavigationLinks("mobile-navigation__link")}
          </div>
          <div class="mobile-navigation__social">
            <a href="${ARVEL_CONFIG.instagramUrl}" target="_blank" rel="noopener noreferrer">
              Instagram ↗
            </a>
            <a href="${ARVEL_CONFIG.tiktokUrl}" target="_blank" rel="noopener noreferrer">
              TikTok ↗
            </a>
            <a href="${ARVEL_CONFIG.whatsappCommunityUrl}" target="_blank" rel="noopener noreferrer">
              Comunidad ↗
            </a>
            <a href="contacto.html">Contacto</a>
          </div>
        </nav>
        <button class="navigation-backdrop" type="button" tabindex="-1" aria-label="Cerrar menú"></button>
      </header>
    `;
  }

  function createFooter() {
    return `
      <footer class="site-footer">
        <div class="container">
          <section class="footer-newsletter" aria-labelledby="newsletter-title">
            <div>
              <span class="eyebrow">Entrá antes que nadie</span>
              <h2 class="display-title" id="newsletter-title">El próximo drop llega por mail</h2>
            </div>
            <form class="newsletter-form" id="newsletter-form" novalidate>
              <label class="visually-hidden" for="newsletter-email">Correo electrónico</label>
              <input
                class="input"
                id="newsletter-email"
                name="email"
                type="email"
                autocomplete="email"
                placeholder="tu@email.com"
                aria-describedby="newsletter-help newsletter-status"
                required
              >
              <button class="button button--pink" type="submit">Quiero entrar</button>
              <small class="field-help" id="newsletter-help">
                Demostración: todavía no se envían datos a un servicio externo.
              </small>
              <p class="newsletter-form__status" id="newsletter-status" aria-live="polite"></p>
            </form>
          </section>

          <div class="site-footer__grid">
            <div class="site-footer__brand">
              <a class="footer-logo" href="index.html" aria-label="Arvel Customs, inicio">
                <img src="assets/logo/LogoBlanco.png" alt="" width="1080" height="1080">
              </a>
              <p>Internet nostalgia, prendas que no se repiten.</p>
              <div class="cluster">
                <a href="${ARVEL_CONFIG.instagramUrl}" target="_blank" rel="noopener noreferrer">
                  Instagram ↗
                </a>
                <a href="${ARVEL_CONFIG.tiktokUrl}" target="_blank" rel="noopener noreferrer">
                  TikTok ↗
                </a>
                <a href="${createWhatsAppUrl("Hola Arvel, quiero hacer una consulta.")}" target="_blank" rel="noopener noreferrer">
                  WhatsApp ↗
                </a>
                <a href="${ARVEL_CONFIG.whatsappCommunityUrl}" target="_blank" rel="noopener noreferrer">
                  Comunidad ↗
                </a>
              </div>
            </div>

            <nav class="footer-column" aria-label="Comprar">
              <h3>Comprar</h3>
              <a href="tienda.html">Shop</a>
              <a href="archivo.html">Archivo</a>
              <a href="custom.html">Custom by Arvel</a>
              <a href="lookbook.html">Lookbook</a>
            </nav>

            <nav class="footer-column" aria-label="Ayuda">
              <h3>Ayuda</h3>
              <a href="preguntas-frecuentes.html">Preguntas frecuentes</a>
              <a href="envios.html">Envíos y entregas</a>
              <a href="cambios.html">Cambios</a>
              <a href="contacto.html">Contacto</a>
            </nav>

            <nav class="footer-column" aria-label="Información legal">
              <h3>Legal</h3>
              <a href="terminos.html">Términos</a>
              <a href="privacidad.html">Privacidad</a>
              <p>Pagos: Mercado Pago y transferencia.</p>
              <p>Envíos a toda la Argentina.</p>
            </nav>
          </div>

          <div class="site-footer__bottom">
            <p>© <span id="current-year"></span> Arvel Customs</p>
            <p>Diseñado para piezas únicas.</p>
          </div>
        </div>
      </footer>
    `;
  }

  function createOverlays() {
    const whatsappUrl = createWhatsAppUrl("Hola Arvel, quiero consultar por una prenda.");

    return `
      <dialog class="search-dialog" id="search-dialog" aria-labelledby="search-title">
        <div class="search-dialog__header">
          <h2 id="search-title">¿Qué estás buscando?</h2>
          <button class="search-dialog__close" type="button" aria-label="Cerrar búsqueda">×</button>
        </div>
        <form class="search-dialog__form" action="tienda.html" method="get">
          <label class="visually-hidden" for="global-search">Buscar por nombre o categoría</label>
          <input
            class="search-dialog__input"
            id="global-search"
            name="buscar"
            type="search"
            placeholder="Top, denim, mini..."
            autocomplete="off"
            required
          >
          <button class="button button--pink" type="submit">Buscar</button>
        </form>
        <p class="field-help">Probá con “top”, “denim” o “custom”.</p>
      </dialog>

      <section class="chatbot-panel" id="chatbot-panel" aria-labelledby="chatbot-title" hidden>
        <header class="chatbot-panel__header">
          <div>
            <span class="chatbot-panel__status" aria-hidden="true"></span>
            <div>
              <h2 id="chatbot-title">Arvel Assistant</h2>
              <p>Asistente virtual · respuestas inmediatas</p>
            </div>
          </div>
          <button id="chatbot-close" type="button" aria-label="Cerrar asistente">×</button>
        </header>
        <div class="chatbot-messages" id="chatbot-messages" aria-live="polite">
          <div class="chatbot-message chatbot-message--bot">
            Hola ♡ Soy el asistente virtual de Arvel. Puedo ayudarte con talles,
            envíos, pagos, cambios, drops y pedidos custom.
          </div>
        </div>
        <div class="chatbot-quick-replies" aria-label="Preguntas rápidas">
          <button type="button" data-chat-question="Ayudame con el talle">Ayudame con el talle</button>
          <button type="button" data-chat-question="¿Cuánto cuesta el envío?">Consultar envíos</button>
          <button type="button" data-chat-question="¿Qué medios de pago aceptan?">Medios de pago</button>
          <button type="button" data-chat-question="Quiero pedir una custom">Pedir una custom</button>
        </div>
        <form class="chatbot-form" id="chatbot-form">
          <label class="visually-hidden" for="chatbot-input">Escribí tu pregunta</label>
          <input
            id="chatbot-input"
            name="question"
            type="text"
            maxlength="240"
            autocomplete="off"
            placeholder="Escribí tu pregunta..."
            required
          >
          <button type="submit" aria-label="Enviar pregunta">→</button>
        </form>
        <a class="chatbot-whatsapp" href="${whatsappUrl}" target="_blank" rel="noopener noreferrer">
          Hablar con una persona por WhatsApp ↗
        </a>
      </section>

      <div class="floating-actions" aria-label="Accesos rápidos">
        <button class="floating-button back-to-top" type="button" aria-label="Volver arriba" hidden>
          ↑
        </button>
        <button
          class="floating-button floating-button--chat"
          id="chatbot-toggle"
          type="button"
          aria-label="Abrir asistente virtual"
          aria-controls="chatbot-panel"
          aria-expanded="false"
        >
          ?
        </button>
        <a
          class="floating-button floating-button--whatsapp"
          href="${whatsappUrl}"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Consultar por WhatsApp"
        >
          <img src="assets/icons/whatsapp.png" alt="" width="512" height="512">
        </a>
      </div>
    `;
  }

  function createWhatsAppUrl(message) {
    return `https://wa.me/${ARVEL_CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
  }

  function formatPrice(value) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0
    }).format(value);
  }

  function getProductBadge(product) {
    if (product.soldOut) return ["Vendida", "badge--dark"];
    if (product.discount > 0) return ["Oferta", "badge--sale"];
    if (product.uniquePiece) return ["Pieza única", "badge--pink"];
    if (product.stock === 1) return ["Solo queda 1", ""];
    return ["Nuevo", ""];
  }

  function createProductCard(product) {
    const [badgeLabel, badgeClass] = getProductBadge(product);
    const price = product.oldPrice
      ? `<span class="product-card__old-price">${formatPrice(product.oldPrice)}</span>${formatPrice(product.price)}`
      : formatPrice(product.price);
    const image = product.images[0] || "assets/images/moodboard/arvel-editorial-hero.png";
    const sizes = product.sizes.join("/");

    return `
      <article class="product-card" data-product-id="${product.id}" data-reveal>
        <div class="product-card__media">
          <a href="producto.html?id=${product.id}" aria-label="Ver ${product.name}">
            <img
              src="${image}"
              alt="${product.name}. ${product.shortDescription}"
              width="1080"
              height="1440"
              loading="lazy"
            >
          </a>
          <div class="product-card__badges">
            <span class="badge ${badgeClass}">${badgeLabel}</span>
          </div>
          <button
            class="button button--icon product-card__favorite"
            type="button"
            data-favorite-id="${product.id}"
            aria-label="Agregar ${product.name} a favoritos"
            aria-pressed="false"
          ><img src="assets/icons/favorito.png" alt="" width="512" height="512"></button>
          <a class="product-card__quick-view" href="producto.html?id=${product.id}">
            Vista rápida
          </a>
        </div>
        <div class="product-card__body">
          <h3 class="product-card__name">
            <a href="producto.html?id=${product.id}">${product.name}</a>
          </h3>
          <p class="product-card__meta">Talle ${sizes} · ${product.condition}</p>
          <p class="product-card__price">${price}</p>
        </div>
      </article>
    `;
  }

  function renderGlobalComponents() {
    const headerTarget = document.querySelector("#site-header");
    const footerTarget = document.querySelector("#site-footer");
    const overlaysTarget = document.querySelector("#global-overlays");

    if (headerTarget) headerTarget.innerHTML = createHeader();
    if (footerTarget) footerTarget.innerHTML = createFooter();
    if (overlaysTarget) overlaysTarget.innerHTML = createOverlays();
  }

  window.Arvel = Object.freeze({
    config: ARVEL_CONFIG,
    createWhatsAppUrl,
    formatPrice,
    createProductCard,
    renderGlobalComponents
  });

  renderGlobalComponents();
})();
