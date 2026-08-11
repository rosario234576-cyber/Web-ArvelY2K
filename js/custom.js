(function () {
  "use strict";

  const form = document.querySelector("#custom-request-form");
  const globalError = document.querySelector("#custom-form-error");
  if (!form || !globalError) return;

  function errorFor(input) {
    return document.querySelector(`#${input.id}-error`);
  }

  function messageFor(input) {
    if (input.validity.valueMissing) return "Este campo es obligatorio.";
    if (input.validity.tooShort) return `Contanos un poco más: mínimo ${input.minLength} caracteres.`;
    return "Revisá este campo.";
  }

  function clearErrors() {
    form.querySelectorAll("[aria-invalid]").forEach((input) => {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    });
    form.querySelectorAll(".field-error").forEach((error) => {
      error.textContent = "";
    });
    globalError.textContent = "";
  }

  function validate() {
    clearErrors();
    const invalid = [];
    form.querySelectorAll("input:not([type='checkbox']), select, textarea").forEach((input) => {
      if (input.checkValidity()) return;
      const error = errorFor(input);
      if (error) {
        error.textContent = messageFor(input);
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", error.id);
      }
      invalid.push(input);
    });

    const consent = document.querySelector("#custom-consent");
    if (!consent.checked) {
      const error = document.querySelector("#custom-consent-error");
      error.textContent = "Necesitamos que aceptes este punto para continuar.";
      consent.setAttribute("aria-invalid", "true");
      consent.setAttribute("aria-describedby", error.id);
      invalid.push(consent);
    }

    if (invalid.length) {
      globalError.textContent = "Revisá los campos marcados antes de preparar la solicitud.";
      invalid[0].focus();
      return false;
    }
    return true;
  }

  function buildMessage() {
    const data = new FormData(form);
    const preferredDate = data.get("date")
      ? new Intl.DateTimeFormat("es-AR").format(new Date(`${data.get("date")}T12:00:00`))
      : "Sin fecha definida";

    return [
      "Hola Arvel ♡ Quiero consultar por una custom:",
      "",
      `Nombre: ${data.get("name").trim()}`,
      `Contacto: ${data.get("contact").trim()}`,
      `Prenda: ${data.get("garment")}`,
      `Talle o medidas: ${data.get("size").trim()}`,
      `Idea: ${data.get("concept").trim()}`,
      `Colores: ${data.get("colors").trim()}`,
      `Presupuesto: ${data.get("budget")}`,
      `Fecha ideal: ${preferredDate}`,
      `Referencias: ${data.get("references").trim()}`,
      "",
      "Entiendo que las referencias se interpretan y no se copian exactamente.",
      "Voy a adjuntar las imágenes en esta conversación."
    ].join("\n");
  }

  function initCustomCarousel() {
    const carousel = document.querySelector("[data-custom-carousel]");
    if (!carousel) return;

    const slides = [...carousel.querySelectorAll(".custom-gallery__slide")];
    const previous = document.querySelector("[data-custom-prev]");
    const next = document.querySelector("[data-custom-next]");
    const current = document.querySelector("[data-custom-current]");
    const total = document.querySelector("[data-custom-total]");
    if (!slides.length || !previous || !next || !current || !total) return;

    total.textContent = String(slides.length);

    function activeIndex() {
      const left = carousel.scrollLeft;
      return slides.reduce((closest, slide, index) => {
        const distance = Math.abs(slide.offsetLeft - carousel.offsetLeft - left);
        const closestDistance = Math.abs(slides[closest].offsetLeft - carousel.offsetLeft - left);
        return distance < closestDistance ? index : closest;
      }, 0);
    }

    function goTo(index) {
      const normalized = (index + slides.length) % slides.length;
      const targetLeft = slides[normalized].offsetLeft - carousel.offsetLeft;
      carousel.scrollTo({ left: targetLeft, behavior: "smooth" });
    }

    previous.addEventListener("click", () => goTo(activeIndex() - 1));
    next.addEventListener("click", () => goTo(activeIndex() + 1));
    carousel.addEventListener("scroll", () => {
      current.textContent = String(activeIndex() + 1);
    }, { passive: true });
    carousel.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(activeIndex() - 1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(activeIndex() + 1);
      }
    });
  }

  initCustomCarousel();

  form.addEventListener("change", (event) => {
    if (!event.target.matches("[aria-invalid]")) return;
    event.target.removeAttribute("aria-invalid");
    const error = errorFor(event.target);
    if (error) error.textContent = "";
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validate()) return;
    window.open(window.Arvel.createWhatsAppUrl(buildMessage()), "_blank", "noopener,noreferrer");
  });
})();
