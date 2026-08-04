import {
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
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";
import { firebaseConfig, firebaseConfigured } from "./firebase-config.js?v=20260731-5";

const app = firebaseConfigured
  ? (getApps().find((candidate) => candidate.name === "[DEFAULT]") || initializeApp(firebaseConfig))
  : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const storage = app ? getStorage(app) : null;
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
  imageFiles: document.querySelector("#product-image-files"),
  uploadProgress: document.querySelector("#image-upload-progress"),
  uploadLabel: document.querySelector("#image-upload-label"),
  uploadPercent: document.querySelector("#image-upload-percent"),
  uploadBar: document.querySelector("#image-upload-bar"),
  previewImages: document.querySelector("#preview-image-urls"),
  preview: document.querySelector("#image-preview"),
  saveDraft: document.querySelector("#save-draft"),
  duplicate: document.querySelector("#duplicate-current"),
  editorMode: document.querySelector("#editor-mode"),
  editorTitle: document.querySelector("#editor-title"),
  tabs: document.querySelector(".admin-tabs"),
  panels: [...document.querySelectorAll("[data-admin-panel]")],
  inventory: document.querySelector("#inventory-products"),
  instagramProducts: document.querySelector("#instagram-products"),
  instagramCount: document.querySelector("#instagram-product-count"),
  duplicateProducts: document.querySelector("#duplicate-products"),
  instagramSync: document.querySelector("#instagram-sync"),
  instagramSyncState: document.querySelector("#instagram-sync-state"),
  instagramDot: document.querySelector("#instagram-dot"),
  instagramTitle: document.querySelector("#instagram-connection-title"),
  instagramCopy: document.querySelector("#instagram-connection-copy"),
  settingsForm: document.querySelector("#automation-settings-form"),
  settingsState: document.querySelector("#settings-state"),
  markerPreview: document.querySelector("#instagram-marker-preview"),
  alerts: document.querySelector("#admin-alerts")
};

let products = [];
let existingImages = [];
let selectedImages = [];
let previewObjectUrls = [];
let activeDocumentId = "";

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
  previewObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  previewObjectUrls = selectedImages.map((file) => URL.createObjectURL(file));
  const savedMarkup = existingImages.map((url, index) => `
    <figure>
      <img src="${escapeHtml(url)}" alt="">
      <span>Guardada</span>
      <button type="button" data-saved-image-index="${index}" aria-label="Quitar foto">×</button>
    </figure>
  `).join("");
  const pendingMarkup = selectedImages.map((file, index) => `
    <figure>
      <img src="${escapeHtml(previewObjectUrls[index])}" alt="">
      <span>Pendiente</span>
      <button type="button" data-pending-image-index="${index}" aria-label="Quitar foto">×</button>
    </figure>
  `).join("");
  ui.preview.innerHTML = savedMarkup + pendingMarkup;
}

function validateSelectedImages(files) {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  for (const file of files) {
    if (!allowed.has(file.type)) return `${file.name}: usá una imagen JPG, PNG o WEBP.`;
    if (file.size > 8 * 1024 * 1024) return `${file.name}: supera el máximo de 8 MB.`;
  }
  return "";
}

function uploadFile(documentId, file, index, total) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const fileName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
  const storageReference = ref(storage, `products/${documentId}/${fileName}`);
  const task = uploadBytesResumable(storageReference, file, { contentType: file.type });
  return new Promise((resolve, reject) => {
    task.on("state_changed", (snapshot) => {
      const current = snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0;
      const percent = Math.round(((index + current) / total) * 100);
      ui.uploadBar.value = percent;
      ui.uploadPercent.textContent = `${percent}%`;
      ui.uploadLabel.textContent = `Subiendo ${index + 1} de ${total}: ${file.name}`;
    }, reject, async () => resolve(await getDownloadURL(task.snapshot.ref)));
  });
}

async function uploadSelectedImages(documentId) {
  if (!selectedImages.length) return [];
  ui.uploadProgress.hidden = false;
  ui.uploadBar.value = 0;
  ui.uploadPercent.textContent = "0%";
  const uploaded = [];
  for (let index = 0; index < selectedImages.length; index += 1) {
    uploaded.push(await uploadFile(documentId, selectedImages[index], index, selectedImages.length));
  }
  ui.uploadBar.value = 100;
  ui.uploadPercent.textContent = "100%";
  ui.uploadLabel.textContent = "Fotografías subidas correctamente";
  return uploaded;
}

function resetForm() {
  activeDocumentId = "";
  ui.form.reset();
  ui.form.elements.documentId.value = "";
  ui.variants.innerHTML = "";
  addVariantRow();
  existingImages = [];
  selectedImages = [];
  ui.imageFiles.value = "";
  ui.uploadProgress.hidden = true;
  ui.imageUrls.value = "";
  renderImages();
  ui.error.textContent = "";
  ui.duplicate.hidden = true;
  ui.saveDraft.hidden = false;
  ui.form.querySelector('[type="submit"]').textContent = "Guardar producto";
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
  activeDocumentId = product.documentId;
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
    tags: (product.tags || []).join(", "),
    source: product.source || "manual",
    instagramMediaId: product.instagramMediaId || "",
    instagramPermalink: product.instagramPermalink || ""
  };
  Object.entries(fields).forEach(([name, value]) => {
    const control = ui.form.elements.namedItem(name);
    if (control) control.value = value ?? "";
  });
  ui.form.elements.featured.checked = Boolean(product.featured);
  ui.form.elements.uniquePiece.checked = Boolean(product.uniquePiece);
  ui.variants.innerHTML = "";
  const variants = productVariants(product);
  (variants.length ? variants : [{}]).forEach(addVariantRow);
  existingImages = [...(product.images || [])];
  selectedImages = [];
  ui.imageFiles.value = "";
  ui.imageUrls.value = existingImages.join("\n");
  renderImages();
  ui.duplicate.hidden = false;
  ui.saveDraft.hidden = product.status === "published";
  ui.form.querySelector('[type="submit"]').textContent = "Guardar cambios";
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
  renderControlCenter();
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
    tags: String(data.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean),
    source: String(data.get("source") || "manual"),
    instagramMediaId: String(data.get("instagramMediaId") || "").trim(),
    instagramPermalink: String(data.get("instagramPermalink") || "").trim()
  };
}

function validateProduct(product) {
  if (!product.name) return "Ingresá el nombre.";
  if (!product.sku) return "Ingresá el SKU.";
  if (!product.category) return "Elegí una categoría.";
  if (product.price <= 0) return "Ingresá un precio válido.";
  if (!product.shortDescription) return "Ingresá una descripción breve.";
  if (!product.sizes.length) return "Agregá al menos una combinación de talle y color.";
  const duplicate = products.find((item) => item.documentId !== activeDocumentId && (
    (product.sku && String(item.sku || "").toUpperCase() === product.sku) ||
    (product.instagramMediaId && item.instagramMediaId === product.instagramMediaId) ||
    (product.instagramPermalink && item.instagramPermalink === product.instagramPermalink)
  ));
  if (duplicate) return `Ya existe un producto relacionado: ${duplicate.name} (${duplicate.sku}).`;
  renderImages();
  if (product.status === "published" && !existingImages.length && !selectedImages.length) {
    return "Para publicar necesitás al menos una fotografía.";
  }
  return "";
}

function duplicateGroups() {
  const groups = [];
  ["sku", "instagramMediaId", "instagramPermalink"].forEach((field) => {
    const map = new Map();
    products.forEach((product) => {
      const value = String(product[field] || "").trim().toLowerCase();
      if (!value) return;
      map.set(value, [...(map.get(value) || []), product]);
    });
    map.forEach((items, value) => {
      if (items.length > 1) groups.push({ field, value, items });
    });
  });
  return groups;
}

function managementItem(product, actions = "") {
  return `<article class="admin-management-item">
    <img src="${escapeHtml(product.images?.[0] || placeholder)}" alt="">
    <div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku || "Sin SKU")} · ${escapeHtml(product.status || "draft")}</small></div>
    <div class="admin-management-actions">${actions}</div>
  </article>`;
}

function renderControlCenter() {
  const groups = duplicateGroups();
  const instagram = products.filter((product) => product.source === "instagram" || product.instagramMediaId);
  const stats = {
    products: products.length,
    published: products.filter((item) => item.status === "published" && !item.soldOut).length,
    sold: products.filter((item) => item.soldOut || Number(item.stock) <= 0).length,
    lowStock: products.filter((item) => !item.soldOut && Number(item.stock) === 1).length,
    drafts: products.filter((item) => item.status === "draft").length,
    duplicates: groups.length
  };
  Object.entries(stats).forEach(([key, value]) => {
    const id = `stat-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
    const target = document.querySelector(`#${id}`);
    if (target) target.textContent = String(value);
  });
  const alertItems = [];
  if (stats.lowStock) alertItems.push(`<p><strong>${stats.lowStock}</strong> producto(s) con una sola unidad.</p>`);
  if (stats.duplicates) alertItems.push(`<p><strong>${stats.duplicates}</strong> coincidencia(s) para revisar.</p>`);
  if (stats.drafts) alertItems.push(`<p><strong>${stats.drafts}</strong> borrador(es) sin publicar.</p>`);
  ui.alerts.innerHTML = alertItems.join("") || "<p>El catálogo no tiene alertas.</p>";
  ui.instagramCount.textContent = String(instagram.length);
  ui.instagramProducts.innerHTML = instagram.length
    ? instagram.map((product) => managementItem(product, `<button type="button" data-edit-product="${escapeHtml(product.documentId)}">Editar</button>`)).join("")
    : "<p>No hay productos vinculados a Instagram todavía.</p>";
  ui.duplicateProducts.innerHTML = groups.length
    ? groups.map((group) => `<article class="admin-card"><span class="eyebrow">Coincidencia por ${escapeHtml(group.field)}</span><h2>${escapeHtml(group.value)}</h2>${group.items.map((product) => managementItem(product, `<button type="button" data-edit-product="${escapeHtml(product.documentId)}">Revisar</button>`)).join("")}</article>`).join("")
    : '<article class="admin-card admin-empty-state"><strong>No encontramos duplicados exactos</strong><p>El panel seguirá controlando SKU e identificadores de Instagram al guardar.</p></article>';
  ui.inventory.innerHTML = products.length ? products.map((product) => `
    <tr><td><strong>${escapeHtml(product.name)}</strong></td><td>${escapeHtml(product.sku)}</td><td>${Number(product.stock) || 0}</td><td>${product.soldOut ? "Vendido" : escapeHtml(product.status || "draft")}</td>
    <td><button type="button" data-stock-action="${product.soldOut ? "restore" : "sold"}" data-product-id="${escapeHtml(product.documentId)}">${product.soldOut ? "Reactivar" : "Marcar vendido"}</button> <button type="button" data-edit-product="${escapeHtml(product.documentId)}">Editar</button></td></tr>
  `).join("") : '<tr><td colspan="5">Todavía no hay productos.</td></tr>';
}

function openView(name) {
  ui.panels.forEach((panel) => { panel.hidden = panel.dataset.adminPanel !== name; });
  ui.tabs.querySelectorAll("[data-admin-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.adminView === name));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function changeStockState(documentId, action) {
  const product = products.find((item) => item.documentId === documentId);
  if (!product) return;
  const sold = action === "sold";
  const previousVariants = product.stockByVariantBeforeSold || product.stockByVariant || {};
  const stockByVariant = sold
    ? Object.fromEntries(Object.keys(product.stockByVariant || {}).map((key) => [key, 0]))
    : previousVariants;
  const changes = {
    soldOut: sold,
    stock: sold ? 0 : Object.values(stockByVariant).reduce((sum, value) => sum + value, 0),
    stockByVariant,
    updatedAt: serverTimestamp()
  };
  if (sold) {
    changes.stockBeforeSold = Number(product.stock) || 0;
    changes.stockByVariantBeforeSold = product.stockByVariant || {};
  }
  await setDoc(doc(db, "products", documentId), changes, { merge: true });
  await loadProducts();
}

async function checkInstagramConnection() {
  try {
    const response = await fetch("/api/instagram-sync?status=1", { headers: { Accept: "application/json" } });
    const result = await response.json();
    const connected = response.ok && result.connected;
    const canConnect = response.ok && result.canConnect;
    ui.instagramDot.classList.toggle("is-connected", connected);
    ui.instagramTitle.textContent = connected ? "Instagram conectado" : "Falta conectar Meta";
    ui.instagramCopy.textContent = connected ? `Cuenta preparada: ${result.username || "Arvel Customs"}.` : "Agregaremos el token y el ID de Instagram en Vercel en el próximo paso.";
    ui.instagramSync.disabled = !connected;
    if (!connected && canConnect) {
      ui.instagramCopy.textContent = "La aplicación de Meta está lista. Autorizá la cuenta para continuar.";
      ui.instagramSync.textContent = "Conectar Instagram";
      ui.instagramSync.disabled = false;
      ui.instagramSync.dataset.action = "connect";
    } else {
      ui.instagramSync.textContent = connected ? "Sincronizar ahora" : "Conectar Instagram";
      ui.instagramSync.dataset.action = connected ? "sync" : "connect";
    }
  } catch {
    ui.instagramTitle.textContent = "Falta conectar Meta";
    ui.instagramCopy.textContent = "El panel está preparado; todavía falta activar el servicio en Vercel.";
    ui.instagramSync.disabled = true;
  }
}

async function loadSettings() {
  const snapshot = await getDoc(doc(db, "settings", "catalogAutomation"));
  if (!snapshot.exists()) return;
  const settings = snapshot.data();
  Object.entries(settings).forEach(([name, value]) => {
    const field = ui.settingsForm.elements.namedItem(name);
    if (!field) return;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = Array.isArray(value) ? value.join(", ") : value;
  });
  ui.markerPreview.textContent = settings.productMarker || "#productoarvel";
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
    const currentId = activeDocumentId || ui.form.elements.documentId.value;
    const documentId = currentId || `${product.slug}-${crypto.randomUUID().slice(0, 8)}`;
    const currentProduct = products.find((item) => item.documentId === currentId);
    product.id = Number(currentProduct?.id) || Date.now();
    renderImages();
    const uploadedImages = await uploadSelectedImages(documentId);
    if (uploadedImages.length) {
      existingImages = [...existingImages, ...uploadedImages];
      ui.imageUrls.value = existingImages.join("\n");
      selectedImages = [];
      ui.imageFiles.value = "";
      renderImages();
    }
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

ui.tabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-admin-view]");
  if (button) openView(button.dataset.adminView);
});
document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-open-view]");
  if (viewButton) openView(viewButton.dataset.openView);
  if (event.target.closest("[data-open-products]")) {
    openView("products");
    resetForm();
  }
  const editButton = event.target.closest("[data-edit-product]");
  if (editButton) {
    const product = products.find((item) => item.documentId === editButton.dataset.editProduct);
    if (product) { openView("products"); fillForm(product); }
  }
});
ui.inventory.addEventListener("click", (event) => {
  const button = event.target.closest("[data-stock-action]");
  if (!button) return;
  button.disabled = true;
  changeStockState(button.dataset.productId, button.dataset.stockAction).catch((error) => {
    button.disabled = false;
    setState(error.message || "No pudimos actualizar el stock.", "error");
  });
});
ui.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(ui.settingsForm);
  const settings = {
    productMarker: String(data.get("productMarker") || "#productoarvel").trim(),
    soldWords: String(data.get("soldWords") || "").split(",").map((word) => word.trim().toLowerCase()).filter(Boolean),
    categories: String(data.get("categories") || "").split(",").map((category) => category.trim()).filter(Boolean),
    autoPublish: data.get("autoPublish") === "on",
    updatedAt: serverTimestamp()
  };
  ui.settingsState.textContent = "Guardando…";
  try {
    await setDoc(doc(db, "settings", "catalogAutomation"), settings, { merge: true });
    ui.markerPreview.textContent = settings.productMarker;
    ui.settingsState.textContent = "Configuración guardada";
  } catch (error) {
    ui.settingsState.textContent = error.message || "No pudimos guardar la configuración.";
  }
});
ui.instagramSync.addEventListener("click", async () => {
  if (ui.instagramSync.dataset.action === "connect") {
    window.location.assign("/api/instagram-connect");
    return;
  }
  ui.instagramSync.disabled = true;
  ui.instagramSyncState.textContent = "Sincronizando…";
  try {
    const token = await auth.currentUser.getIdToken();
    const response = await fetch("/api/instagram-sync", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No pudimos sincronizar.");
    ui.instagramSyncState.textContent = result.detected != null
      ? `${result.detected} publicaciones leídas correctamente`
      : `${result.imported || 0} importados · ${result.updated || 0} actualizados`;
    await loadProducts();
  } catch (error) {
    ui.instagramSyncState.textContent = error.message;
  } finally {
    ui.instagramSync.disabled = false;
  }
});

ui.addVariant.addEventListener("click", () => addVariantRow());
ui.newProduct.addEventListener("click", resetForm);
ui.search.addEventListener("input", renderList);
ui.list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-product-id]");
  const product = products.find((item) => item.documentId === button?.dataset.productId);
  if (product) fillForm(product);
});
ui.previewImages.addEventListener("click", renderImages);
ui.imageFiles.addEventListener("change", () => {
  const files = [...ui.imageFiles.files];
  const error = validateSelectedImages(files);
  if (error) {
    ui.error.textContent = error;
    ui.imageFiles.value = "";
    return;
  }
  ui.error.textContent = "";
  selectedImages = [...selectedImages, ...files];
  ui.imageFiles.value = "";
  renderImages();
});
ui.preview.addEventListener("click", (event) => {
  const button = event.target.closest("[data-saved-image-index], [data-pending-image-index]");
  if (!button) return;
  if (button.dataset.savedImageIndex !== undefined) {
    existingImages.splice(Number(button.dataset.savedImageIndex), 1);
    ui.imageUrls.value = existingImages.join("\n");
  } else {
    selectedImages.splice(Number(button.dataset.pendingImageIndex), 1);
  }
  renderImages();
});
ui.form.addEventListener("submit", (event) => {
  event.preventDefault();
  saveProduct();
});
ui.saveDraft.addEventListener("click", () => saveProduct("draft"));
ui.duplicate.addEventListener("click", () => {
  activeDocumentId = "";
  ui.form.elements.documentId.value = "";
  ui.form.elements.name.value = `${ui.form.elements.name.value} copia`;
  ui.form.elements.sku.value = `${ui.form.elements.sku.value}-COPIA`;
  ui.form.elements.status.value = "draft";
  ui.duplicate.hidden = true;
  ui.saveDraft.hidden = false;
  ui.form.querySelector('[type="submit"]').textContent = "Guardar copia";
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
  await Promise.all([loadProducts(), loadSettings(), checkInstagramConnection()]);
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
