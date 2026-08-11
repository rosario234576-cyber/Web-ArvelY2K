(async function () {
  "use strict";

  try {
    const [{ initializeApp, getApps }, { getAnalytics, logEvent }, configModule] =
      await Promise.all([
        import("https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/12.16.0/firebase-analytics.js"),
        import("./firebase-config.js?v=20260731-5")
      ]);

    if (!configModule.firebaseConfigured) return;

    const app = getApps().find((candidate) => candidate.name === "[DEFAULT]")
      || initializeApp(configModule.firebaseConfig);
    const analytics = getAnalytics(app);

    // Detectar dispositivo
    const ua = navigator.userAgent;
    let deviceType = "desktop";
    if (/mobile|android|iphone|ipad|phone/i.test(ua)) {
      deviceType = /ipad/i.test(ua) ? "tablet" : "mobile";
    }

    // Detectar navegador
    let browser = "other";
    if (/chrome/i.test(ua) && !/edge/i.test(ua)) browser = "chrome";
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = "safari";
    else if (/firefox/i.test(ua)) browser = "firefox";
    else if (/edge/i.test(ua)) browser = "edge";

    // Detectar SO
    let os = "other";
    if (/windows/i.test(ua)) os = "windows";
    else if (/mac/i.test(ua)) os = "macos";
    else if (/android/i.test(ua)) os = "android";
    else if (/iphone|ipad/i.test(ua)) os = "ios";
    else if (/linux/i.test(ua)) os = "linux";

    // Log de página view con detalles
    logEvent(analytics, "page_view", {
      page_title: document.title,
      page_path: window.location.pathname,
      device_type: deviceType,
      browser: browser,
      operating_system: os,
      timestamp: new Date().toISOString()
    });

    // Guardar en Firestore para dashboard
    const { getFirestore, collection, addDoc, serverTimestamp } =
      await import("https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js");

    const db = getFirestore(app);
    await addDoc(collection(db, "analytics_events"), {
      event_type: "page_view",
      page_title: document.title,
      page_path: window.location.pathname,
      device_type: deviceType,
      browser: browser,
      operating_system: os,
      user_agent: ua.substring(0, 200),
      timestamp: serverTimestamp()
    }).catch(() => {
      // Silenciar errores de permisos si no está configurado
    });
  } catch (error) {
    // No hay Firebase configurado, ignorar
  }
})();
