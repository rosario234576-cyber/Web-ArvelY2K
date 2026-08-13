let initialized = false;

const API_BASE = String(window.ARVEL_API_BASE || "https://web-arvel-y2-k.vercel.app").replace(/\/+$/, "");

function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;"
  }[char]));
}

function number(value) {
  return new Intl.NumberFormat("es-AR").format(Number(value) || 0);
}

function renderRows(id, values, emptyText) {
  const container = document.getElementById(id);
  if (!container) return;
  const rows = Array.isArray(values) ? values : [];
  const total = rows.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
  if (!rows.length) {
    container.innerHTML = `<p class="metrics-empty">${escapeHtml(emptyText || "Todavía no hay datos.")}</p>`;
    return;
  }
  container.innerHTML = rows.slice(0, 6).map((row) => {
    const percent = total ? Math.max(4, Math.round((Number(row.value) / total) * 100)) : 0;
    return `<div class="metrics-row"><span>${escapeHtml(row.label)}</span><strong>${number(row.value)}</strong><i><b style="width:${percent}%"></b></i></div>`;
  }).join("");
}

function renderTimeline(values) {
  const container = document.getElementById("timeline-stats");
  if (!container) return;
  const rows = Array.isArray(values) ? values : [];
  const max = Math.max(1, ...rows.map((row) => Number(row.value) || 0));
  container.innerHTML = rows.map((row) => {
    const height = Math.max(7, Math.round(((Number(row.value) || 0) / max) * 100));
    return `<div class="metrics-timeline__bar" title="${escapeHtml(row.label)}: ${number(row.value)} visitantes"><i style="height:${height}%"></i><span>${escapeHtml(row.shortLabel || row.label)}</span><strong>${number(row.value)}</strong></div>`;
  }).join("") || '<p class="metrics-empty">Los primeros visitantes aparecerán acá.</p>';
}

function setSummary(summary, total) {
  const values = {
    "metric-unique-visitors": summary.uniqueVisitors,
    "metric-sessions": summary.sessions,
    "metric-exits": summary.sessionEnds,
    "metric-page-views": summary.pageViews,
    "metric-product-views": summary.productViews,
    "metric-product-clicks": summary.productClicks,
    "metric-add-to-cart": summary.addToCart,
    "metric-checkout-starts": summary.checkoutStarts,
    "total-events": total
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = number(value);
  });
}

export async function initMetrics() {
  const refresh = document.getElementById("metrics-refresh");
  const state = document.getElementById("metrics-state");
  if (!refresh) return;

  async function loadMetrics() {
    refresh.disabled = true;
    refresh.textContent = "Actualizando…";
    if (state) state.textContent = "Consultando las métricas seguras…";
    try {
      const [{ initializeApp, getApps }, { getAuth, onAuthStateChanged }, configModule] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js"),
        import("./firebase-config.js?v=20260731-5")
      ]);
      if (!configModule.firebaseConfigured) throw new Error("Firebase no está configurado.");
      const app = getApps().find((candidate) => candidate.name === "[DEFAULT]") || initializeApp(configModule.firebaseConfig);
      const auth = getAuth(app);
      // Firebase restaura la sesión de forma asíncrona. Esperamos ese primer
      // estado para que el panel no quede vacío si se abre recién después de iniciar sesión.
      const user = auth.currentUser || await new Promise((resolve) => {
        const stop = onAuthStateChanged(auth, (currentUser) => {
          stop();
          resolve(currentUser);
        });
      });
      if (!user) throw new Error("Tu sesión venció. Volvé a ingresar al administrador.");

      const { db } = configModule;
      const { collection, getDocs, query, where, orderBy, limit } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

      const events = await getDocs(collection(db, "analytics_events"));
      const last7Days = new Date();
      last7Days.setDate(last7Days.getDate() - 7);

      let pageViews = 0, uniqueVisitors = new Set(), productClicks = 0, sessions = new Set();
      const pageStats = {}, devices = {}, browsers = {};

      events.docs.forEach(doc => {
        const data = doc.data();
        const timestamp = data.timestamp?.toDate?.();
        if (!timestamp || timestamp < last7Days) return;

        if (data.event === 'page_view') {
          pageViews++;
          uniqueVisitors.add(data.sessionId);
          sessions.add(data.sessionId);
          const page = data.url || '/';
          pageStats[page] = (pageStats[page] || 0) + 1;

          const ua = data.userAgent || '';
          if (ua.includes('Chrome')) browsers['Chrome'] = (browsers['Chrome'] || 0) + 1;
          else if (ua.includes('Firefox')) browsers['Firefox'] = (browsers['Firefox'] || 0) + 1;
          else if (ua.includes('Safari')) browsers['Safari'] = (browsers['Safari'] || 0) + 1;

          if (ua.includes('Mobile')) devices['Mobile'] = (devices['Mobile'] || 0) + 1;
          else devices['Desktop'] = (devices['Desktop'] || 0) + 1;
        }
        if (data.event === 'product_click') productClicks++;
      });

      const pageRows = Object.entries(pageStats).map(([label, value]) => ({ label, value }));

      setSummary({ uniqueVisitors: uniqueVisitors.size, sessions: sessions.size, pageViews, productClicks }, events.size);
      renderRows("devices-stats", Object.entries(devices).map(([label, value]) => ({ label, value })));
      renderRows("browsers-stats", Object.entries(browsers).map(([label, value]) => ({ label, value })));
      renderRows("pages-stats", pageRows);
      if (state) state.textContent = `Actualizado ${new Date().toLocaleString("es-AR")}. Se registraron ${events.size} eventos.`;
    } catch (error) {
      console.error("Error cargando métricas:", error);
      if (state) state.textContent = "Las métricas se completarán al conectar Google Analytics o un servicio de tracking.";
    } finally {
      refresh.disabled = false;
      refresh.textContent = "↻ Actualizar";
    }
  }

  if (!initialized) {
    refresh.addEventListener("click", loadMetrics);
    initialized = true;
  }
  await loadMetrics();
}
