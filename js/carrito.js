(async function () {
  "use strict";

  const FREE_SHIPPING_THRESHOLD = 100000;
  const STANDARD_SHIPPING_COST = 6500;
  const catalog = window.ARVEL_PRODUCTS_READY
    ? await window.ARVEL_PRODUCTS_READY
    : window.ARVEL_PRODUCTS;
  const products = Array.isArray(catalog) ? catalog : [];

  const elements = {
    empty: document.querySelector("#cart-empty"),
    content: document.querySelector("#cart-content"),
    list: document.querySelector("#cart-list"),
    itemCount: document.querySelector("#cart-item-count"),
    clear: document.querySelector("#clear-cart"),
    clearDialog: document.querySelector("#clear-cart-dialog"),
    clearCancel: document.querySelector("#cancel-clear-cart"),
    clearConfirm: document.querySelector("#confirm-clear-cart"),
    subtotal: document.querySelector("#cart-subtotal"),
    discountRow: document.querySelector("#discount-row"),
    discount: document.querySelector("#cart-discount"),
    shipping: document.querySelector("#cart-shipping"),
    total: document.querySelector("#cart-total"),
    progress: document.querySelector("#shipping-progress"),
    progressBar: document.querySelector("#shipping-progress-bar"),
    progressMessage: document.querySelector("#shipping-progress-message"),
    recommendationsSection: document.querySelector("#cart-recommendations-section"),
    recommendations: document.querySelector("#cart-recommendations")
  };

  function getCart() {
    return window.ArvelStore.readStoredArray(window.ArvelStore.storageKeys.cart);
  }

  function saveCart(cart) {
    localStorage.setItem(window.ArvelStore.storageKeys.cart, JSON.stringify(cart));
    window.ArvelStore.updateGlobalCounters();
  }

  function productKey(product) {
    return String(product?.documentId || product?.id || "");
  }

  function itemKey(item) {
    return String(item?.documentId || item?.id || "");
  }

  function findProduct(itemOrId) {
    const key = typeof itemOrId === "object" ? itemKey(itemOrId) : String(itemOrId ?? "");
    return products.find(
      (product) => productKey(product) === key || String(product.id ?? "") === key
    );
  }

  function getVariantStock(product, size, color) {
    const key = `${size}|${color}`;
    const variants = product?.stockByVariant && typeof product.stockByVariant === "object"
      ? product.stockByVariant
      : {};
    if (Object.hasOwn(variants, key)) return Math.max(0, Number(variants[key]) || 0);
    return Object.keys(variants).length ? 0 : Math.max(0, Number(product?.stock) || 0);
  }

  function sanitizeCart(cart) {
    let changed = false;
    const sanitized = cart
      .map((item) => {
        const product = findProduct(item);
        if (!product || product.soldOut || product.archived) {
          changed = true;
          return null;
        }

        const stock = getVariantStock(product, item.size, item.color);
        if (stock <= 0) {
          changed = true;
          return null;
        }

        const safeQuantity = Math.min(Math.max(1, Number(item.quantity) || 1), stock);
        if (safeQuantity !== item.quantity || item.price !== product.price) changed = true;

        return {
          id: productKey(product),
          documentId: product.documentId || "",
          variant_id: item.variant_id || item.variantId || `${productKey(product)}::${item.size}::${item.color}`,
          variantId: item.variantId || item.variant_id || `${productKey(product)}::${item.size}::${item.color}`,
          size: item.size,
          color: item.color,
          quantity: safeQuantity,
          price: product.price
        };
      })
      .filter(Boolean);

    if (changed) saveCart(sanitized);
    return sanitized;
  }

  function createCartItem(item) {
    const product = findProduct(item);
    const key = productKey(product);
    const stock = getVariantStock(product, item.size, item.color);
    const image = product.images[0] || "assets/images/moodboard/optimized/arvel-editorial-hero-720.jpg";
    const lineTotal = product.price * item.quantity;

    return `
      <article
        class="cart-item"
        data-cart-id="${key}"
        data-size="${item.size}"
        data-color="${item.color}"
      >
        <a class="cart-item__image" href="producto.html?id=${encodeURIComponent(key)}">
          <img
            src="${image}"
            alt="${product.name}"
            width="270"
            height="360"
            loading="lazy"
          >
        </a>
        <div class="cart-item__info">
          <div>
            <p class="eyebrow">${product.collection}</p>
            <h3><a href="producto.html?id=${encodeURIComponent(key)}">${product.name}</a></h3>
            <p class="cart-item__variants">Talle ${item.size} · ${item.color}</p>
          </div>
          <div class="cart-item__controls">
            <div class="quantity-control">
              <button type="button" data-cart-action="decrease" aria-label="Reducir cantidad de ${product.name}">−</button>
              <input
                type="number"
                min="1"
                max="${stock}"
                value="${item.quantity}"
                inputmode="numeric"
                aria-label="Cantidad de ${product.name}"
                data-cart-quantity
              >
              <button type="button" data-cart-action="increase" aria-label="Aumentar cantidad de ${product.name}">＋</button>
            </div>
            <p class="cart-item__stock">${stock === 1 ? "Última unidad" : `Máximo ${stock}`}</p>
          </div>
          <button class="cart-item__remove" type="button" data-cart-action="remove">
            Eliminar
          </button>
        </div>
        <p class="cart-item__price">${window.Arvel.formatPrice(lineTotal)}</p>
      </article>
    `;
  }

  function calculateTotals(cart) {
    return cart.reduce(
      (totals, item) => {
        const product = findProduct(item);
        totals.subtotal += product.price * item.quantity;
        if (product.oldPrice) {
          totals.discount += (product.oldPrice - product.price) * item.quantity;
        }
        totals.quantity += item.quantity;
        return totals;
      },
      { subtotal: 0, discount: 0, quantity: 0 }
    );
  }

  function updateSummary(cart) {
    const totals = calculateTotals(cart);
    const freeShipping = totals.subtotal >= FREE_SHIPPING_THRESHOLD;
    const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - totals.subtotal);
    const progress = Math.min(100, (totals.subtotal / FREE_SHIPPING_THRESHOLD) * 100);

    elements.itemCount.textContent = String(totals.quantity);
    elements.subtotal.textContent = window.Arvel.formatPrice(totals.subtotal);
    elements.discountRow.hidden = totals.discount === 0;
    elements.discount.textContent = `− ${window.Arvel.formatPrice(totals.discount)}`;

    const shippingRow = document.querySelector("#shipping-row");
    if (shippingRow) {
      shippingRow.hidden = true;
    }

    console.log("Total actualizado a:", totals.subtotal);
    elements.total.textContent = window.Arvel.formatPrice(totals.subtotal);
    elements.progress.setAttribute(
      "aria-valuenow",
      String(Math.min(FREE_SHIPPING_THRESHOLD, totals.subtotal))
    );
    elements.progressBar.style.width = `${progress}%`;
    elements.progressMessage.innerHTML = freeShipping
      ? "<strong>¡Tenés envío gratis!</strong>"
      : `Te faltan <strong>${window.Arvel.formatPrice(remaining)}</strong> para el envío gratis.`;
  }

  function renderRecommendations(cart) {
    const cartIds = new Set(cart.map(itemKey));
    const suggestions = products
      .filter(
        (product) =>
          !cartIds.has(productKey(product)) &&
          !product.soldOut &&
          !product.archived &&
          product.stock > 0
      )
      .sort((a, b) => Number(b.featured) - Number(a.featured))
      .slice(0, 4);

    elements.recommendations.innerHTML = suggestions
      .map(window.Arvel.createProductCard)
      .join("");
    elements.recommendations
      .querySelectorAll("[data-reveal]")
      .forEach((card) => card.classList.add("is-visible"));
    elements.recommendationsSection.hidden = suggestions.length === 0;
  }

  function render() {
    const cart = sanitizeCart(getCart());
    const hasItems = cart.length > 0;

    elements.empty.hidden = hasItems;
    elements.content.hidden = !hasItems;
    elements.list.innerHTML = cart.map(createCartItem).join("");

    if (hasItems) updateSummary(cart);
    renderRecommendations(cart);
    window.ArvelStore.updateGlobalCounters();
  }

  function findItemIndex(cart, itemElement) {
    return cart.findIndex(
      (item) =>
        itemKey(item) === itemElement.dataset.cartId &&
        item.size === itemElement.dataset.size &&
        item.color === itemElement.dataset.color
    );
  }

  function updateItem(itemElement, action, explicitQuantity) {
    const cart = getCart();
    const index = findItemIndex(cart, itemElement);
    if (index < 0) return;

    const item = cart[index];
    const product = findProduct(item);
    const stock = getVariantStock(product, item.size, item.color);

    if (action === "remove") cart.splice(index, 1);
    else {
      const nextQuantity =
        explicitQuantity ??
        (action === "increase" ? item.quantity + 1 : item.quantity - 1);

      if (nextQuantity <= 0) cart.splice(index, 1);
      else item.quantity = Math.min(stock, Math.max(1, nextQuantity));
    }

    saveCart(cart);
    render();
  }

  function bindEvents() {
    elements.list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-cart-action]");
      const item = event.target.closest(".cart-item");
      if (!button || !item) return;
      updateItem(item, button.dataset.cartAction);
    });

    elements.list.addEventListener("change", (event) => {
      const input = event.target.closest("[data-cart-quantity]");
      const item = event.target.closest(".cart-item");
      if (!input || !item) return;
      updateItem(item, "set", Number(input.value) || 1);
    });

    elements.clear.addEventListener("click", () => elements.clearDialog.showModal());
    elements.clearCancel.addEventListener("click", () => elements.clearDialog.close());
    elements.clearConfirm.addEventListener("click", () => {
      saveCart([]);
      elements.clearDialog.close();
      render();
    });
    elements.clearDialog.addEventListener("click", (event) => {
      if (event.target === elements.clearDialog) elements.clearDialog.close();
    });
  }

  bindEvents();
  render();
})();
