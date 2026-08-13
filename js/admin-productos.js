import {
  getApps,
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  listAll,
  ref,
  uploadBytesResumable
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";
import { firebaseConfig, firebaseConfigured } from "./firebase-config.js?v=20260811-auth-config";

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
  priceInput: document.querySelector('input[name="price"]'),
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
  removeProduct: document.querySelector("#remove-current"),
  editorMode: document.querySelector("#editor-mode"),
  editorTitle: document.querySelector("#editor-title"),
  tabs: document.querySelector(".admin-tabs"),
  panels: [...document.querySelectorAll("[data-admin-panel]")],
  inventory: document.querySelector("#inventory-products"),
  instagramProducts: document.querySelector("#instagram-products"),
  instagramCount: document.querySelector("#instagram-product-count"),
  instagramFeed: document.querySelector("#instagram-feed-preview"),
  instagramFeedCount: document.querySelector("#instagram-feed-count"),
  duplicateProducts: document.querySelector("#duplicate-products"),
  instagramSync: document.querySelector("#instagram-sync"),
  instagramSyncState: document.querySelector("#instagram-sync-state"),
  instagramDot: document.querySelector("#instagram-dot"),
  instagramTitle: document.querySelector("#instagram-connection-title"),
  instagramCopy: document.querySelector("#instagram-connection-copy"),
  mercadoPagoState: document.querySelector("#mercadopago-connection-state"),
  mercadoPagoCopy: document.querySelector("#mercadopago-connection-copy"),
  settingsForm: document.querySelector("#automation-settings-form"),
  settingsState: document.querySelector("#settings-state"),
  markerPreview: document.querySelector("#instagram-marker-preview"),
  alerts: document.querySelector("#admin-alerts")
};

let products = [];
let existingImages = [];
let existingImageRefs = [];
let selectedImages = [];
let previewObjectUrls = [];
let removedStoragePaths = [];
let activeDocumentId = "";
let instagramFeedPosts = [];
let instagramSyncStatus = null;
let accessWatchdog = null;

function showAccessError(message) {
  if (accessWatchdog) clearTimeout(accessWatchdog);
  if (ui.loading) ui.loading.hidden = true;
  if (ui.content) ui.content.hidden = true;
  if (ui.denied) {
    ui.denied.hidden = false;
    const title = ui.denied.querySelector("h1");
    const copy = ui.denied.querySelector("p");
    if (title) title.textContent = "No pudimos verificar el acceso";
    if (copy) copy.textContent = message;
  }
}

function withTimeout(task, milliseconds, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([task, timeout]).finally(() => window.clearTimeout(timeoutId));
}

// El acceso se valida antes de conectar los controles del panel. De esta forma
// un control opcional que no exista en una versión del HTML no puede dejar al
// administrador atrapado en la pantalla de carga.
function startAccessValidation() {
  if (!firebaseConfigured) {
    if (ui.loading) ui.loading.hidden = true;
    if (ui.denied) {
      ui.denied.hidden = false;
      const copy = ui.denied.querySelector("p");
      if (copy) copy.textContent = "Falta completar la configuración pública de Firebase.";
    }
    return;
  }

  accessWatchdog = window.setTimeout(() => {
    showAccessError("Firebase no respondió al verificar tu sesión. Actualizá la página e intentá nuevamente.");
  }, 30000);

  onAuthStateChanged(auth, (user) => {
    if (accessWatchdog) clearTimeout(accessWatchdog);
    initialize(user).catch((error) => {
      console.error("No se pudo inicializar el panel administrador:", error);
      showAccessError(error.message || "No pudimos abrir el panel. Actualizá la página e intentá nuevamente.");
    });
  });
}

startAccessValidation();

async function checkMercadoPagoConnection() {
  if (!ui.mercadoPagoState || !ui.mercadoPagoCopy) return;
  try {
    const response = await fetch(
      "https://web-arvel-y2-k.vercel.app/api/mercadopago-health",
      { cache: "no-store" }
    );
    const result = await response.json();
    if (!response.ok || !result.connected) throw new Error(result.reason || "not_connected");
    ui.mercadoPagoState.textContent = result.mode === "production"
      ? "Producción conectada"
      : "Prueba conectada";
    ui.mercadoPagoState.classList.remove("admin-pill--pending");
    ui.mercadoPagoCopy.textContent = result.mode === "production"
      ? "El checkout puede crear pagos reales. Falta finalizar el descuento automático de stock desde el webhook."
      : "El checkout puede crear pagos de prueba. Cambiá a credenciales productivas antes de cobrar ventas reales.";
  } catch (_error) {
    ui.mercadoPagoState.textContent = "Conexión pendiente";
    ui.mercadoPagoState.classList.add("admin-pill--pending");
    ui.mercadoPagoCopy.textContent = "Revisá MP_ACCESS_TOKEN en Vercel y volvé a desplegar el proyecto.";
  }
}

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

function instagramPostAnalysis(post) {
  const caption = String(post.caption || "").trim();
  const normalized = caption.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const sold = /\b(vendid[oa]s?|agotad[oa]s?|sin stock|no disponible)\b/.test(normalized);
  const announcement = /\b(sorteo|aviso|anuncio|horarios?|envios?|aclaracion|proximo drop|giveaway)\b/.test(normalized);
  const productSignals = /\$\s*[\d.]+|\b(precio|talle|medidas?|material|stock|unico|unica|disponible|remera|top|pollera|pantalon|jean|vestido|campera|buzo|cartera|bolso|accesorio)\b/.test(normalized);
  const marker = String(ui.markerPreview?.textContent || "").trim().toLowerCase();
  const marked = Boolean(marker && normalized.includes(marker));
  const isProduct = !announcement && (marked || productSignals);
  const priceMatch = caption.match(/(?:\$\s*(\d+(?:[.,]\d+)?)\s*(k)?\b)|(?:\b(\d+(?:[.,]\d+)?)\s*k\b)/i);
  let price = 0;
  if (priceMatch) {
    const rawPrice = priceMatch[1] || priceMatch[3];
    const hasThousandsSuffix = Boolean(priceMatch[2] || priceMatch[3]);
    if (hasThousandsSuffix) {
      price = Math.round(Number(rawPrice.replace(",", ".")) * 1000);
    } else {
      price = Number(rawPrice.replace(/\./g, "").replace(",", "."));
    }
  }
  const firstLine = caption.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "Producto de Instagram";
  const name = firstLine.replace(/[#@][\w.]+/g, "").replace(/[✨💗🖤🎀⭐]+/gu, "").trim().slice(0, 80) || "Producto de Instagram";
  const categories = [
    ["Tops", /\b(top|remera|corset|musculosa)\b/],
    ["Polleras", /\b(pollera|falda)\b/],
    ["Pantalones", /\b(pantalon|jean|denim)\b/],
    ["Vestidos", /\bvestido\b/],
    ["Abrigos", /\b(campera|buzo|abrigo)\b/],
    ["Accesorios", /\b(cartera|bolso|accesorio|collar|aro|orejera)\b/]
  ];
  const category = categories.find(([, pattern]) => pattern.test(normalized))?.[0] || "Sin categorizar";
  const duplicate = products.find((item) => item.instagramMediaId === post.id || item.instagramPermalink === post.permalink);
  return { caption, sold, announcement, isProduct, price, name, category, duplicate };
}

function renderInstagramFeed() {
  if (!ui.instagramFeed) return;
  ui.instagramFeedCount.textContent = String(instagramFeedPosts.length);
  ui.instagramFeed.innerHTML = instagramFeedPosts.length ? instagramFeedPosts.map((post) => {
    const analysis = instagramPostAnalysis(post);
    const state = analysis.duplicate ? "Ya vinculado" : analysis.sold ? "Vendido" : analysis.isProduct ? "Posible producto" : "No parece producto";
    return `<article class="admin-instagram-post ${analysis.isProduct ? "is-product" : "is-skipped"}">
      <img src="${escapeHtml(post.image || placeholder)}" alt="">
      <div class="admin-instagram-post__body">
        <div class="admin-instagram-post__badges"><span>${escapeHtml(state)}</span><span>${escapeHtml(analysis.category)}</span></div>
        <strong>${escapeHtml(analysis.name)}</strong>
        <p>${escapeHtml(analysis.caption.slice(0, 260))}${analysis.caption.length > 260 ? "…" : ""}</p>
        <small>${post.timestamp ? new Date(post.timestamp).toLocaleDateString("es-AR") : "Sin fecha"}${analysis.price ? ` · $ ${analysis.price.toLocaleString("es-AR")}` : " · precio pendiente"}</small>
        <div class="admin-management-actions">
          ${post.permalink ? `<a href="${escapeHtml(post.permalink)}" target="_blank" rel="noopener">Ver publicación</a>` : ""}
          ${analysis.isProduct && !analysis.duplicate ? `<button type="button" data-import-instagram="${escapeHtml(post.id)}" data-import-status="draft">Crear borrador</button>` : ""}
          ${analysis.isProduct && !analysis.duplicate && !analysis.sold ? `<button type="button" data-import-instagram="${escapeHtml(post.id)}" data-import-status="published">Publicar en tienda</button>` : ""}
          ${analysis.duplicate ? `<button type="button" data-edit-product="${escapeHtml(analysis.duplicate.documentId)}">Editar vinculado</button>` : ""}
        </div>
      </div>
    </article>`;
  }).join("") : "<p>No se encontraron publicaciones.</p>";
}

async function importInstagramProduct(mediaId, requestedStatus = "draft") {
  const post = instagramFeedPosts.find((item) => item.id === mediaId);
  if (!post) return;
  const analysis = instagramPostAnalysis(post);
  if (analysis.duplicate) return;
  const status = requestedStatus === "published" ? "published" : "draft";
  if (status === "published" && analysis.sold) throw new Error("Una publicación marcada como vendida no puede publicarse con stock.");
  if (status === "published" && !analysis.price) throw new Error("No detectamos el precio. Creá un borrador y completalo antes de publicarlo.");
  if (status === "published" && !post.image) throw new Error("La publicación no tiene una imagen disponible para la tienda.");
  const documentId = `instagram-${slugify(analysis.name) || "producto"}-${String(post.id).slice(-8)}`;
  const sku = `IG-${String(post.id).slice(-10)}`.toUpperCase();
  const stock = analysis.sold ? 0 : 1;
  let importedImage = null;
  try {
    importedImage = await copyInstagramImageToStorage(post.image, documentId, post.id);
  } catch (error) {
    console.warn("No se pudo copiar la imagen de Instagram a Firebase Storage.", error);
    if (status === "published") {
      throw new Error("No pudimos guardar la foto en Storage. RevisÃ¡ Firebase Storage e intentÃ¡ publicar nuevamente.");
    }
  }

  try {
    await setDoc(doc(db, "products", documentId), {
    id: Date.now(), name: analysis.name, slug: slugify(analysis.name), sku,
    category: analysis.category, collection: "Instagram", price: analysis.price,
    oldPrice: null, condition: "Seleccionada", status,
    shortDescription: analysis.caption.slice(0, 180) || "Producto importado desde Instagram.",
    description: analysis.caption, material: "A completar", care: "A completar",
    measurements: { bust: "A completar", waist: "A completar", hip: "A completar", length: "A completar", axillaToAxilla: "", sleeveLength: "" },
    sizes: ["Único"], colors: ["Según publicación"],
    stockByVariant: { "Único|Según publicación": stock },
    stock, soldOut: analysis.sold, archived: false, discount: 0, featured: status === "published", uniquePiece: true,
    tags: ["instagram", analysis.sold ? "vendido" : "revisar"], source: "instagram",
    instagramMediaId: post.id, instagramPermalink: post.permalink, instagramTimestamp: post.timestamp || "",
    // Nunca persistimos una URL temporal de Instagram. Al importar se copia al
    // bucket products/<id>/ para que siga existiendo al recargar o días después.
    images: importedImage ? [importedImage.url] : [],
    imageRefs: importedImage ? [importedImage] : [],
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    }, { merge: false });
  } catch (error) {
    if (importedImage?.path) {
      await deleteObject(ref(storage, importedImage.path)).catch(() => {});
    }
    throw error;
  }
  await loadProducts();
  renderInstagramFeed();
  ui.instagramSyncState.textContent = status === "published"
    ? `Producto publicado en la tienda: ${analysis.name}`
    : `Borrador creado: ${analysis.name}`;
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
    <input class="input" name="variantStock" type="number" min="0" step="1" placeholder="Cantidad" aria-label="Cantidad" value="${Number(variant.stock ?? 1)}">
    <input class="input" name="variantPrice" type="number" min="0" step="1" placeholder="Precio" aria-label="Precio" value="${Number(variant.price ?? 0)}">
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
      stock: Math.max(0, Number(row.querySelector('[name="variantStock"]').value) || 0),
      price: Math.max(0, Number(row.querySelector('[name="variantPrice"]').value) || 0)
    }))
    .filter((variant) => variant.size && variant.color);
}

function updatePriceFieldState() {
  const variants = readVariants();
  const hasVariantPrices = variants.some((v) => v.price > 0);

  if (ui.priceInput) {
    ui.priceInput.disabled = hasVariantPrices;
    if (hasVariantPrices) {
      ui.priceInput.title = "Bloqueado: Los precios se manejan por variante";
      ui.priceInput.style.opacity = "0.6";
    } else {
      ui.priceInput.title = "";
      ui.priceInput.style.opacity = "1";
    }
  }
}

function isTemporaryImageUrl(url) {
  return /^(blob:|data:)/i.test(String(url || "").trim());
}

function normalizeImageReference(image) {
  if (typeof image === "string") {
    const url = image.trim();
    return { url: isTemporaryImageUrl(url) ? "" : url, path: "", name: "" };
  }
  if (!image || typeof image !== "object") return { url: "", path: "", name: "" };
  const url = String(image.url || image.downloadURL || "").trim();
  return {
    url: isTemporaryImageUrl(url) ? "" : url,
    path: String(image.path || "").trim(),
    name: String(image.name || "").trim()
  };
}

function setExistingImageReferences(images) {
  existingImageRefs = (Array.isArray(images) ? images : [])
    .map(normalizeImageReference)
    // Los productos antiguos pueden tener únicamente el path de Storage.
    // No se descarta al editar: sigue siendo una referencia persistente.
    .filter((image) => image.url || image.path);
  existingImages = existingImageRefs.map((image) => image.url);
  ui.imageUrls.value = existingImages.join("\n");
}

function syncImageReferencesFromTextarea() {
  const enteredUrls = ui.imageUrls.value
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean);
  const ignoredTemporaryUrls = enteredUrls.filter(isTemporaryImageUrl);
  const urls = enteredUrls.filter((url) => !isTemporaryImageUrl(url));
  if (ignoredTemporaryUrls.length) {
    ui.error.textContent = "Las URLs temporales no se pueden guardar. Para una foto nueva usá el selector de archivos.";
    ui.imageUrls.value = urls.join("\n");
  }
  const refsByUrl = new Map(existingImageRefs.map((image) => [image.url, image]));
  existingImageRefs = urls.map((url) => refsByUrl.get(url) || { url, path: "", name: "" });
  existingImages = urls;
}

function productImageUrls(product) {
  const refs = Array.isArray(product?.imageRefs) ? product.imageRefs : [];
  const refUrls = refs.map(normalizeImageReference).map((image) => image.url).filter(Boolean);
  return refUrls.length ? refUrls : (Array.isArray(product?.images) ? product.images.filter(Boolean) : []);
}

function renderImages() {
  syncImageReferencesFromTextarea();
  previewObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  previewObjectUrls = selectedImages.map((file) => URL.createObjectURL(file));
  const savedMarkup = existingImages.map((url, index) => `
    <figure draggable="true" data-saved-image-index="${index}" class="image-preview-item">
      <img src="${escapeHtml(url)}" alt="" onerror="this.onerror=null;this.src='assets/logo/IsoNegro.png';this.classList.add('is-image-fallback');">
      <span>Guardada</span>
      <button type="button" data-saved-image-index="${index}" aria-label="Quitar foto">×</button>
    </figure>
  `).join("");
  const pendingMarkup = selectedImages.map((file, index) => `
    <figure draggable="true" data-pending-image-index="${index}" class="image-preview-item">
      <img src="${escapeHtml(previewObjectUrls[index])}" alt="">
      <span>Pendiente</span>
      <button type="button" data-pending-image-index="${index}" aria-label="Quitar foto">×</button>
    </figure>
  `).join("");
  ui.preview.innerHTML = savedMarkup + pendingMarkup;
  setupDragAndDrop();
}

function setupDragAndDrop() {
  const items = ui.preview.querySelectorAll(".image-preview-item");
  let draggedItem = null;

  items.forEach((item) => {
    item.addEventListener("dragstart", (e) => {
      draggedItem = item;
      item.style.opacity = "0.5";
      e.dataTransfer.effectAllowed = "move";
    });

    item.addEventListener("dragend", () => {
      item.style.opacity = "1";
      draggedItem = null;
    });

    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (item !== draggedItem && draggedItem) {
        item.parentNode.insertBefore(draggedItem, item);
      }
    });
  });

  ui.preview.addEventListener("drop", (e) => {
    e.preventDefault();
    if (draggedItem) {
      syncImagesAfterDrag();
    }
  });
}

function syncImagesAfterDrag() {
  const figures = ui.preview.querySelectorAll("figure");
  const newSavedImageRefs = [];
  const newSelectedImages = [];

  figures.forEach((fig) => {
    const savedIndex = fig.getAttribute("data-saved-image-index");
    const pendingIndex = fig.getAttribute("data-pending-image-index");

    if (savedIndex !== null) {
      newSavedImageRefs.push(existingImageRefs[parseInt(savedIndex)]);
    } else if (pendingIndex !== null) {
      newSelectedImages.push(selectedImages[parseInt(pendingIndex)]);
    }
  });

  existingImageRefs = newSavedImageRefs;
  existingImages = existingImageRefs.map((image) => image.url);
  selectedImages = newSelectedImages;
  ui.imageUrls.value = existingImages.join("\n");
  previewObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  previewObjectUrls = selectedImages.map((file) => URL.createObjectURL(file));
}

function validateSelectedImages(files) {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  for (const file of files) {
    if (!allowed.has(file.type)) return `${file.name}: usá una imagen JPG, PNG o WEBP.`;
    if (file.size > 8 * 1024 * 1024) return `${file.name}: supera el máximo de 8 MB.`;
  }
  return "";
}

function extensionForImage(contentType, sourceUrl = "") {
  const byType = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };
  if (byType[contentType]) return byType[contentType];
  const fromUrl = String(sourceUrl).split("?")[0].split(".").pop()?.toLowerCase();
  return ["jpg", "jpeg", "png", "webp"].includes(fromUrl) ? fromUrl : "jpg";
}

async function copyInstagramImageToStorage(sourceUrl, documentId, mediaId) {
  if (!storage || !sourceUrl) return null;
  const response = await fetch(sourceUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`La imagen de Instagram devolviÃ³ HTTP ${response.status}.`);
  const blob = await response.blob();
  const contentType = String(blob.type || response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (!contentType.startsWith("image/")) throw new Error("La publicaciÃ³n no contiene una imagen compatible.");
  if (!blob.size || blob.size > 8 * 1024 * 1024) throw new Error("La imagen supera el mÃ¡ximo de 8 MB para Storage.");
  const fileName = `instagram-${slugify(mediaId) || crypto.randomUUID()}.${extensionForImage(contentType, sourceUrl)}`;
  const storageReference = ref(storage, `products/${documentId}/${fileName}`);
  const task = uploadBytesResumable(storageReference, blob, { contentType });
  await new Promise((resolve, reject) => task.on("state_changed", undefined, reject, resolve));
  return {
    path: storageReference.fullPath,
    url: await getDownloadURL(storageReference),
    name: fileName
  };
}

function uploadFile(documentId, file, index, total) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const fileName = `image-${String(index + 1).padStart(2, "0")}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
  const storageReference = ref(storage, `products/${documentId}/${fileName}`);
  const task = uploadBytesResumable(storageReference, file, { contentType: file.type });
  return new Promise((resolve, reject) => {
    task.on("state_changed", (snapshot) => {
      const current = snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0;
      const percent = Math.round(((index + current) / total) * 100);
      ui.uploadBar.value = percent;
      ui.uploadPercent.textContent = `${percent}%`;
      ui.uploadLabel.textContent = `Subiendo ${index + 1} de ${total}: ${file.name}`;
    }, reject, async () => resolve({
      path: task.snapshot.ref.fullPath,
      url: await getDownloadURL(task.snapshot.ref),
      name: file.name
    }));
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
  existingImageRefs = [];
  selectedImages = [];
  removedStoragePaths = [];
  ui.imageFiles.value = "";
  ui.uploadProgress.hidden = true;
  ui.imageUrls.value = "";
  renderImages();
  ui.error.textContent = "";
  ui.duplicate.hidden = true;
  ui.removeProduct.hidden = true;
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
    axillaToAxilla: product.measurements?.axillaToAxilla,
    sleeveLength: product.measurements?.sleeveLength,
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
  updatePriceFieldState();
  setExistingImageReferences(product.imageRefs?.length ? product.imageRefs : (product.images || []));
  selectedImages = [];
  ui.imageFiles.value = "";
  renderImages();
  ui.duplicate.hidden = false;
  ui.removeProduct.hidden = false;
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
      <img src="${escapeHtml(productImageUrls(product)[0] || placeholder)}" alt="">
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
  const priceByVariant = Object.fromEntries(
    variants.filter((variant) => variant.price > 0).map((variant) => [`${variant.size}|${variant.color}`, variant.price])
  );
  const stock = variants.reduce((sum, variant) => sum + variant.stock, 0);

  // Si no hay precio general pero hay precios en variantes, usar el precio mínimo
  let finalPrice = Math.max(0, Number(data.get("price")) || 0);
  if (finalPrice === 0 && Object.keys(priceByVariant).length > 0) {
    finalPrice = Math.min(...Object.values(priceByVariant));
  }

  return {
    name,
    slug: slugify(name),
    sku,
    category: String(data.get("category") || "").trim(),
    collection: String(data.get("collection") || "").trim(),
    price: finalPrice,
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
      length: String(data.get("length") || "No aplica").trim(),
      axillaToAxilla: String(data.get("axillaToAxilla") || "").trim(),
      sleeveLength: String(data.get("sleeveLength") || "").trim()
    },
    sizes: [...new Set(variants.map((item) => item.size))],
    colors: [...new Set(variants.map((item) => item.color))],
    stockByVariant,
    priceByVariant: Object.keys(priceByVariant).length ? priceByVariant : {},
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
  const hasVariantPrices = Object.keys(product.priceByVariant || {}).length > 0;
  if (!hasVariantPrices && product.price <= 0) return "Ingresá un precio válido.";
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
    <img src="${escapeHtml(productImageUrls(product)[0] || placeholder)}" alt="">
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
    <tr><td data-label="Producto"><strong>${escapeHtml(product.name)}</strong></td><td data-label="SKU">${escapeHtml(product.sku)}</td><td data-label="Stock">${Number(product.stock) || 0}</td><td data-label="Estado">${product.soldOut ? "Vendido" : escapeHtml(product.status || "draft")}</td>
    <td data-label="Acciones"><button type="button" data-stock-action="${product.soldOut ? "restore" : "sold"}" data-product-id="${escapeHtml(product.documentId)}">${product.soldOut ? "Reactivar" : "Marcar vendido"}</button> <button type="button" data-edit-product="${escapeHtml(product.documentId)}">Editar</button></td></tr>
  `).join("") : '<tr><td colspan="5">Todavía no hay productos.</td></tr>';
}

async function openView(name) {
  ui.panels.forEach((panel) => { panel.hidden = panel.dataset.adminPanel !== name; });
  ui.tabs.querySelectorAll("[data-admin-view]").forEach((button) => {
    const isActive = button.dataset.adminView === name;
    button.classList.toggle("is-active", isActive);
    if (isActive && window.matchMedia("(max-width: 64rem)").matches) {
      requestAnimationFrame(() => button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }));
    }
  });
  window.scrollTo({ top: 0, behavior: "smooth" });

  // Cargar métricas cuando se abre esa pestaña
  if (name === "metrics") {
    try {
      const { initMetrics } = await import("./admin-metrics.js");
      await initMetrics();
    } catch (error) {
      console.error("Error cargando métricas:", error);
      document.getElementById("total-events").textContent = "Error";
    }
  }
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
  const [feedResult, statusResult] = await Promise.allSettled([
    fetchInstagramJson("data/instagram-feed.json"),
    fetchInstagramJson("data/instagram-sync-status.json")
  ]);
  const feed = feedResult.status === "fulfilled" ? feedResult.value : null;
  const status = statusResult.status === "fulfilled" ? statusResult.value : {
    state: feed?.connected ? "warning" : "error",
    error: { message: feed?.connected ? "No se pudo leer el estado de la sincronización." : "Todavía no existe una sincronización válida." }
  };
  renderInstagramConnection(feed, status);
}

async function fetchInstagramJson(path) {
  const response = await fetch(`${path}?t=${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`No se pudo leer ${path} (HTTP ${response.status}).`);
  return response.json();
}

function formatInstagramDate(value) {
  if (!value) return "sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "sin fecha" : date.toLocaleString("es-AR");
}

function renderInstagramConnection(feed, status) {
  const hasCache = Boolean(feed?.connected && Array.isArray(feed.posts));
  const state = status?.state || (hasCache ? "ok" : "not_configured");
  const reconnectRequired = state === "reconnect_required" || status?.error?.reconnectRequired;
  const temporaryError = state === "error";
  const warning = state === "warning";

  ui.instagramDot.classList.toggle("is-connected", hasCache && !reconnectRequired && !temporaryError);
  ui.instagramDot.classList.toggle("is-warning", warning || (hasCache && temporaryError));
  ui.instagramDot.classList.toggle("is-error", reconnectRequired || (!hasCache && temporaryError));

  if (reconnectRequired) ui.instagramTitle.textContent = "Instagram necesita reconexión";
  else if (temporaryError && hasCache) ui.instagramTitle.textContent = "Instagram temporalmente sin respuesta";
  else if (warning) ui.instagramTitle.textContent = "Instagram conectado · revisar token";
  else if (hasCache) ui.instagramTitle.textContent = "Instagram conectado con GitHub";
  else ui.instagramTitle.textContent = "Falta configurar GitHub Actions";

  const lastSuccess = status?.lastSuccessAt || feed?.updatedAt;
  const account = feed?.username ? ` · @${feed.username}` : "";
  if (reconnectRequired) {
    ui.instagramCopy.textContent = `${status?.error?.message || "La autorización venció o fue revocada."} Último contenido válido: ${formatInstagramDate(lastSuccess)}.`;
  } else if (temporaryError) {
    ui.instagramCopy.textContent = `${status?.error?.message || "Meta no respondió correctamente."} Se conserva la última sincronización de ${formatInstagramDate(lastSuccess)}${account}.`;
  } else if (warning) {
    ui.instagramCopy.textContent = `${status?.token?.warning || "La conexión requiere atención."} Última actualización: ${formatInstagramDate(lastSuccess)}${account}.`;
  } else if (hasCache) {
    ui.instagramCopy.textContent = `Última actualización: ${formatInstagramDate(lastSuccess)}${account}.`;
  } else {
    ui.instagramCopy.textContent = "Configurá los secretos de Instagram en GitHub y ejecutá el workflow Sincronizar Instagram.";
  }

  ui.instagramSync.textContent = hasCache ? "Recargar estado" : "Reintentar lectura";
  ui.instagramSync.disabled = false;
  instagramFeedPosts = Array.isArray(feed?.posts) ? feed.posts : [];
  instagramSyncStatus = status || null;
  renderInstagramFeed();
}

function isTemporaryInstagramImage(url) {
  return /(?:cdninstagram\.com|fbcdn\.net|graph\.facebook\.com|graph\.instagram\.com)/i.test(String(url || ""));
}

async function repairImportedInstagramImages() {
  const postsById = new Map(instagramFeedPosts.map((post) => [String(post.id), post]));
  const repairs = [];
  for (const product of products) {
    if (!product.instagramMediaId) continue;
    const post = postsById.get(String(product.instagramMediaId));
    const cachedImage = String(post?.image || "");
    if (!cachedImage || isTemporaryInstagramImage(cachedImage)) continue;
    const currentImages = productImageUrls(product);
    if (currentImages[0] === cachedImage) continue;
    if (currentImages.length && !isTemporaryInstagramImage(currentImages[0])) continue;
    const images = [cachedImage, ...currentImages.slice(1).filter((url) => url !== cachedImage && !isTemporaryInstagramImage(url))];
    repairs.push(setDoc(doc(db, "products", product.documentId), {
      images,
      imageRefs: images.map((url) => ({ url, path: "", name: "" })),
      updatedAt: serverTimestamp()
    }, { merge: true }));
  }
  if (!repairs.length) return 0;
  await Promise.all(repairs);
  await loadProducts();
  return repairs.length;
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
  let uploadedForThisSave = [];
  let productPersisted = false;
  try {
    const currentId = activeDocumentId || ui.form.elements.documentId.value;
    const documentId = currentId || `${product.slug}-${crypto.randomUUID().slice(0, 8)}`;
    const currentProduct = products.find((item) => item.documentId === currentId);
    product.id = Number(currentProduct?.id) || Date.now();
    renderImages();
    const uploadedImages = await uploadSelectedImages(documentId);
    uploadedForThisSave = uploadedImages;
    if (uploadedImages.length) {
      existingImageRefs = [...existingImageRefs, ...uploadedImages];
      existingImages = existingImageRefs.map((image) => image.url);
      ui.imageUrls.value = existingImages.join("\n");
      selectedImages = [];
      ui.imageFiles.value = "";
      renderImages();
    }
    product.images = [...existingImages];
    product.imageRefs = existingImageRefs.map((image) => ({
      url: image.url,
      path: image.path || "",
      name: image.name || ""
    }));
    product.updatedAt = serverTimestamp();
    if (!currentId) product.createdAt = serverTimestamp();
    await setDoc(doc(db, "products", documentId), product, { merge: true });
    productPersisted = true;
    const ownPrefix = `products/${documentId}/`;
    const pendingDeletes = removedStoragePaths
      .filter((path) => path.startsWith(ownPrefix))
      .map((path) => deleteObject(ref(storage, path)));
    if (pendingDeletes.length) {
      const results = await Promise.allSettled(pendingDeletes);
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length) console.warn("Algunas fotos antiguas no pudieron eliminarse de Storage.", failures);
    }
    removedStoragePaths = [];
    setState(product.status === "published" ? "Producto publicado" : "Producto guardado", "success");
    await loadProducts();
    const saved = products.find((item) => item.documentId === documentId);
    if (saved) fillForm(saved);
  } catch (error) {
    if (!productPersisted && uploadedForThisSave.length) {
      const cleanup = await Promise.allSettled(
        uploadedForThisSave.map((image) => deleteObject(ref(storage, image.path)))
      );
      if (cleanup.some((result) => result.status === "rejected")) {
        console.warn("No pudimos limpiar algunas fotos que no llegaron a guardarse en el producto.");
      }
    }
    ui.error.textContent = error.message || "No pudimos guardar el producto.";
    setState("Error al guardar", "error");
  } finally {
    setBusy(false);
  }
}

async function removeCurrentProduct() {
  const documentId = activeDocumentId || ui.form.elements.documentId.value;
  if (!documentId) return;
  const product = products.find((item) => item.documentId === documentId);
  const confirmed = window.confirm(`¿Eliminar definitivamente ${product?.name || "este producto"} y sus fotografías? Esta acción no se puede deshacer.`);
  if (!confirmed) return;

  ui.error.textContent = "";
  setBusy(true);
  try {
    // Las nuevas fotos se guardan siempre en esta carpeta. Se elimina la carpeta
    // antes del documento para no dejar un producto sin imágenes si Storage falla.
    const folder = ref(storage, `products/${documentId}`);
    const listing = await listAll(folder);
    const removals = await Promise.allSettled(listing.items.map((item) => deleteObject(item)));
    const failures = removals.filter((result) => result.status === "rejected");
    if (failures.length) throw new Error("No pudimos eliminar todas las fotografías del producto. Intentá nuevamente.");

    await deleteDoc(doc(db, "products", documentId));
    setState("Producto eliminado", "success");
    resetForm();
    await loadProducts();
  } catch (error) {
    console.error("removeCurrentProduct", error);
    ui.error.textContent = error.message || "No pudimos eliminar el producto.";
    setState("Error al eliminar", "error");
  } finally {
    setBusy(false);
  }
}

ui.tabs?.addEventListener("click", (event) => {
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
ui.inventory?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-stock-action]");
  if (!button) return;
  button.disabled = true;
  changeStockState(button.dataset.productId, button.dataset.stockAction).catch((error) => {
    button.disabled = false;
    setState(error.message || "No pudimos actualizar el stock.", "error");
  });
});
ui.settingsForm?.addEventListener("submit", async (event) => {
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
ui.instagramSync?.addEventListener("click", async () => {
  ui.instagramSync.disabled = true;
  ui.instagramSyncState.textContent = "Consultando el último estado de GitHub…";
  try {
    await checkInstagramConnection();
    const repaired = await repairImportedInstagramImages();
    const suffix = repaired ? ` · ${repaired} producto${repaired === 1 ? "" : "s"} reparado${repaired === 1 ? "" : "s"}` : "";
    ui.instagramSyncState.textContent = `${instagramFeedPosts.length} publicaciones · última sincronización ${formatInstagramDate(instagramSyncStatus?.lastSuccessAt)}${suffix}`;
  } catch (error) {
    console.error("No se pudo recargar Instagram:", error);
    ui.instagramSyncState.textContent = "No pudimos recargar el estado. El último contenido disponible continúa visible.";
  } finally {
    ui.instagramSync.disabled = false;
  }
});

ui.instagramFeed?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-import-instagram]");
  if (!button) return;
  button.disabled = true;
  importInstagramProduct(button.dataset.importInstagram, button.dataset.importStatus).catch((error) => {
    button.disabled = false;
    ui.instagramSyncState.textContent = error.message || "No pudimos crear el producto.";
  });
});

ui.addVariant?.addEventListener("click", () => {
  addVariantRow();
  updatePriceFieldState();
});
ui.variants?.addEventListener("change", updatePriceFieldState);
ui.variants?.addEventListener("input", updatePriceFieldState);
ui.newProduct?.addEventListener("click", resetForm);
ui.search?.addEventListener("input", renderList);
ui.list?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-product-id]");
  const product = products.find((item) => item.documentId === button?.dataset.productId);
  if (product) fillForm(product);
});
ui.previewImages?.addEventListener("click", renderImages);
ui.imageFiles?.addEventListener("change", () => {
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
ui.preview?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-saved-image-index], [data-pending-image-index]");
  if (!button) return;
  if (button.dataset.savedImageIndex !== undefined) {
    const index = Number(button.dataset.savedImageIndex);
    const removed = existingImageRefs[index];
    if (removed?.path) removedStoragePaths.push(removed.path);
    existingImageRefs.splice(index, 1);
    existingImages = existingImageRefs.map((image) => image.url);
    ui.imageUrls.value = existingImages.join("\n");
  } else {
    selectedImages.splice(Number(button.dataset.pendingImageIndex), 1);
  }
  renderImages();
});
ui.form?.addEventListener("submit", (event) => {
  event.preventDefault();
  saveProduct();
});
ui.saveDraft?.addEventListener("click", () => saveProduct("draft"));
ui.duplicate?.addEventListener("click", () => {
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
ui.removeProduct?.addEventListener("click", removeCurrentProduct);
ui.logout?.addEventListener("click", async () => {
  if (auth) await signOut(auth);
  location.href = "login.html";
});

async function initialize(user) {
  if (!user) {
    location.replace("login.html?next=admin-productos.html");
    return;
  }
  ui.uid.value = user.uid;
  // La validación de permisos debe responder desde Firestore y no quedar
  // esperando indefinidamente si hay una conexión interrumpida.
  const admin = await withTimeout(
    getDocFromServer(doc(db, "admins", user.uid)),
    12000,
    "La conexión con Firebase tardó demasiado. Revisá tu conexión y actualizá la página."
  );
  ui.loading.hidden = true;
  if (!admin.exists()) {
    ui.denied.hidden = false;
    return;
  }
  ui.content.hidden = false;
  resetForm();
  await loadProducts();
  await Promise.all([loadSettings(), checkInstagramConnection(), checkMercadoPagoConnection()]);
  try {
    const repaired = await repairImportedInstagramImages();
    if (repaired) ui.instagramSyncState.textContent = `${repaired} imagen${repaired === 1 ? "" : "es"} de productos importados reparada${repaired === 1 ? "" : "s"}.`;
  } catch (error) {
    console.error("No se pudieron reparar las imágenes importadas de Instagram:", error);
  }
}

async function checkCategories() {
  const resultsDiv = document.querySelector("#category-check-results");
  const fixButton = document.querySelector("#fix-categories");

  resultsDiv.innerHTML = "<p>Verificando categorías...</p>";

  try {
    const snapshot = await getDocs(collection(db, "products"));
    const validCategories = ["Accesorios", "Buzos", "Camisas", "Camperas", "Faldas", "Pantalones", "Remeras", "Short"];
    const problemProducts = [];

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const category = data.category || "";
      if (!category || !validCategories.includes(category)) {
        problemProducts.push({ id: doc.id, name: data.name || "Sin nombre", category });
      }
    });

    if (problemProducts.length === 0) {
      resultsDiv.innerHTML = "<p style='color: green;'>✓ Todas las categorías están correctas.</p>";
      fixButton.disabled = true;
    } else {
      const list = problemProducts.map(p => `<li>${escapeHtml(p.name)} (${p.category || "VACÍA"})</li>`).join("");
      resultsDiv.innerHTML = `<p style='color: orange;'>⚠ ${problemProducts.length} productos con categoría inválida:</p><ul>${list}</ul>`;
      fixButton.disabled = false;
      fixButton.dataset.problemProducts = JSON.stringify(problemProducts);
    }
  } catch (error) {
    resultsDiv.innerHTML = `<p style='color: red;'>Error: ${escapeHtml(error.message)}</p>`;
  }
}

async function fixCategories() {
  const fixButton = document.querySelector("#fix-categories");
  const resultsDiv = document.querySelector("#category-check-results");
  const problemProducts = JSON.parse(fixButton.dataset.problemProducts || "[]");

  if (!problemProducts.length) return;
  if (!confirm(`¿Reparar ${problemProducts.length} productos?`)) return;

  resultsDiv.innerHTML = "<p>Reparando...</p>";
  let fixed = 0;

  try {
    for (const problem of problemProducts) {
      const docRef = doc(db, "products", problem.id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        // Try to determine category from name
        const name = (data.name || "").toLowerCase();
        let category = "Accesorios";

        if (name.includes("buzo")) category = "Buzos";
        else if (name.includes("camisa")) category = "Camisas";
        else if (name.includes("campera") || name.includes("abrigo") || name.includes("jacket")) category = "Camperas";
        else if (name.includes("falda")) category = "Faldas";
        else if (name.includes("pantalon")) category = "Pantalones";
        else if (name.includes("remera") || name.includes("remera") || name.includes("shirt")) category = "Remeras";
        else if (name.includes("short")) category = "Short";

        await setDoc(docRef, { category }, { merge: true });
        fixed++;
      }
    }
    resultsDiv.innerHTML = `<p style='color: green;'>✓ Se repararon ${fixed} productos.</p>`;
    fixButton.disabled = true;
  } catch (error) {
    resultsDiv.innerHTML = `<p style='color: red;'>Error: ${escapeHtml(error.message)}</p>`;
  }
}

if (firebaseConfigured) {
  document.querySelector("#check-categories")?.addEventListener("click", checkCategories);
  document.querySelector("#fix-categories")?.addEventListener("click", fixCategories);
}
