(function () {
  "use strict";

  const rates = Object.freeze({
    cercana: { zone: "CABA y Buenos Aires", branchCost: 5500, homeCost: 7800, minDays: 2, maxDays: 5 },
    media: { zone: "Centro y Cuyo", branchCost: 6500, homeCost: 9800, minDays: 2, maxDays: 5 },
    lejana: { zone: "Norte y Patagonia", branchCost: 7200, homeCost: 9900, minDays: 2, maxDays: 5 }
  });

  const zoneByProvinceLetter = Object.freeze({
    C: rates.cercana, B: rates.cercana,
    X: rates.media, S: rates.media, E: rates.media, L: rates.media,
    M: rates.media, D: rates.media, J: rates.media,
    A: rates.lejana, F: rates.lejana, G: rates.lejana, H: rates.lejana,
    K: rates.lejana, N: rates.lejana, P: rates.lejana, T: rates.lejana,
    W: rates.lejana, Y: rates.lejana, Q: rates.lejana, R: rates.lejana,
    U: rates.lejana, Z: rates.lejana, V: rates.lejana
  });

  function normalizePostalCode(value) {
    return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
  }

  function getNumericZone(number) {
    if (number >= 1000 && number <= 1999) return rates.cercana;
    if (number >= 2000 && number <= 3999) return rates.media;
    if (number >= 4000 && number <= 5999) return rates.lejana;
    if (number >= 6000 && number <= 7999) return rates.media;
    if (number >= 8000 && number <= 9999) return rates.lejana;
    return null;
  }

  function estimate(postalCode, itemCount = 1) {
    const code = normalizePostalCode(postalCode);
    const valid = /^[A-Z]\d{4}[A-Z]{3}$/.test(code) || /^\d{4}$/.test(code);
    if (!valid) return null;

    const baseZone = /^[A-Z]/.test(code)
      ? zoneByProvinceLetter[code[0]]
      : getNumericZone(Number(code));
    if (!baseZone) return null;

    return {
      postalCode: code,
      zone: baseZone.zone,
      branchCost: baseZone.branchCost,
      homeCost: baseZone.homeCost,
      cost: baseZone.branchCost,
      minDays: baseZone.minDays,
      maxDays: baseZone.maxDays,
      isEstimate: true
    };
  }

  window.ArvelShipping = Object.freeze({ estimate, normalizePostalCode });
})();
