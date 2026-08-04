(async function () {
  "use strict";

  const RECENT_KEY = "arvel-recent-products";
  const params = new URLSearchParams(window.location.search);
  const productId = String(params.get("id") || "");
  const catalog = window.ARVEL_PRODUCTS_READY
    ? await window.ARVEL_PRODUCTS_READY
    : window.ARVEL_PRODUCTS;
  const products = Array.isArray(catalog) ? catalog : [];
  const productKey = (item) => String(item?.documentId || item?.id || "");
  const product = products.find(
    (item) => productKey(item) === productId || String(item.id ?? "") === productId
  );
  let suppressZoom = false;
  let imageIsZoomed = false;

  const elements = {
    loading: document.querySelector("#product-loading"),
    detail: document.querySelector("#product-detail"),
    breadcrumb: document.querySelector("#breadcrumb-product"),
    mainImage: document.querySelector("#product-main-image"),
    thumbnails: document.querySelector("#product-thumbnails"),
    zoomTrigger: document.querySelector("#product-zoom-trigger"),
    galleryPrevious: document.querySelector("#product-gallery-prev"),
    galleryNext: document.querySelector("#product-gallery-next"),
    zoomDialog: document.querySelector("#image-zoom-dialog"),
    zoomImage: document.querySelector("#zoomed-product-image"),
    zoomClose: document.querySelector(".image-zoom-dialog__close"),
    badges: document.querySelector("#product-badges"),
    collection: document.querySelector("#product-collection"),
    name: document.querySelector("#product-name"),
    shortDescription: document.querySelector("#product-short-description"),
    price: document.querySelector("#product-price"),
    uniqueNotice: document.querySelector("#product-unique-notice"),
    form: document.querySelector("#product-form"),
    sizes: document.querySelector("#size-options"),
    colors: document.querySelector("#color-options"),
    quantity: document.querySelector("#product-quantity"),
    stockStatus: document.querySelector("#stock-status"),
    formError: document.querySelector("#product-form-error"),
    addButton: document.querySelector("#add-to-cart"),
    buyButton: document.querySelector("#buy-now"),
    favoriteButton: document.querySelector("#product-favorite"),
    description: document.querySelector("#product-description"),
    condition: document.querySelector("#product-condition"),
    measurements: document.querySelector("#product-measurements"),
    material: document.querySelector("#product-material"),
    care: document.querySelector("#product-care"),
    whatsapp: document.querySelector("#product-whatsapp"),
    shippingForm: document.querySelector("#shipping-estimator-form"),
    shippingPostalCode: document.querySelector("#shipping-postal-code"),
    shippingResult: document.querySelector("#shipping-estimator-result"),
    relatedSection: document.querySelector("#related-section"),
    related: document.querySelector("#related-products"),
    recentSection: document.querySelector("#recent-section"),
    recent: document.querySelector("#recent-products")
  };

  function showNotFound() {
    elements.loading.className = "container empty-state product-not-found";
    elements.loading.innerHTML = `
      <div class="stack stack--4">
        <span class="empty-state__symbol" aria-hidden="true">?</span>
        <h1>No encontramos esta pieza</h1>
        <p>Puede haber sido movida o el enlace no es correcto.</p>
        <a class="button button--pink" href="tienda.html">Volver al shop</a>
      </div>
    `;
    document.title = "Pieza no encontrada | Arvel Custom Y2K";
  }

  function createBadges() {
    const badges = [];
    if (product.soldOut) badges.push('<span class="badge badge--dark">Vendida</span>');
    if (product.discount > 0) badges.push(`<span class="badge badge--sale">-${product.discount}%</span>`);
    if (product.uniquePiece) badges.push('<span class="badge badge--pink">Pieza única</span>');
    if (!product.soldOut && product.stock === 1) badges.push('<span class="badge">Solo queda 1</span>');
    elements.badges.innerHTML = badges.join("");
  }

  function renderPrice() {
    const oldPrice = product.oldPrice
      ? `<del>${window.Arvel.formatPrice(product.oldPrice)}</del>`
      : "";
    const cardPrice = Number(product.price || 0);
    const transferPrice = Number(product.transferPrice || cardPrice);
    const installmentPrice = cardPrice / 3;
    elements.price.innerHTML = `
      <span class="product-info__price-main">${oldPrice}<strong>Tarjeta: ${window.Arvel.formatPrice(cardPrice)}</strong></span>
      <span class="product-info__price-option">Transferencia: ${window.Arvel.formatPrice(transferPrice)}</span>
      <span class="product-info__price-option" data-mercadopago-financing hidden>Hasta 3 cuotas de ${window.Arvel.formatPrice(installmentPrice)} con Mercado Pago</span>
    `;
    if (window.ARVEL_MERCADOPAGO_READY === true) {
      elements.price.querySelector("[data-mercadopago-financing]").hidden = false;
    }
  }

  function renderGallery() {
    const images = product.images.length
      ? product.images
      : ["assets/images/moodboard/arvel-editorial-hero.png"];
    let currentIndex = 0;
    let pointerStartX = 0;

    function selectImage(image, index) {
      currentIndex = index;
      elements.mainImage.src = image;
      elements.mainImage.alt = `Imagen ${index + 1} de ${product.name}`;
      elements.zoomImage.src = image;
      elements.zoomImage.alt = `Imagen ampliada de ${product.name}`;
      elements.thumbnails.querySelectorAll("button").forEach((button, buttonIndex) => {
        button.setAttribute("aria-pressed", String(buttonIndex === index));
      });
    }

    function moveGallery(direction) {
      const nextIndex = (currentIndex + direction + images.length) % images.length;
      selectImage(images[nextIndex], nextIndex);
    }

    elements.galleryPrevious.hidden = images.length < 2;
    elements.galleryNext.hidden = images.length < 2;

    elements.thumbnails.innerHTML = images
      .map(
        (image, index) => `
          <button
            type="button"
            aria-label="Ver imagen ${index + 1} de ${product.name}"
            aria-pressed="${index === 0}"
            data-image-index="${index}"
          >
            <img src="${image}" alt="" width="180" height="240">
          </button>
        `
      )
      .join("");

    elements.thumbnails.addEventListener("click", (event) => {
      const button = event.target.closest("[data-image-index]");
      if (!button) return;
      const index = Number(button.dataset.imageIndex);
      selectImage(images[index], index);
    });

    elements.galleryPrevious.addEventListener("click", () => moveGallery(-1));
    elements.galleryNext.addEventListener("click", () => moveGallery(1));
    elements.zoomTrigger.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveGallery(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveGallery(1);
      }
    });
    elements.zoomTrigger.addEventListener("pointerdown", (event) => {
      pointerStartX = event.clientX;
    });
    elements.zoomTrigger.addEventListener("pointerup", (event) => {
      const distance = event.clientX - pointerStartX;
      if (Math.abs(distance) < 45) return;
      suppressZoom = true;
      moveGallery(distance < 0 ? 1 : -1);
    });

    selectImage(images[0], 0);
  }

  function createVariantOptions(values, name, container) {
    container.innerHTML = values
      .map(
        (value, index) => `
          <label class="variant-option">
            <input type="radio" name="${name}" value="${value}" ${values.length === 1 ? "checked" : ""}>
            <span>${value}</span>
          </label>
        `
      )
      .join("");
  }

  function getSelection() {
    return {
      size: elements.form.elements.size?.value || "",
      color: elements.form.elements.color?.value || "",
      quantity: Math.max(1, Number(elements.quantity.value) || 1)
    };
  }

  function getVariantStock(size, color) {
    const key = `${size}|${color}`;
    if (Object.hasOwn(product.stockByVariant, key)) return product.stockByVariant[key];
    return Object.keys(product.stockByVariant).length ? 0 : product.stock;
  }

  function updateStockStatus() {
    const selection = getSelection();
    const stock = selection.size && selection.color
      ? getVariantStock(selection.size, selection.color)
      : product.stock;
    const unavailable = product.soldOut || stock <= 0;

    elements.quantity.max = String(Math.max(1, stock));
    if (selection.quantity > stock && stock > 0) elements.quantity.value = String(stock);
    elements.stockStatus.textContent = unavailable
      ? "Sin stock disponible"
      : stock === 1
        ? "Última unidad disponible"
        : `${stock} unidades disponibles`;
    elements.stockStatus.classList.toggle("is-low", stock === 1 && !unavailable);
    elements.addButton.disabled = unavailable;
    elements.buyButton.disabled = unavailable;
  }

  function validateSelection() {
    const selection = getSelection();
    if (!selection.size || !selection.color) {
      elements.formError.textContent = "Elegí talle y color antes de agregar esta pieza.";
      const missingGroup = !selection.size ? elements.sizes : elements.colors;
      missingGroup.querySelector("input")?.focus();
      return null;
    }

    const stock = getVariantStock(selection.size, selection.color);
    if (stock <= 0 || product.soldOut) {
      elements.formError.textContent = "Esta variante no tiene stock disponible.";
      return null;
    }

    if (selection.quantity > stock) {
      elements.formError.textContent = `Solo hay ${stock} unidad${stock === 1 ? "" : "es"} disponible${stock === 1 ? "" : "s"}.`;
      elements.quantity.focus();
      return null;
    }

    elements.formError.textContent = "";
    return selection;
  }

  function addToCart(redirectAfter) {
    const selection = validateSelection();
    if (!selection) return false;

    const cart = window.ArvelStore.readStoredArray(window.ArvelStore.storageKeys.cart);
    const existing = cart.find(
      (item) =>
        String(item.documentId || item.id) === productKey(product) &&
        item.size === selection.size &&
        item.color === selection.color
    );
    const stock = getVariantStock(selection.size, selection.color);
    const nextQuantity = (existing?.quantity || 0) + selection.quantity;

    if (nextQuantity > stock) {
      elements.formError.textContent = `Ya tenés unidades de esta variante en el carrito. El máximo es ${stock}.`;
      return false;
    }

    if (existing) existing.quantity = nextQuantity;
    else {
      const variantId = `${productKey(product)}::${selection.size}::${selection.color}`;
      cart.push({
        id: productKey(product),
        documentId: product.documentId || "",
        variant_id: variantId,
        variantId,
        size: selection.size,
        color: selection.color,
        quantity: selection.quantity,
        price: product.price
      });
    }

    localStorage.setItem(window.ArvelStore.storageKeys.cart, JSON.stringify(cart));
    window.ArvelStore.updateGlobalCounters();
    elements.addButton.textContent = "Agregada ✓";
    window.setTimeout(() => {
      elements.addButton.textContent = "Agregar al carrito";
    }, 1800);

    if (!redirectAfter) {
      window.ArvelStore.showToast(
        `${product.name} · talle ${selection.size} · ${selection.color}`,
        { href: "carrito.html", label: "Ver carrito →" }
      );
    }

    if (redirectAfter) window.location.href = "carrito.html";
    return true;
  }

  function updateFavoriteButton() {
    const favorites = window.ArvelStore.readStoredArray(window.ArvelStore.storageKeys.favorites);
    const isFavorite = favorites.some((id) => String(id) === productKey(product));
    elements.favoriteButton.setAttribute("aria-pressed", String(isFavorite));
    elements.favoriteButton.querySelector("span").textContent = isFavorite
      ? "Guardada en favoritos"
      : "Guardar en favoritos";
    elements.favoriteButton.classList.toggle("is-favorite", isFavorite);
  }

  function toggleFavorite() {
    const favorites = window.ArvelStore.readStoredArray(window.ArvelStore.storageKeys.favorites);
    const index = favorites.findIndex((id) => String(id) === productKey(product));
    if (index >= 0) favorites.splice(index, 1);
    else favorites.push(productKey(product));
    localStorage.setItem(window.ArvelStore.storageKeys.favorites, JSON.stringify(favorites));
    updateFavoriteButton();
    window.ArvelStore.updateGlobalCounters();
  }

  function renderMeasurements() {
    const labels = { bust: "Busto", waist: "Cintura", hip: "Cadera", length: "Largo" };
    elements.measurements.innerHTML = Object.entries(product.measurements)
      .map(([key, value]) => `<div><dt>${labels[key]}</dt><dd>${value}</dd></div>`)
      .join("");
  }

  function storeRecentlyViewed() {
    const recent = window.ArvelStore.readStoredArray(RECENT_KEY).filter((id) => String(id) !== productKey(product));
    recent.unshift(productKey(product));
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 6)));
  }

  function renderSuggestions() {
    const related = products
      .filter(
        (item) =>
          productKey(item) !== productKey(product) &&
          !item.archived &&
          !item.soldOut &&
          (item.category === product.category || item.collection === product.collection)
      )
      .slice(0, 4);

    if (related.length) {
      elements.related.innerHTML = related.map(window.Arvel.createProductCard).join("");
      elements.relatedSection.hidden = false;
    }

    const recentIds = window.ArvelStore.readStoredArray(RECENT_KEY).filter((id) => String(id) !== productKey(product));
    const recentProducts = recentIds
      .map((id) => products.find((item) => productKey(item) === String(id)))
      .filter(Boolean)
      .slice(0, 4);

    if (recentProducts.length) {
      elements.recent.innerHTML = recentProducts.map(window.Arvel.createProductCard).join("");
      elements.recentSection.hidden = false;
    }

    document
      .querySelectorAll(".product-suggestions [data-reveal]")
      .forEach((card) => card.classList.add("is-visible"));
  }

  function addStructuredData() {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description: product.description,
      image: product.images.map((image) => new URL(image, window.location.href).href),
      sku: product.sku,
      brand: { "@type": "Brand", name: "Arvel Customs" },
      offers: {
        "@type": "Offer",
        priceCurrency: "ARS",
        price: product.price,
        availability: product.soldOut
          ? "https://schema.org/OutOfStock"
          : "https://schema.org/InStock",
        itemCondition:
          product.condition === "Nueva"
            ? "https://schema.org/NewCondition"
            : "https://schema.org/UsedCondition"
      }
    });
    document.head.append(script);
  }

  function bindEvents() {
    window.addEventListener("arvel:mercadopago-ready", (event) => {
      const financing = elements.price.querySelector("[data-mercadopago-financing]");
      if (financing) financing.hidden = event.detail?.ready !== true;
    });
    elements.form.addEventListener("submit", (event) => {
      event.preventDefault();
      addToCart(false);
    });
    elements.buyButton.addEventListener("click", () => addToCart(true));
    elements.form.addEventListener("change", updateStockStatus);
    document.querySelector(".quantity-control").addEventListener("click", (event) => {
      const button = event.target.closest("[data-quantity-action]");
      if (!button) return;
      const current = Number(elements.quantity.value) || 1;
      const max = Number(elements.quantity.max) || product.stock;
      elements.quantity.value = String(
        button.dataset.quantityAction === "increase"
          ? Math.min(max, current + 1)
          : Math.max(1, current - 1)
      );
    });
    elements.quantity.addEventListener("change", updateStockStatus);
    elements.favoriteButton.addEventListener("click", toggleFavorite);
    elements.zoomTrigger.addEventListener("click", () => {
      if (suppressZoom) {
        suppressZoom = false;
        return;
      }
      imageIsZoomed = false;
      elements.zoomImage.classList.remove("is-zoomed");
      elements.zoomImage.setAttribute("aria-pressed", "false");
      elements.zoomDialog.showModal();
    });
    elements.zoomImage.addEventListener("click", () => {
      imageIsZoomed = !imageIsZoomed;
      elements.zoomImage.classList.toggle("is-zoomed", imageIsZoomed);
      elements.zoomImage.setAttribute("aria-pressed", String(imageIsZoomed));
      if (!imageIsZoomed) {
        elements.zoomDialog.scrollTo({ top: 0, left: 0, behavior: "smooth" });
      }
    });
    elements.zoomImage.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      elements.zoomImage.click();
    });
    elements.zoomClose.addEventListener("click", () => elements.zoomDialog.close());
    elements.zoomDialog.addEventListener("click", (event) => {
      if (event.target === elements.zoomDialog) elements.zoomDialog.close();
    });
    elements.zoomDialog.addEventListener("close", () => {
      imageIsZoomed = false;
      elements.zoomImage.classList.remove("is-zoomed");
      elements.zoomImage.setAttribute("aria-pressed", "false");
    });

    elements.shippingForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const estimate = window.ArvelShipping.estimate(elements.shippingPostalCode.value, 1);
      if (!estimate) {
        elements.shippingPostalCode.setAttribute("aria-invalid", "true");
        elements.shippingResult.className = "shipping-estimator__result is-error";
        elements.shippingResult.textContent = "Ingresá un CP de 4 números o un CPA completo.";
        elements.shippingPostalCode.focus();
        return;
      }

      elements.shippingPostalCode.removeAttribute("aria-invalid");
      elements.shippingPostalCode.value = estimate.postalCode;
      elements.shippingResult.className = "shipping-estimator__result is-success";
      elements.shippingResult.innerHTML = `
        <strong>Sucursal: ${window.Arvel.formatPrice(estimate.branchCost)}</strong>
        <span>Domicilio: ${window.Arvel.formatPrice(estimate.homeCost)}</span>
        <span>${estimate.zone} · ${estimate.minDays} a ${estimate.maxDays} días hábiles</span>
        <small>Estimación orientativa; Arvel confirma el importe final manualmente.</small>
      `;
    });
  }

  function renderProduct() {
    document.title = `${product.name} | Arvel Custom Y2K`;
    document.querySelector('meta[name="description"]').content = product.shortDescription;
    document.querySelector('meta[property="og:title"]').content = `${product.name} | Arvel Custom Y2K`;
    document.querySelector('meta[property="og:description"]').content = product.shortDescription;
    elements.breadcrumb.textContent = product.name;
    elements.collection.textContent = `${product.collection} · ${product.sku}`;
    elements.name.textContent = product.name;
    elements.shortDescription.textContent = product.shortDescription;
    elements.description.textContent = product.description;
    elements.condition.textContent = product.condition;
    elements.material.textContent = product.material;
    elements.care.textContent = product.care;
    elements.uniqueNotice.hidden = !product.uniquePiece;
    elements.whatsapp.href = window.Arvel.createWhatsAppUrl(
      `Hola Arvel, quiero consultar por ${product.name} (${product.sku}).`
    );

    createBadges();
    renderPrice();
    renderGallery();
    createVariantOptions(product.sizes, "size", elements.sizes);
    createVariantOptions(product.colors, "color", elements.colors);
    renderMeasurements();
    updateFavoriteButton();
    updateStockStatus();
    renderSuggestions();
    storeRecentlyViewed();
    addStructuredData();
    bindEvents();

    elements.loading.hidden = true;
    elements.detail.hidden = false;
  }

  if (!product) showNotFound();
  else renderProduct();
})();
