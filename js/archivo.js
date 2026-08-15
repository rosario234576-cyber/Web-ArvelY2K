(function () {
  "use strict";

  const products = Array.isArray(window.ARVEL_PRODUCTS)
    ? window.ARVEL_PRODUCTS.filter((product) => product.archived || product.soldOut)
    : [];
  const grid = document.querySelector("#archive-products");
  const empty = document.querySelector("#archive-empty");
  const count = document.querySelector("#archive-count");

  function createArchiveCard(product, index) {
    const image = product.images[0] || "assets/images/moodboard/arvel-editorial-hero.png";
    const customUrl = window.Arvel.createWhatsAppUrl(
      `Hola Arvel, me inspira la pieza “${product.name}” del archivo (${product.sku}). Quiero consultar por una custom con identidad propia, sin copiarla exactamente.`
    );

    return `
      <article class="archive-card ${index % 3 === 1 ? "archive-card--offset" : ""}">
        <a class="archive-card__media" href="producto.html?id=${product.id}">
          <img
            src="${image}"
            alt="Archivo de ${product.name}: ${product.shortDescription}"
            width="1080"
            height="1440"
            loading="lazy"
          >
          <span class="badge badge--dark">Vendida</span>
          <span class="archive-card__index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
        </a>
        <div class="archive-card__body">
          <p class="eyebrow">${product.collection}</p>
          <h3><a href="producto.html?id=${product.id}">${product.name}</a></h3>
          <p>${product.condition} · ${product.sizes.join("/")}</p>
          <a class="text-link" href="${customUrl}" target="_blank" rel="noopener noreferrer">
            Consultar por una custom inspirada ↗
          </a>
        </div>
      </article>
    `;
  }

  count.textContent = String(products.length);
  grid.innerHTML = products.map(createArchiveCard).join("");
  grid.hidden = products.length === 0;
  empty.hidden = products.length !== 0;
})();
