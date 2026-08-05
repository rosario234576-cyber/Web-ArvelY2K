export async function initMetrics() {
  "use strict";

  const [{ initializeApp, getApps }, { getFirestore, collection, query, getDocs, where, orderBy, limit }, configModule] =
    await Promise.all([
      import("https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js"),
      import("./firebase-config.js?v=20260731-5")
    ]);

  if (!configModule.firebaseConfigured) {
    document.getElementById("total-events").textContent = "Sin datos";
    return;
  }

  const app = getApps().find((candidate) => candidate.name === "[DEFAULT]")
    || initializeApp(configModule.firebaseConfig);
  const db = getFirestore(app);

  async function loadMetrics() {
    try {
      // Cargar eventos de analytics
      const eventsRef = collection(db, "analytics_events");
      const eventsSnap = await getDocs(eventsRef);
      const events = eventsSnap.docs.map(doc => doc.data());

      // Calcular estadísticas
      const deviceTypes = {};
      const browsers = {};
      const operatingSystems = {};
      const timelineData = {};

      events.forEach(event => {
        const device = event.device_type || "unknown";
        const browser = event.browser || "unknown";
        const os = event.operating_system || "unknown";

        deviceTypes[device] = (deviceTypes[device] || 0) + 1;
        browsers[browser] = (browsers[browser] || 0) + 1;
        operatingSystems[os] = (operatingSystems[os] || 0) + 1;

        // Timeline por día
        if (event.timestamp) {
          const date = new Date(event.timestamp.toDate());
          const day = date.toISOString().split("T")[0];
          timelineData[day] = (timelineData[day] || 0) + 1;
        }
      });

      // Renderizar gráficos
      renderDeviceChart(deviceTypes);
      renderBrowserChart(browsers);
      renderOSChart(operatingSystems);
      renderTimelineChart(timelineData);

      document.getElementById("total-events").textContent = events.length;
    } catch (error) {
      console.error("Error cargando métricas:", error);
      document.getElementById("total-events").textContent = "Error";
    }
  }

  function renderDeviceChart(data) {
    const ctx = document.getElementById("chart-devices").getContext("2d");
    const colors = ["#f15bb5", "#00b4d8", "#ffd60a"];
    const labels = Object.keys(data).sort((a, b) => data[b] - data[a]);
    const values = labels.map(label => data[label]);

    new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
        datasets: [{
          data: values,
          backgroundColor: colors.slice(0, labels.length),
          borderColor: "#fff",
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "bottom" } }
      }
    });

    const statsHtml = labels
      .map((label, i) => `<div><strong>${label}:</strong> ${values[i]} (${((values[i]/values.reduce((a,b)=>a+b,0))*100).toFixed(1)}%)</div>`)
      .join("");
    document.getElementById("devices-stats").innerHTML = statsHtml;
  }

  function renderBrowserChart(data) {
    const ctx = document.getElementById("chart-browsers").getContext("2d");
    const colors = ["#00b4d8", "#f15bb5", "#ffd60a", "#90e0ef"];
    const labels = Object.keys(data).sort((a, b) => data[b] - data[a]);
    const values = labels.map(label => data[label]);

    new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
        datasets: [{
          label: "Usuarios",
          data: values,
          backgroundColor: colors.slice(0, labels.length)
        }]
      },
      options: {
        responsive: true,
        indexAxis: "y",
        plugins: { legend: { display: false } }
      }
    });

    const statsHtml = labels
      .map((label, i) => `<div><strong>${label}:</strong> ${values[i]}</div>`)
      .join("");
    document.getElementById("browsers-stats").innerHTML = statsHtml;
  }

  function renderOSChart(data) {
    const ctx = document.getElementById("chart-os").getContext("2d");
    const colors = ["#ffd60a", "#00b4d8", "#f15bb5", "#90e0ef"];
    const labels = Object.keys(data).sort((a, b) => data[b] - data[a]);
    const values = labels.map(label => data[label]);

    new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
        datasets: [{
          data: values,
          backgroundColor: colors.slice(0, labels.length),
          borderColor: "#fff",
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "bottom" } }
      }
    });

    const statsHtml = labels
      .map((label, i) => `<div><strong>${label}:</strong> ${values[i]}</div>`)
      .join("");
    document.getElementById("os-stats").innerHTML = statsHtml;
  }

  function renderTimelineChart(data) {
    const ctx = document.getElementById("chart-timeline").getContext("2d");
    const sortedDays = Object.keys(data).sort();
    const values = sortedDays.map(day => data[day]);

    new Chart(ctx, {
      type: "line",
      data: {
        labels: sortedDays,
        datasets: [{
          label: "Visitantes",
          data: values,
          borderColor: "#f15bb5",
          backgroundColor: "rgba(241, 91, 181, 0.1)",
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: true } },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: "Visitantes" } }
        }
      }
    });

    const total = values.reduce((a, b) => a + b, 0);
    const statsHtml = `<div><strong>Total últimos 7 días:</strong> ${total}</div>`;
    document.getElementById("timeline-stats").innerHTML = statsHtml;
  }

  // Cargar métricas al abrir la pestaña
  document.getElementById("metrics-refresh").addEventListener("click", loadMetrics);

  // Cargar al iniciar
  await loadMetrics();
}
