import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, onAuthStateChanged, sendPasswordResetEmail, updateProfile } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, getFirestore, orderBy, query, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig, firebaseConfigured } from "./firebase-config.js?v=20260731-5";

const loading = document.querySelector("#account-loading");
const guest = document.querySelector("#account-guest");
const content = document.querySelector("#account-content");
const status = document.querySelector("#account-status");
let auth;
let db;
let currentUser;
let profile = {};
let address = {};

function showStatus(message, type = "success") {
  status.textContent = message;
  status.className = `auth-status is-${type}`;
  status.hidden = !message;
  status.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function firstName(user) {
  return String(profile.fullName || user.displayName || user.email?.split("@")[0] || "Arvel girl")
    .trim()
    .split(/\s+/)[0];
}

function selectPanel(name) {
  document.querySelectorAll("[data-account-tab]").forEach((button) => {
    const active = button.dataset.accountTab === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  document.querySelectorAll("[data-account-panel]").forEach((panel) => {
    const active = panel.dataset.accountPanel === name;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  document.querySelector(".account-main")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindNavigation() {
  document.addEventListener("click", (event) => {
    const control = event.target.closest("[data-account-tab], [data-account-go]");
    if (!control) return;
    selectPanel(control.dataset.accountTab || control.dataset.accountGo);
  });
}

function fillForms(user) {
  const profileForm = document.querySelector("#profile-form");
  const addressForm = document.querySelector("#address-form");
  profileForm.elements.fullName.value = profile.fullName || user.displayName || "";
  profileForm.elements.phone.value = profile.phone || "";
  profileForm.elements.dni.value = profile.dni || "";
  profileForm.elements.newsletter.checked = Boolean(profile.newsletter);
  document.querySelector("#profile-email").value = user.email || "";

  for (const name of ["province", "city", "postalCode", "street", "streetNumber", "apartment", "references"]) {
    addressForm.elements[name].value = address[name] || "";
  }
}

function renderSummary(user) {
  const name = profile.fullName || user.displayName || "Clienta Arvel";
  document.querySelector("#account-name").textContent = name;
  document.querySelector("#account-first-name").textContent = firstName(user);
  document.querySelector("#account-email").textContent = user.email || "";
  document.querySelector("#summary-name").textContent = name;
  document.querySelector("#summary-email").textContent = user.email || "";
  document.querySelector("#summary-phone").textContent = profile.phone || "Teléfono pendiente";
  document.querySelector("#summary-newsletter").textContent = profile.newsletter
    ? "Estás suscripta a las novedades de Arvel."
    : "No estás suscripta.";
  document.querySelector("#summary-address").textContent = address.street
    ? `${address.street} ${address.streetNumber}${address.apartment ? `, ${address.apartment}` : ""} · ${address.city}, ${address.province} (${address.postalCode})`
    : "Todavía no agregaste una dirección.";

  const verification = document.querySelector("#account-verification");
  verification.textContent = user.emailVerified ? "Correo verificado" : "Verificación pendiente";
  verification.classList.toggle("is-verified", user.emailVerified);
  document.querySelector("#resend-verification").hidden = user.emailVerified;

  document.querySelectorAll("[data-auth-account]").forEach((link) => {
    const label = link.querySelector("[data-auth-label]");
    if (label) label.textContent = `Hola, ${firstName(user)}`;
  });
}

async function loadProfile(user) {
  const snapshot = await getDoc(doc(db, "users", user.uid));
  const data = snapshot.exists() ? snapshot.data() : {};
  profile = data.profile || {};
  address = data.address || {};
  await setDoc(doc(db, "users", user.uid), {
    email: user.email || "",
    profile: { fullName: profile.fullName || user.displayName || "", ...profile },
    address,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function loadOrders(user) {
  const container = document.querySelector("#account-orders");
  let orders = [];
  try {
    const snapshot = await getDocs(query(collection(db, "users", user.uid, "orders"), orderBy("createdAt", "desc")));
    orders = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  } catch (error) {
    console.warn("No se pudo cargar el historial de pedidos.", error);
  }
  document.querySelector("#account-orders-count").textContent = String(orders.length);
  container.innerHTML = orders.length
    ? orders.map((order) => `
        <article class="account-order">
          <div><span class="eyebrow">${order.status || "Pendiente"}</span><h3>${order.orderNumber || order.id}</h3></div>
          <div><span>${order.createdAt?.toDate?.().toLocaleDateString("es-AR") || "Fecha pendiente"}</span><strong>${window.Arvel.formatPrice(Number(order.total) || 0)}</strong></div>
        </article>`).join("")
    : `<div class="account-empty"><span aria-hidden="true">✦</span><h3>Todavía no hay pedidos registrados</h3><p>Los pedidos confirmados por el futuro backend aparecerán acá. Un mensaje preparado por WhatsApp no cuenta como compra recibida.</p><a class="button button--pink" href="tienda.html">Ir al shop</a></div>`;
}

async function loadFavorites() {
  const products = await (window.ARVEL_PRODUCTS_READY || Promise.resolve(window.ARVEL_PRODUCTS || []));
  const ids = window.ArvelStore.readStoredArray(window.ArvelStore.storageKeys.favorites).map(String);
  const favorites = products.filter((product) => ids.includes(String(product.documentId || product.id)) || ids.includes(String(product.id)));
  document.querySelector("#account-favorites-count").textContent = String(favorites.length);
  const container = document.querySelector("#account-favorites");
  container.innerHTML = favorites.length
    ? favorites.map(window.Arvel.createProductCard).join("")
    : `<div class="account-empty"><span aria-hidden="true">♡</span><h3>Tu lista está esperando</h3><p>Guardá las piezas que te gusten tocando el corazón.</p><a class="button button--pink" href="tienda.html">Explorar el shop</a></div>`;
  container.querySelectorAll("[data-reveal]").forEach((card) => card.classList.add("is-visible"));
}

function bindForms(user) {
  document.querySelector("#profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    profile = {
      fullName: String(data.get("fullName") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      dni: String(data.get("dni") || "").trim(),
      newsletter: data.get("newsletter") === "on"
    };
    try {
      await Promise.all([
        updateProfile(user, { displayName: profile.fullName }),
        setDoc(doc(db, "users", user.uid), { email: user.email || "", profile, updatedAt: serverTimestamp() }, { merge: true })
      ]);
      renderSummary(user);
      showStatus("Guardamos la información de tu cuenta.");
    } catch (error) {
      console.error(error);
      showStatus("No pudimos guardar tus datos. Revisá las reglas de Firestore.", "error");
    }
  });

  document.querySelector("#address-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    address = Object.fromEntries(["province", "city", "postalCode", "street", "streetNumber", "apartment", "references"].map((key) => [key, String(data.get(key) || "").trim()]));
    try {
      await setDoc(doc(db, "users", user.uid), { address, updatedAt: serverTimestamp() }, { merge: true });
      renderSummary(user);
      showStatus("Guardamos tu dirección de envío.");
    } catch (error) {
      console.error(error);
      showStatus("No pudimos guardar la dirección. Revisá las reglas de Firestore.", "error");
    }
  });
}

async function initialize() {
  bindNavigation();
  if (!firebaseConfigured) {
    loading.hidden = true;
    guest.hidden = false;
    return;
  }
  const app = getApps().find((candidate) => candidate.name === "[DEFAULT]")
    || initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  onAuthStateChanged(auth, async (user) => {
    loading.hidden = true;
    guest.hidden = Boolean(user);
    content.hidden = !user;
    if (!user) return;
    currentUser = user;
    try {
      await loadProfile(user);
    } catch (error) {
      console.error(error);
      profile = { fullName: user.displayName || "" };
      address = {};
      showStatus("Abrimos tu cuenta, pero Firestore todavía no permite guardar el perfil.", "error");
    }
    fillForms(user);
    renderSummary(user);
    bindForms(user);
    await Promise.all([loadOrders(user), loadFavorites()]);
  });

  document.querySelector("#account-password-reset").addEventListener("click", async () => {
    await sendPasswordResetEmail(auth, currentUser.email);
    showStatus("Te enviamos un enlace para cambiar la contraseña.");
  });
}

initialize().catch((error) => {
  console.error(error);
  loading.textContent = "No pudimos abrir tu cuenta. Actualizá la página e intentá nuevamente.";
});
