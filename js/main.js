(function () {
  "use strict";

  const PROMO_MESSAGES = [
    "Envíos a todo el país",
    "Piezas únicas: cuando se van, no vuelven",
    "Acceso anticipado para la comunidad de WhatsApp"
  ];

  const STORAGE_KEYS = Object.freeze({
    cart: "arvel-cart",
    favorites: "arvel-favorites"
  });

  function readStoredArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function updateGlobalCounters() {
    const cart = readStoredArray(STORAGE_KEYS.cart);
    const favorites = readStoredArray(STORAGE_KEYS.favorites);
    const cartQuantity = cart.reduce((total, item) => total + Number(item.quantity || 1), 0);
    const cartCounter = document.querySelector("#cart-count");
    const favoritesCounter = document.querySelector("#favorites-count");

    if (cartCounter) {
      cartCounter.textContent = String(cartQuantity);
      cartCounter.setAttribute("aria-label", `${cartQuantity} productos`);
    }

    if (favoritesCounter) {
      favoritesCounter.textContent = String(favorites.length);
      favoritesCounter.setAttribute("aria-label", `${favorites.length} favoritos`);
    }
  }

  function initPromoBar() {
    const message = document.querySelector("#promo-message");
    if (!message || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let current = 0;
    window.setInterval(() => {
      current = (current + 1) % PROMO_MESSAGES.length;
      message.classList.add("is-changing");
      window.setTimeout(() => {
        message.textContent = PROMO_MESSAGES[current];
        message.classList.remove("is-changing");
      }, 180);
    }, 4500);
  }

  function initMobileNavigation() {
    const menu = document.querySelector("#mobile-navigation");
    const openButton = document.querySelector(".menu-toggle");
    const closeButton = document.querySelector(".mobile-navigation__close");
    const backdrop = document.querySelector(".navigation-backdrop");
    if (!menu || !openButton || !closeButton || !backdrop) return;

    let lastFocusedElement = null;

    function openMenu() {
      lastFocusedElement = document.activeElement;
      menu.classList.add("is-open");
      backdrop.classList.add("is-visible");
      menu.setAttribute("aria-hidden", "false");
      openButton.setAttribute("aria-expanded", "true");
      openButton.setAttribute("aria-label", "Cerrar menú principal");
      document.body.classList.add("is-locked");
      closeButton.focus();
    }

    function closeMenu() {
      menu.classList.remove("is-open");
      backdrop.classList.remove("is-visible");
      menu.setAttribute("aria-hidden", "true");
      openButton.setAttribute("aria-expanded", "false");
      openButton.setAttribute("aria-label", "Abrir menú principal");
      document.body.classList.remove("is-locked");
      if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
    }

    openButton.addEventListener("click", () => {
      if (menu.classList.contains("is-open")) closeMenu();
      else openMenu();
    });
    closeButton.addEventListener("click", closeMenu);
    backdrop.addEventListener("click", closeMenu);
    menu.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menu.classList.contains("is-open")) closeMenu();
    });
  }

  function initSearchDialog() {
    const dialog = document.querySelector("#search-dialog");
    const openButton = document.querySelector(".search-toggle");
    const closeButton = document.querySelector(".search-dialog__close");
    if (!dialog || !openButton || !closeButton) return;

    const openSearch = () => {
      dialog.show();
      openButton.setAttribute("aria-expanded", "true");
      openButton.classList.add("is-active");
      dialog.querySelector("input")?.focus();
    };

    const closeSearch = ({ restoreFocus = true } = {}) => {
      dialog.close();
      openButton.setAttribute("aria-expanded", "false");
      openButton.classList.remove("is-active");
      if (restoreFocus) openButton.focus();
    };

    openButton.addEventListener("click", () => {
      if (dialog.open) closeSearch({ restoreFocus: false });
      else openSearch();
    });
    closeButton.addEventListener("click", () => closeSearch());
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeSearch();
    });
  }

  function initNewsletter() {
    const form = document.querySelector("#newsletter-form");
    const email = document.querySelector("#newsletter-email");
    const status = document.querySelector("#newsletter-status");
    if (!form || !email || !status) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      status.classList.remove("is-error", "is-success");

      if (!email.validity.valid) {
        email.setAttribute("aria-invalid", "true");
        status.textContent = "Ingresá un correo válido, por ejemplo nombre@email.com.";
        status.classList.add("is-error");
        email.focus();
        return;
      }

      email.removeAttribute("aria-invalid");
      status.textContent =
        "¡Listo! Esta es una demostración; tu correo no fue enviado ni almacenado.";
      status.classList.add("is-success");
      form.reset();
    });
  }

  function initBackToTop() {
    const button = document.querySelector(".back-to-top");
    if (!button) return;

    function updateVisibility() {
      button.hidden = window.scrollY < 500;
    }

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    button.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function initRevealAnimations() {
    const sections = document.querySelectorAll("main > section, main > article");
    sections.forEach((section, sectionIndex) => {
      section.setAttribute("data-reveal-section", "");

      if (
        !section.classList.contains("home-hero") &&
        !section.querySelector(":scope > .scroll-sparkle")
      ) {
        const sparkle = document.createElement("span");
        sparkle.className = `scroll-sparkle scroll-sparkle--${
          sectionIndex % 2 ? "right" : "left"
        } scroll-sparkle--variant-${sectionIndex % 3}`;
        sparkle.setAttribute("aria-hidden", "true");
        sparkle.innerHTML =
          '<img src="assets/images/ElementosDeHome/25.png" alt="" width="512" height="512">';
        section.prepend(sparkle);
      }

      const children = section.querySelectorAll(
        ":scope > .container > *, :scope > *:not(.home-background-decor):not(.y2k-decor):not(.scroll-sparkle)"
      );
      children.forEach((child, childIndex) => {
        if (child.closest("[data-no-motion]")) return;
        child.setAttribute("data-reveal", "");
        child.style.setProperty(
          "--reveal-delay",
          `${Math.min(childIndex, 5) * 85}ms`
        );
      });
    });

    const revealGroups = document.querySelectorAll(
      ".content-card, .product-card, .lookbook-card, .moodboard__photo, " +
      ".mood-entry-card, .info-editorial__item, .custom-process__steps li"
    );
    revealGroups.forEach((element, index) => {
      if (element.closest("[data-no-motion]")) return;
      element.setAttribute("data-reveal", "");
      element.style.setProperty("--reveal-delay", `${Math.min(index % 4, 3) * 70}ms`);
    });

    const elements = document.querySelectorAll("[data-reveal], [data-reveal-section]");
    if (!elements.length) return;

    if (
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
    );

    elements.forEach((element) => observer.observe(element));
  }

  function initScrollProgress() {
    const progress = document.createElement("div");
    progress.className = "scroll-progress";
    progress.setAttribute("aria-hidden", "true");
    document.body.append(progress);

    let scheduled = false;
    function update() {
      const maximum = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = maximum > 0 ? Math.min(1, Math.max(0, window.scrollY / maximum)) : 0;
      progress.style.setProperty("--scroll-progress", String(ratio));
      scheduled = false;
    }

    function requestUpdate() {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
  }

  function initPageEntrance() {
    window.requestAnimationFrame(() => {
      document.body.classList.add("page-entered");
    });
  }

  function initAccordions() {
    document.querySelectorAll("[data-accordion]").forEach((accordion) => {
      accordion.addEventListener("click", (event) => {
        const trigger = event.target.closest(".accordion__trigger");
        if (!trigger) return;

        const panel = document.getElementById(trigger.getAttribute("aria-controls"));
        if (!panel) return;
        const isOpen = trigger.getAttribute("aria-expanded") === "true";

        trigger.setAttribute("aria-expanded", String(!isOpen));
        panel.hidden = isOpen;
      });
    });
  }

  function initComparison() {
    document.querySelectorAll("[data-comparison]").forEach((comparison) => {
      const range = comparison.querySelector(".comparison__range");
      const after = comparison.querySelector("[data-comparison-after]");
      const handle = comparison.querySelector("[data-comparison-handle]");
      if (!range || !after || !handle) return;

      function update() {
        const position = `${range.value}%`;
        after.style.clipPath = `inset(0 ${100 - Number(range.value)}% 0 0)`;
        handle.style.left = position;
      }

      range.addEventListener("input", update);
      update();
    });
  }

  function initDropReminder() {
    const button = document.querySelector("#drop-reminder");
    if (!button) return;

    button.addEventListener("click", () => {
      button.textContent = "Recordatorio activado ✓";
      button.disabled = true;
      showToast("Recordatorio visual activado para este dispositivo.");
    });
  }

  function initCommunityCarousel() {
    const carousel = document.querySelector("[data-community-carousel]");
    if (!carousel) return;

    const track = carousel.querySelector(".community-carousel__track");
    const slides = [...carousel.querySelectorAll(".community-carousel__slide")];
    const previous = carousel.querySelector("[data-carousel-prev]");
    const next = carousel.querySelector("[data-carousel-next]");
    const current = carousel.querySelector("[data-carousel-current]");
    if (!track || slides.length < 2 || !previous || !next || !current) return;

    let activeIndex = 0;

    function showSlide(index) {
      activeIndex = (index + slides.length) % slides.length;
      track.style.transform = `translateX(-${activeIndex * 100}%)`;
      current.textContent = String(activeIndex + 1);
    }

    previous.addEventListener("click", () => showSlide(activeIndex - 1));
    next.addEventListener("click", () => showSlide(activeIndex + 1));
    carousel.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") showSlide(activeIndex - 1);
      if (event.key === "ArrowRight") showSlide(activeIndex + 1);
    });
  }

  function initStoryMarquee() {
    const marquee = document.querySelector("[data-story-marquee]");
    const track = marquee?.querySelector("[data-story-track]");
    if (!marquee || !track) return;

    const storyFiles = [
      "Reco1.jpeg", "Reco2.jpeg", "Reco3.jpeg", "Reco4.jpeg", "Reco5.jpeg",
      "Reco6.jpeg", "Reco7.jpeg", "Reco9.jpeg", "Reco10.jpeg", "Reco11.jpeg",
      "Reco12.jpeg", "Reco13.jpeg", "Reco14.jpeg", "Reco15.jpeg", "Reco16.jpeg",
      "Reco17.jpeg", "Reco18.jpeg", "Reco19.jpeg", "Reco20.jpeg"
    ];
    const highlightUrl =
      "https://www.instagram.com/stories/highlights/18113605399635699/";

    function createStory(file, index, duplicate = false) {
      const link = document.createElement("a");
      link.className = "story-phone";
      link.href = highlightUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute(
        "aria-label",
        duplicate ? "" : `Ver historia destacada de clienta ${index + 1}`
      );
      if (duplicate) {
        link.setAttribute("aria-hidden", "true");
        link.tabIndex = -1;
      }

      const progress = Array.from(
        { length: 5 },
        (_, itemIndex) => `<i class="${itemIndex === index % 5 ? "is-active" : ""}"></i>`
      ).join("");
      link.innerHTML = `
        <span class="story-phone__shell">
          <span class="story-phone__speaker" aria-hidden="true"></span>
          <span class="story-phone__screen">
            <span class="story-phone__progress" aria-hidden="true">${progress}</span>
            <img
              src="assets/images/Referencias/${file}"
              alt="${duplicate ? "" : `Historia de una clienta usando una pieza Arvel`}"
              width="736"
              height="1600"
              loading="lazy"
              decoding="async"
            >
          </span>
        </span>
      `;
      return link;
    }

    const original = document.createDocumentFragment();
    const duplicate = document.createDocumentFragment();
    storyFiles.forEach((file, index) => {
      original.append(createStory(file, index));
      duplicate.append(createStory(file, index, true));
    });
    track.append(original, duplicate);
  }

  function initMoodboardCarousel() {
    const carousel = document.querySelector("[data-moodboard-carousel]");
    if (!carousel) return;

    const items = [...carousel.querySelectorAll(".moodboard__item")];
    const previous = document.querySelector("[data-moodboard-prev]");
    const next = document.querySelector("[data-moodboard-next]");
    const current = document.querySelector("[data-moodboard-current]");
    const total = document.querySelector("[data-moodboard-total]");
    if (!items.length || !previous || !next || !current || !total) return;

    total.textContent = String(items.length);

    function getActiveIndex() {
      const left = carousel.scrollLeft;
      return items.reduce((closest, item, index) => {
        const currentDistance = Math.abs(item.offsetLeft - carousel.offsetLeft - left);
        const closestDistance = Math.abs(items[closest].offsetLeft - carousel.offsetLeft - left);
        return currentDistance < closestDistance ? index : closest;
      }, 0);
    }

    function updateCounter() {
      current.textContent = String(getActiveIndex() + 1);
    }

    function goTo(index) {
      const normalized = (index + items.length) % items.length;
      items[normalized].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    }

    previous.addEventListener("click", () => goTo(getActiveIndex() - 1));
    next.addEventListener("click", () => goTo(getActiveIndex() + 1));
    carousel.addEventListener("scroll", updateCounter, { passive: true });
    carousel.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(getActiveIndex() - 1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(getActiveIndex() + 1);
      }
    });
  }

  function showToast(message, action) {
    const region = document.querySelector("#toast-region");
    if (!region) return;

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");

    const text = document.createElement("p");
    text.textContent = message;
    toast.append(text);

    if (action?.href && action?.label) {
      const link = document.createElement("a");
      link.className = "toast__action";
      link.href = action.href;
      link.textContent = action.label;
      toast.append(link);
    }

    region.append(toast);
    window.setTimeout(() => {
      toast.classList.add("is-leaving");
      window.setTimeout(() => toast.remove(), 220);
    }, 4500);
  }

  function renderFeaturedProducts() {
    const container = document.querySelector("#featured-products");
    if (!container || !Array.isArray(window.ARVEL_PRODUCTS)) return;

    const featured = window.ARVEL_PRODUCTS
      .filter((product) => product.featured && !product.soldOut && !product.archived)
      .slice(0, 4);

    if (!featured.length) {
      container.innerHTML = '<p class="empty-state">No hay piezas destacadas disponibles ahora.</p>';
      return;
    }

    container.innerHTML = featured.map(window.Arvel.createProductCard).join("");
  }

  function setCurrentYear() {
    const target = document.querySelector("#current-year");
    if (target) target.textContent = String(new Date().getFullYear());
  }

  function initialize() {
    initPageEntrance();
    initScrollProgress();
    renderFeaturedProducts();
    updateGlobalCounters();
    initPromoBar();
    initMobileNavigation();
    initSearchDialog();
    initNewsletter();
    initBackToTop();
    initRevealAnimations();
    initAccordions();
    initComparison();
    initDropReminder();
    initCommunityCarousel();
    initStoryMarquee();
    initMoodboardCarousel();
    setCurrentYear();
  }

  window.ArvelStore = Object.freeze({
    storageKeys: STORAGE_KEYS,
    readStoredArray,
    updateGlobalCounters,
    showToast
  });

  initialize();
})();
