(function () {
  "use strict";

  const key = window.ArvelStore?.storageKeys.favorites || "arvel-favorites";
  let products = Array.isArray(window.ARVEL_PRODUCTS) ? window.ARVEL_PRODUCTS : [];

  function getFavorites() {
    return window.ArvelStore.readStoredArray(key).map(String);
  }

  function saveFavorites(favorites) {
    localStorage.setItem(key, JSON.stringify([...new Set(favorites)]));
    window.ArvelStore.updateGlobalCounters();
    syncButtons();
  }

  function getProductName(id) {
    return products.find(
      (product) => String(product.documentId || product.id) === String(id)
    )?.name || "esta pieza";
  }

  function syncButtons() {
    const favorites = getFavorites();
    document.querySelectorAll("[data-favorite-id]").forEach((button) => {
      const id = String(button.dataset.favoriteId);
      const active = favorites.includes(id);
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute(
        "aria-label",
        `${active ? "Quitar" : "Agregar"} ${getProductName(id)} ${active ? "de" : "a"} favoritos`
      );
      button.classList.toggle("is-favorite", active);
    });
  }

  function showStatus(message) {
    const region = document.querySelector("#toast-region");
    if (!region) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    region.append(toast);
    window.setTimeout(() => toast.remove(), 3000);
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-favorite-id]");
    if (!button) return;

    const id = String(button.dataset.favoriteId);
    const favorites = getFavorites();
    const index = favorites.indexOf(id);
    const removing = index >= 0;

    if (removing) favorites.splice(index, 1);
    else favorites.push(id);

    saveFavorites(favorites);
    showStatus(
      removing
        ? `${getProductName(id)} se quitó de favoritos.`
        : `${getProductName(id)} se guardó en favoritos.`
    );

    document.dispatchEvent(
      new CustomEvent("arvel:favorites-changed", { detail: { favorites } })
    );
  });

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.addedNodes.length)) syncButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  (window.ARVEL_PRODUCTS_READY || Promise.resolve(products)).then((catalog) => {
    products = Array.isArray(catalog) ? catalog : products;
    syncButtons();
  });
})();
