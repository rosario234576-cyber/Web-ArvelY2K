(function () {
  "use strict";

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function initCountdown(element) {
    const targetDate = new Date(element.dataset.countdown);
    const fields = {
      days: element.querySelector("[data-days]"),
      hours: element.querySelector("[data-hours]"),
      minutes: element.querySelector("[data-minutes]"),
      seconds: element.querySelector("[data-seconds]")
    };
    const status = element.querySelector("[data-countdown-status]");

    if (Number.isNaN(targetDate.getTime())) {
      if (status) status.textContent = "Todavía no hay un drop programado.";
      return;
    }

    function update() {
      const distance = targetDate.getTime() - Date.now();

      if (distance <= 0) {
        Object.values(fields).forEach((field) => {
          if (field) field.textContent = "00";
        });
        if (status) status.textContent = "El drop ya está disponible.";
        return false;
      }

      const days = Math.floor(distance / 86400000);
      const hours = Math.floor((distance % 86400000) / 3600000);
      const minutes = Math.floor((distance % 3600000) / 60000);
      const seconds = Math.floor((distance % 60000) / 1000);

      if (fields.days) fields.days.textContent = pad(days);
      if (fields.hours) fields.hours.textContent = pad(hours);
      if (fields.minutes) fields.minutes.textContent = pad(minutes);
      if (fields.seconds) fields.seconds.textContent = pad(seconds);
      return true;
    }

    if (!update()) return;
    const interval = window.setInterval(() => {
      if (!update()) window.clearInterval(interval);
    }, 1000);
  }

  document.querySelectorAll("[data-countdown]").forEach(initCountdown);
})();
