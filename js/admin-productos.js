import {
  getApp,
  getApps,
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig, firebaseConfigured } from "./firebase-config.js?v=20260731-5";

const app = firebaseConfigured
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const placeholder = "assets/images/moodboard/arvel-editorial-hero.png";

const ui = {
  loading: document.querySelector("#admin-loading"),
  denied: document.querySelector("#admin-denied"),
  content: document.querySelector("#admin-content"),
  uid: document.querySelector("#admin-current-uid"),
  logout: document.querySelector("#admin-logout"),
  form: document.querySelector("#product-admin-form"),
  error: document.querySelector("#admin-form-error"),
  state: document.querySelector("#admin-save-state"),
  list: document.querySelector("#admin-product-list"),
  search: document.querySelector("#admin-search"),
  newProduct: document.querySelector("#new-product"),
  addVariant: document.querySelector("#add-variant"),
  variants: document.querySelector("#variant-rows"),
  imageUrls: document.querySelector("#product-image-urls"),
  previewImages: document.querySelector("#preview-image-urls"),
  preview: document.querySelector("#image-preview"),
  saveDraft: document.querySelector("#save-draft"),
  duplicate: document.querySelector("#duplicate-current"),
  editorMode: document.querySelector("#editor-mode"),
  editorTitle: document.querySelector("#editor-title")
};

let products = [];
let existingImages = [];

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function setState(message, type = "") {
  ui.state.textContent = message;
  ui.state.dataset.type = type;
}

function setBusy(busy) {
  ui.form.querySelectorAll("button, input, select, textarea").forEach((control) => {
    if (control.id !== "product-document-id") control.disabled = busy;
  });
  if (busy) setState("Guardando…");
}

function addVariantRow(variant = {}) {
  const row = document.createElement("div");
  row.className = "admin-variant-row";
  row.innerHTML = `
    <input class="input" name="variantSize" placeholder="Talle" aria-label="Talle" value="${escapeHtml(variant.size || "")}">
    <input class="input" name="variantColor" placeholder="Color" aria-label="Color" value="${escapeHtml(variant.color || "")}">
    <input class="input" name="variantStock" type="number" min="0" step="1" placeholder="Stock" aria-label="Stock" value="${Number(variant.stock ?? 1)}">
    <button type="button" aria-label="Eliminar variante">×</button>
  `;
  row.querySelector("button").addEventListener("click", () => {
    if (ui.variants.children.length > 1) row.remove();
  });
  ui.variants.append(row);
}

function readVariants() {
  return [...ui.variants.querySelectorAll(".admin-variant-row")]
    .map((row) => ({
      size: row.querySelector('[name="variantSize"]').value.trim(),
      color: row.querySelector('[name="variantColor"]').value.trim(),
      stock: Math.max(0, Number(row.querySelector('[name="variantStock"]').value) || 0)
    }))
    .filter((variant) => variant.size && variant.color);
}

function renderImages() {
  existingImages = ui.imageUrls.value
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean);
  ui.preview.innerHTML = existingImages.map((url, index) => `
    <figure>
      <img src="${escapeHtml(url)}" alt="">
      <button type="button" data-image-index="${index}" aria-label="Quitar foto">×</button>
    </figure>
  `).join("");
}

function resetForm() {
  ui.form.reset();
  ui.form.elements.documentId.value = "";
  ui.variants.innerHTML = "";
  addVariantRow();
  existingImages = [];
  ui.imageUrls.value = "";
  renderImages();
  ui.error.textContent = "";
  ui.duplicate.hidden = true;
  ui.editorMode.textContent = "Nuevo producto";
  ui.editorTitle.textContent = "Cargar una pieza";
  ui.list.querySelectorAll(".is-active").forEach((item) => item.classList.remove("is-active"));
  ui.form.elements.name.focus();
}

function productVariants(product) {
  return Object.entries(product.stockByVariant || {}).map(([key, stock]) => {
    const [size, color] = key.split("|");
    return { size, color, stock };
  });
}

function fillForm(product) {
  resetForm();
  const fields = {
    documentId: product.documentId,
    name: product.name,
    sku: product.sku,
    category: product.category,
    collection: product.collection,
    price: product.price,
    oldPrice: product.oldPrice || "",
    condition: product.condition,
    status: product.status || "draft",
    shortDescription: product.shortDescription,
    description: product.description,
    material: product.material,
    care: product.care,
    bust: product.measurements?.bust,
    waist: product.measurements?.waist,
    hip: product.measurements?.hip,
    length: product.measurements?.length,
    tags: (product.tags || []).join(", ")
  };
  Object.entries(fields).forEach(([name, value]) => {
    if (ui.form.elements[name]) ui.form.elements[name].value = value ?? "";
  });
  ui.form.elements.featured.checked = Boolean(product.featured);
  ui.form.elements.uniquePiece.checked = Boolean(product.uniquePiece);
  ui.variants.innerHTML = "";
  const variants = productVariants(product);
  (variants.length ? variants : [{}]).forEach(addVariantRow);
  existingImages = [...(product.images || [])];
  ui.imageUrls.value = existingImages.join("\n");
  renderImages();
  ui.duplicate.hidden = false;
  ui.editorMode.textContent = "Editando producto";
  ui.editorTitle.textContent = product.name;
  ui.list.querySelector(`[data-product-id="${CSS.escape(product.documentId)}"]`)?.classList.add("is-active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderList() {
  const term = ui.search.value.trim().toLowerCase();
  const visible = products.filter((product) =>
    `${product.name} ${product.sku}`.toLowerCase().includes(term)
  );
  ui.list.innerHTML = visible.length ? visible.map((product) => `
    <button class="admin-product-item" type="button" data-product-id="${escapeHtml(product.documentId)}">
      <img src="${escapeHtml(product.images?.[0] || placeholder)}" alt="">
      <span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku)}</small></span>
      <span class="admin-status admin-status--${escapeHtml(product.status || "draft")}">${escapeHtml(product.status || "draft")}</span>
    </button>
  `).join("") : "<p>No hay productos para mostrar.</p>";
}

async function loadProducts() {
  const snapshot = await getDocs(query(collection(db, "products"), orderBy("updatedAt", "desc")));
  products = snapshot.docs.map((item) => ({ documentId: item.id, ...item.data() }));
  renderList();
}

function buildProduct(statusOverride) {
  const data = new FormData(ui.form);
  const variants = readVariants();
  const status = statusOverride || String(data.get("status") || "draft");
  const name = String(data.get("name") || "").trim();
  const sku = String(data.get("sku") || "").trim().toUpperCase();
  const stockByVariant = Object.fromEntries(
    variants.map((variant) => [`${variant.size}|${variant.color}`, variant.stock])
  );
  const stock = variants.reduce((sum, variant) => sum + variant.stock, 0);
  return {
    name,
    slug: slugify(name),
    sku,
    category: String(data.get("category") || "").trim(),
    collection: String(data.get("collection") || "").trim(),
    price: Math.max(0, Number(data.get("price")) || 0),
    oldPrice: Number(data.get("oldPrice")) || null,
    condition: String(data.get("condition") || "Custom"),
    status,
    shortDescription: String(data.get("shortDescription") || "").trim(),
    description: String(data.get("description") || "").trim(),
    material: String(data.get("material") || "").trim(),
    care: String(data.get("care") || "").trim(),
    measurements: {
      bust: String(data.get("bust") || "No aplica").trim(),
      waist: String(data.get("waist") || "No aplica").trim(),
      hip: String(data.get("hip") || "No aplica").trim(),
      length: String(data.get("length") || "No aplica").trim()
    },
    sizes: [...new Set(variants.map((item) => item.size))],
    colors: [...new Set(variants.map((item) => item.color))],
    stockByVariant,
    stock,
    soldOut: stock <= 0,
    archived: status === "hidden",
    discount: 0,
    featured: data.get("featured") === "on",
    uniquePiece: data.get("uniquePiece") === "on",
    tags: String(data.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean)
  };
}

function validateProduct(product) {
  if (!product.name) return "Ingresá el nombre.";
  if (!product.sku) return "Ingresá el SKU.";
  if (!product.category) return "Elegí una categoría.";
  if (product.price <= 0) return "Ingresá un precio válido.";
  if (!product.shortDescription) return "Ingresá una descripción breve.";
  if (!product.sizes.length) return "Agregá al menos una combinación de talle y color.";
  renderImages();
  if (product.status === "published" && !existingImages.length) {
    return "Para publicar necesitás al menos una fotografía.";
  }
  return "";
}

async function saveProduct(statusOverride) {
  ui.error.textContent = "";
  const product = buildProduct(statusOverride);
  const error = validateProduct(product);
  if (error) {
    ui.error.textContent = error;
    return;
  }
  setBusy(true);
  try {
    const currentId = ui.form.elements.documentId.value;
    const documentId = currentId || `${product.slug}-${crypto.randomUUID().slice(0, 8)}`;
    const currentProduct = products.find((item) => item.documentId === currentId);
    product.id = Number(currentProduct?.id) || Date.now();
    renderImages();
    product.images = [...existingImages];
    product.updatedAt = serverTimestamp();
    if (!currentId) product.createdAt = serverTimestamp();
    await setDoc(doc(db, "products", documentId), product, { merge: true });
    setState(product.status === "published" ? "Producto publicado" : "Producto guardado", "success");
    await loadProducts();
    const saved = products.find((item) => item.documentId === documentId);
    if (saved) fillForm(saved);
  } catch (error) {
    ui.error.textContent = error.message || "No pudimos guardar el producto.";
    setState("Error al guardar", "error");
  } finally {
    setBusy(false);
  }
}

ui.addVariant.addEventListener("click", () => addVariantRow());
ui.newProduct.addEventListener("click", resetForm);
ui.search.addEventListener("input", renderList);
ui.list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-product-id]");
  const product = products.find((item) => item.documentId === button?.dataset.productId);
  if (product) fillForm(product);
});
ui.previewImages.addEventListener("click", renderImages);
ui.preview.addEventListener("click", (event) => {
  const button = event.target.closest("[data-image-index]");
  if (!button) return;
  const index = Number(button.dataset.imageIndex);
  existingImages.splice(index, 1);
  ui.imageUrls.value = existingImages.join("\n");
  renderImages();
});
ui.form.addEventListener("submit", (event) => {
  event.preventDefault();
  saveProduct();
});
ui.saveDraft.addEventListener("click", () => saveProduct("draft"));
ui.duplicate.addEventListener("click", () => {
  ui.form.elements.documentId.value = "";
  ui.form.elements.name.value = `${ui.form.elements.name.value} copia`;
  ui.form.elements.sku.value = `${ui.form.elements.sku.value}-COPIA`;
  ui.form.elements.status.value = "draft";
  ui.duplicate.hidden = true;
  ui.editorMode.textContent = "Duplicando producto";
});
ui.logout.addEventListener("click", async () => {
  if (auth) await signOut(auth);
  location.href = "login.html";
});

async function initialize(user) {
  if (!user) {
    location.replace("login.html?next=admin-productos.html");
    return;
  }
  ui.uid.value = user.uid;
  const admin = await getDoc(doc(db, "admins", user.uid));
  ui.loading.hidden = true;
  if (!admin.exists()) {
    ui.denied.hidden = false;
    return;
  }
  ui.content.hidden = false;
  resetForm();
  await loadProducts();
}

if (!firebaseConfigured) {
  ui.loading.hidden = true;
  ui.denied.hidden = false;
  ui.denied.querySelector("p").textContent = "Falta completar la configuración pública de Firebase.";
} else {
  onAuthStateChanged(auth, (user) => {
    initialize(user).catch((error) => {
      ui.loading.hidden = true;
      ui.denied.hidden = false;
      ui.denied.querySelector("p").textContent =
        error.message || "No pudimos abrir el panel.";
    });
  });
}
