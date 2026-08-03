import {
  getApp,
  getApps,
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  doc,
  getDoc,
  getFirestore
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig, firebaseConfigured } from "./firebase-config.js?v=20260731-5";

const accountLinks = document.querySelectorAll("[data-auth-account]");
const authPage = document.querySelector("[data-auth-page]")?.dataset.authPage || "";
let auth = null;
let db = null;

function setStatus(target, message, type = "") {
  if (!target) return;
  target.textContent = message;
  target.className = "auth-status";
  if (type) target.classList.add(`is-${type}`);
  target.hidden = !message;
}

function setBusy(form, busy) {
  const submit = form?.querySelector('[type="submit"]');
  if (!submit) return;
  submit.disabled = busy;
  submit.dataset.originalLabel ||= submit.textContent;
  submit.textContent = busy ? "Procesando…" : submit.dataset.originalLabel;
}

function friendlyError(error) {
  const code = String(error?.code || "");
  const messages = {
    "auth/email-already-in-use": "No pudimos crear la cuenta con esos datos. Probá iniciar sesión o recuperar tu contraseña.",
    "auth/invalid-email": "Ingresá un correo electrónico válido.",
    "auth/weak-password": "La contraseña no cumple la política de seguridad configurada.",
    "auth/invalid-credential": "El correo o la contraseña no son correctos.",
    "auth/too-many-requests": "Hubo demasiados intentos. Esperá unos minutos y volvé a probar.",
    "auth/network-request-failed": "No pudimos conectar con Firebase. Revisá tu conexión e intentá nuevamente.",
    "auth/operation-not-allowed": "El acceso con email y contraseña todavía no está habilitado en Firebase.",
    "auth/unauthorized-domain": "Este dominio todavía no está autorizado en Firebase Authentication.",
    "auth/configuration-not-found": "Firebase Authentication no encuentra la configuración de este proyecto.",
    "auth/invalid-api-key": "La clave pública de Firebase no es válida.",
    "auth/app-not-authorized": "Esta web no está autorizada para usar este proyecto de Firebase.",
    "auth/admin-restricted-operation": "Esta operación está restringida por la configuración de Firebase.",
    "auth/operation-not-supported-in-this-environment": "El navegador o esta dirección no permiten completar la operación.",
    "auth/user-disabled": "Esta cuenta fue deshabilitada en Firebase.",
    "auth/missing-email": "Ingresá el correo electrónico.",
    "auth/internal-error": "Firebase tuvo un error interno. Volvé a intentarlo en unos minutos."
  };
  return messages[code] || `No pudimos completar la operación (${code || "error desconocido"}).`;
}

function reportAuthError(context, error) {
  console.error(`[Firebase Auth] ${context}:`, error?.code || "sin código", error?.message || error);
}

function safeNextPage() {
  const value = new URLSearchParams(location.search).get("next");
  return value && /^[a-z0-9-]+\.html(?:\?.*)?$/i.test(value)
    ? value
    : "cuenta.html";
}

function updateAccountLinks(user) {
  accountLinks.forEach((link) => {
    const label = link.querySelector("[data-auth-label]");
    link.href = user ? "cuenta.html" : "login.html";
    link.setAttribute(
      "aria-label",
      user ? `Abrir cuenta de ${user.displayName || user.email}` : "Iniciar sesión"
    );
    if (label) {
      const firstName = String(user?.displayName || "").trim().split(/\s+/)[0];
      label.textContent = user ? `Hola, ${firstName || "Arvel"}` : "Ingresar";
    }
  });
}

function showConfigurationNotice() {
  document.querySelectorAll("[data-firebase-required]").forEach((element) => {
    element.hidden = false;
  });
  document.querySelectorAll("[data-auth-form]").forEach((form) => {
    form.querySelectorAll("input, button").forEach((control) => {
      control.disabled = true;
    });
  });
}

function bindPasswordToggles() {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      button.textContent = visible ? "Mostrar" : "Ocultar";
      button.setAttribute("aria-pressed", String(!visible));
    });
  });
}

function bindRegistration() {
  const form = document.querySelector("#register-form");
  if (!form) return;
  const status = document.querySelector("#register-status");
  const next = new URLSearchParams(location.search).get("next");
  const loginLink = document.querySelector('a[href="login.html"]');
  if (loginLink && next && /^[a-z0-9-]+\.html(?:\?.*)?$/i.test(next)) {
    loginLink.href = `login.html?next=${encodeURIComponent(next)}`;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(status, "");

    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    const confirmation = String(data.get("passwordConfirmation") || "");

    if (name.length < 2) {
      setStatus(status, "Ingresá tu nombre.", "error");
      return;
    }
    if (password.length < 8) {
      setStatus(status, "La contraseña debe tener al menos 8 caracteres.", "error");
      return;
    }
    if (password !== confirmation) {
      setStatus(status, "Las contraseñas no coinciden.", "error");
      return;
    }

    setBusy(form, true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: name });
      await sendEmailVerification(credential.user);
      setStatus(
        status,
        "Cuenta creada. Te enviamos un correo de verificación. Revisá también Spam.",
        "success"
      );
      window.setTimeout(() => {
        location.href = safeNextPage();
      }, 1200);
    } catch (error) {
      reportAuthError("registro", error);
      setStatus(status, friendlyError(error), "error");
    } finally {
      setBusy(form, false);
    }
  });
}

function bindLogin() {
  const form = document.querySelector("#login-form");
  if (!form) return;
  const status = document.querySelector("#login-status");
  const reset = document.querySelector("#password-reset");
  const next = new URLSearchParams(location.search).get("next");
  const registerLink = document.querySelector('a[href="registro.html"]');
  if (registerLink && next && /^[a-z0-9-]+\.html(?:\?.*)?$/i.test(next)) {
    registerLink.href = `registro.html?next=${encodeURIComponent(next)}`;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(status, "");
    const data = new FormData(form);
    setBusy(form, true);
    try {
      await signInWithEmailAndPassword(
        auth,
        String(data.get("email") || "").trim(),
        String(data.get("password") || "")
      );
      location.href = safeNextPage();
    } catch (error) {
      reportAuthError("inicio de sesión", error);
      setStatus(status, friendlyError(error), "error");
    } finally {
      setBusy(form, false);
    }
  });

  reset?.addEventListener("click", async () => {
    const email = form.elements.email.value.trim();
    if (!email) {
      setStatus(status, "Ingresá tu correo para enviarte el enlace de recuperación.", "error");
      form.elements.email.focus();
      return;
    }
    reset.disabled = true;
    try {
      await sendPasswordResetEmail(auth, email);
      setStatus(
        status,
        "Si existe una cuenta asociada, recibirás un correo para cambiar la contraseña.",
        "success"
      );
    } catch (error) {
      reportAuthError("recuperación de contraseña", error);
      setStatus(status, friendlyError(error), "error");
    } finally {
      reset.disabled = false;
    }
  });
}

function renderAccount(user) {
  const loading = document.querySelector("#account-loading");
  const guest = document.querySelector("#account-guest");
  const content = document.querySelector("#account-content");
  if (!content) return;

  loading.hidden = true;
  guest.hidden = Boolean(user);
  content.hidden = !user;
  if (!user) return;

  document.querySelector("#account-name").textContent =
    user.displayName || "Clienta Arvel";
  document.querySelector("#account-email").textContent = user.email || "";
  const verification = document.querySelector("#account-verification");
  verification.textContent = user.emailVerified ? "Correo verificado" : "Verificación pendiente";
  verification.classList.toggle("is-verified", user.emailVerified);

  const resend = document.querySelector("#resend-verification");
  resend.hidden = user.emailVerified;
  resend.onclick = async () => {
    resend.disabled = true;
    try {
      await sendEmailVerification(user);
      setStatus(
        document.querySelector("#account-status"),
        "Te enviamos un nuevo correo de verificación.",
        "success"
      );
    } catch (error) {
      setStatus(document.querySelector("#account-status"), friendlyError(error), "error");
    } finally {
      resend.disabled = false;
    }
  };
}

async function updateAdminAccess(user) {
  const adminLink = document.querySelector("#account-admin-products");
  if (!adminLink) return;
  adminLink.hidden = true;
  if (!user || !db) return;

  try {
    const admin = await getDoc(doc(db, "admins", user.uid));
    adminLink.hidden = !admin.exists();
  } catch (error) {
    reportAuthError("verificación de administradora", error);
  }
}

function bindAccountActions() {
  document.querySelector("#account-logout")?.addEventListener("click", async () => {
    await signOut(auth);
    location.href = "login.html";
  });
}

async function initializeAuthentication() {
  bindPasswordToggles();
  if (!firebaseConfigured) {
    updateAccountLinks(null);
    showConfigurationNotice();
    document.querySelector("#account-loading")?.setAttribute("hidden", "");
    document.querySelector("#account-guest")?.removeAttribute("hidden");
    return;
  }

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  await setPersistence(auth, browserLocalPersistence);

  bindRegistration();
  bindLogin();
  bindAccountActions();

  onAuthStateChanged(auth, (user) => {
    updateAccountLinks(user);
    renderAccount(user);
    updateAdminAccess(user);

    if (authPage === "login" && user) {
      location.replace(safeNextPage());
    }
  });
}

initializeAuthentication().catch((error) => {
  reportAuthError("inicialización", error);
  showConfigurationNotice();
  setStatus(
    document.querySelector(".auth-status"),
    `No pudimos inicializar Firebase Authentication (${error?.code || "sin código"}).`,
    "error"
  );
});
