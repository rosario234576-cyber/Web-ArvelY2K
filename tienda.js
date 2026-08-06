(async function () {
  "use strict";

  const catalog = window.ARVEL_PRODUCTS_READY
    ? await window.ARVEL_PRODUCTS_READY
    : window.ARVEL_PRODUCTS;
  const products = Array.isArray(catalog)
    ? catalog.filter((product) => !product.archived && (!product.status || product.status === "published"))
    : [];
  const favoritesOnly = new URLSearchParams(window.location.search).get("favoritos") === "1";

  const elements = {
    searchForm: document.querySelector("#shop-search-form"),
    search: document.querySelector("#shop-search"),
    filtersForm: document.querySelector("#filters-form"),
    categoryHeader: document.querySelector("#header-category-select"),
    price: document.querySelector("#filter-price"),
    priceOutput: document.querySelector("#filter-price-output"),
    available: document.querySelector("#filter-available"),
    sale: document.querySelector("#filter-sale"),
    sort: document.querySelector("#sort-products"),
    clear: document.querySelector("#clear-filters"),
    grid: document.querySelector("#shop-products"),
    empty: document.querySelector("#shop-empty"),
    count: document.querySelector("#results-count"),
    activeFilters: document.querySelector("#active-filters"),
    panel: document.querySelector("#filters-panel"),
    panelToggle: document.querySelector("#filter-toggle"),
    panelClose: document.querySelector(".filters-panel__close"),
    backdrop: document.querySelector(".filters-backdrop")
  };

  function uniqueValues(key) {
    return [...new Set(products.flatMap((product) => product[key]))]
      .filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b), "es"));
  }

  function fillSelect(select, values) {
    if (!select) return;
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.append(option);
    });
  }

  function populateFilters() {
    const categories = uniqueValues("category").filter((cat) => cat && cat.toLowerCase() !== "sin categorizar");
    fillSelect(elements.categoryHeader, categories);
  }

  function getState() {
    return {
      query: elements.search.value.trim(),
      category: elements.categoryHeader ? elements.categoryHeader.value : "",
      maxPrice: Number(elements.price.value),
      available: elements.available.checked,
      sale: elements.sale.checked,
      sort: elements.sort.value
    };
  }

  function normalize(value) {
    return String(value)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  }

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        })[character]
    );
  }

  function filterProducts(state) {
    const query = normalize(state.query);
    const favoriteIds = favoritesOnly
      ? window.ArvelStore
          .readStoredArray(window.ArvelStore.storageKeys.favorites)
          .map(String)
      : [];

    return products.filter((product) => {
      const searchable = normalize(
        [product.name, product.category, product.collection, product.tags.join(" ")].join(" ")
      );

      return (
        (!query || searchable.includes(query)) &&
        (!state.category || product.category === state.category) &&
        product.price <= state.maxPrice &&
        (!state.available || (!product.soldOut && product.stock > 0)) &&
        (!state.sale || product.discount > 0) &&
        (!favoritesOnly || favoriteIds.includes(String(product.documentId || product.id)))
      );
    });
  }

  function sortProducts(filtered, sort) {
    const sorted = [...filtered];

    switch (sort) {
      case "featured":
        return sorted.sort(
          (a, b) => Number(b.featured) - Number(a.featured) ||
            new Date(b.createdAt) - new Date(a.createdAt)
        );
      case "price-asc":
        return sorted.sort((a, b) => a.price - b.price);
      case "price-desc":
        return sorted.sort((a, b) => b.price - a.price);
      default:
        return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
  }

  function syncUrl(state) {
    const params = new URLSearchParams();
    if (state.query) params.set("buscar", state.query);
    if (state.category) params.set("categoria", state.category);
    if (state.maxPrice < Number(elements.price.max)) params.set("precio", state.maxPrice);
    if (state.available) params.set("disponibles", "1");
    if (state.sale) params.set("ofertas", "1");
    if (state.sort !== "recent") params.set("orden", state.sort);
    if (favoritesOnly) params.set("favoritos", "1");

    const url = `${window.location.pathname}${params.size ? `?${params}` : ""}`;
    window.history.replaceState({}, "", url);
  }

  function updatePriceOutput() {
    elements.priceOutput.textContent = window.Arvel.formatPrice(Number(elements.price.value));
  }

  function renderActiveFilters(state) {
    const filters = [
      state.query && { key: "query", label: `"${state.query}"` },
      state.category && { key: "category", label: state.category },
      state.maxPrice < Number(elements.price.max) && {
        key: "maxPrice",
        label: `Hasta ${window.Arvel.formatPrice(state.maxPrice)}`
      },
      state.available && { key: "available", label: "Disponibles" },
      state.sale && { key: "sale", label: "Oferta" },
      favoritesOnly && { key: "favorites", label: "Mis favoritos" }
    ].filter(Boolean);

    elements.activeFilters.innerHTML = filters
      .map(
        ({ key, label }) => `
          <button
            class="active-filter"
            type="button"
            data-remove-filter="${key}"
            aria-label="Quitar filtro ${escapeHtml(label)}"
          >
            <span>${escapeHtml(label)}</span>
            <span aria-hidden="true">×</span>
          </button>
        `
      )
      .join("");
  }

  function removeFilter(key) {
    const controls = {
      query: elements.search,
      category: elements.categoryHeader
    };

    if (controls[key]) controls[key].value = "";
    if (key === "maxPrice") elements.price.value = elements.price.max;
    if (key === "available") elements.available.checked = false;
    if (key === "sale") elements.sale.checked = false;

    if (key === "favorites") {
      window.location.href = "tienda.html";
      return;
    }

    render();
  }

  function render() {
    const state = getState();
    const visibleProducts = sortProducts(filterProducts(state), state.sort);

    elements.grid.setAttribute("aria-busy", "true");
    elements.grid.innerHTML = visibleProducts.map(window.Arvel.createProductCard).join("");
    elements.grid
      .querySelectorAll("[data-reveal]")
      .forEach((card) => card.classList.add("is-visible"));
    elements.grid.hidden = visibleProducts.length === 0;
    elements.empty.hidden = visibleProducts.length !== 0;
    elements.count.textContent = String(visibleProducts.length);
    elements.grid.setAttribute("aria-busy", "false");

    renderActiveFilters(state);
    updatePriceOutput();
    syncUrl(state);
  }

  function setValueFromParams(element, params, key) {
    const value = params.get(key);
    if (value !== null) element.value = value;
  }

  function restoreFromUrl() {
    const params = new URLSearchParams(window.location.search);
    setValueFromParams(elements.search, params, "buscar");
    if (elements.categoryHeader) setValueFromParams(elements.categoryHeader, params, "categoria");
    setValueFromParams(elements.price, params, "precio");
    setValueFromParams(elements.sort, params, "orden");
    elements.available.checked = params.get("disponibles") === "1";
    elements.sale.checked = params.get("ofertas") === "1";
  }

  function clearFilters() {
    elements.filtersForm.reset();
    elements.searchForm.reset();
    elements.sort.value = "recent";
    elements.price.value = elements.price.max;
    if (elements.categoryHeader) elements.categoryHeader.value = "";
    render();
  }

  function openFilters() {
    elements.panel.classList.add("is-open");
    elements.backdrop.classList.add("is-visible");
    elements.panelToggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("is-locked");
    elements.panelClose.focus();
  }

  function closeFilters() {
    elements.panel.classList.remove("is-open");
    elements.backdrop.classList.remove("is-visible");
    elements.panelToggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("is-locked");
    elements.panelToggle.focus();
  }

  function bindEvents() {
    elements.searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      render();
    });
    elements.search.addEventListener("input", render);
    if (elements.categoryHeader) elements.categoryHeader.addEventListener("change", render);
    elements.filtersForm.addEventListener("change", render);
    elements.filtersForm.addEventListener("submit", (event) => {
      event.preventDefault();
      render();
      if (window.matchMedia("(max-width: 63.99rem)").matches) closeFilters();
    });
    elements.price.addEventListener("input", render);
    elements.sort.addEventListener("change", render);
    elements.clear.addEventListener("click", clearFilters);
    document.querySelector("[data-clear-filters]")?.addEventListener("click", clearFilters);
    elements.activeFilters.addEventListener("click", (event) => {
      const filter = event.target.closest("[data-remove-filter]");
      if (filter) removeFilter(filter.dataset.removeFilter);
    });
    elements.panelToggle.addEventListener("click", openFilters);
    elements.panelClose.addEventListener("click", closeFilters);
    elements.backdrop.addEventListener("click", closeFilters);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && elements.panel.classList.contains("is-open")) closeFilters();
    });
  }

  populateFilters();
  restoreFromUrl();
  bindEvents();
  render();

  document.addEventListener("arvel:products-updated", () => {
    populateFilters();
    render();
  });
  document.addEventListener("arvel:favorites-changed", render);
})();
