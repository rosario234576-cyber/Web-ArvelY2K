(function () {
  "use strict";

  // Métricas propias de Arvel: no guarda nombre, correo, teléfono ni contenido
  // de formularios. Solamente eventos anónimos de navegación para el panel.
  const API_BASE = String(window.ARVEL_API_BASE || "https://web-arvel-y2-k.vercel.app").replace(/\/+$/, "");
  const PENDING_KEY = "arvel.analytics.pending.v1";
  const VISITOR_KEY = "arvel.analytics.visitor.v1";
  const SESSION_KEY = "arvel.analytics.session.v1";
  const MAX_PENDING = 25;
  const allowedEvents = new Set([
    "page_view", "session_end", "product_click", "product_view", "add_to_cart",
    "cart_view", "checkout_start", "checkout_view", "checkout_complete", "favorite_add"
  ]);

  function randomId(prefix) {
    const value = window.crypto && window.crypto.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${value}`;
  }

  function getStoredId(storage, key, prefix) {
    try {
      let value = storage.getItem(key);
      if (!value) {
        value = randomId(prefix);
        storage.setItem(key, value);
      }
      return value;
    } catch (_) {
      return randomId(prefix);
    }
  }

  const visitorId = getStoredId(localStorage, VISITOR_KEY, "visitor");
  const sessionId = getStoredId(sessionStorage, SESSION_KEY, "session");

  function productIdFromUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      return url.searchParams.get("id") || "";
    } catch (_) {
      return "";
    }
  }

  function readPending() {
    try {
      const value = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function writePending(events) {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(events.slice(-MAX_PENDING)));
    } catch (_) {
      // La métrica nunca debe afectar la compra o la navegación.
    }
  }

  function queue(event) {
    const events = readPending();
    events.push(event);
    writePending(events);
  }

  async function send(event) {
    try {
      const response = await fetch(`${API_BASE}/api/analytics-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
        keepalive: true
      });
      if (!response.ok) throw new Error(`Analytics HTTP ${response.status}`);
      return true;
    } catch (error) {
      console.warn("No se pudo registrar una métrica de Arvel.", error);
      return false;
    }
  }

  async function flushPending() {
    const pending = readPending();
    if (!pending.length) return;
    const unsent = [];
    for (const event of pending) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await send(event))) unsent.push(event);
    }
    writePending(unsent);
  }

  function track(eventType, details) {
    if (!allowedEvents.has(eventType)) return;
    const payload = {
      eventType,
      visitorId,
      sessionId,
      pagePath: window.location.pathname || "/",
      pageTitle: document.title || "Arvel Customs",
      productId: details && details.productId ? String(details.productId) : "",
      productName: details && details.productName ? String(details.productName).slice(0, 120) : "",
      source: details && details.source ? String(details.source).slice(0, 80) : "",
      occurredAt: new Date().toISOString()
    };
    send(payload).then((sent) => { if (!sent) queue(payload); });
  }

  function trackCurrentPage() {
    const path = window.location.pathname.toLowerCase();
    const productId = productIdFromUrl(window.location.href);
    track("page_view", { productId });
    if (path.endsWith("producto.html")) track("product_view", { productId });
    if (path.endsWith("carrito.html")) track("cart_view");
    if (path.endsWith("checkout.html")) track("checkout_view");
  }

  function productDetailsFromNode(node) {
    const card = node.closest("[data-product-id]");
    const productId = card && card.dataset.productId
      ? card.dataset.productId
      : productIdFromUrl(node.href || window.location.href);
    const name = card && card.querySelector(".product-card__name")
      ? card.querySelector(".product-card__name").textContent.trim()
      : "";
    return { productId, productName: name };
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("a, button");
    if (!target) return;

    if (target.matches("a[href*='producto.html']")) {
      track("product_click", { ...productDetailsFromNode(target), source: "catalog" });
      return;
    }
    if (target.matches("#add-to-cart, [data-card-add]")) {
      track("add_to_cart", { ...productDetailsFromNode(target), source: "catalog" });
      return;
    }
    if (target.matches("[data-favorite-id], #product-favorite")) {
      track("favorite_add", { ...productDetailsFromNode(target), source: "catalog" });
      return;
    }
    if (target.matches("a[href*='checkout.html'], #buy-now, [data-card-buy]")) {
      track("checkout_start", { ...productDetailsFromNode(target), source: "cart" });
    }
  }, { passive: true });

  // La salida es una señal aproximada: mobile puede cerrar la pestaña sin red,
  // por eso el registro se envía con keepalive y se reintenta al volver.
  let endTracked = false;
  function trackEnd() {
    if (endTracked) return;
    endTracked = true;
    track("session_end");
  }

  window.ArvelAnalytics = { track };
  flushPending();
  trackCurrentPage();
  window.addEventListener("pagehide", trackEnd, { once: true });
}());
