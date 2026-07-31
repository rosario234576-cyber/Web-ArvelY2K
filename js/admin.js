(function () {
  "use strict";

  const supabase = window.ArvelSupabase?.client;
  const bucket = window.ArvelSupabase?.config?.productImagesBucket || "product-images";
  let products = [];
  let editingProduct = null;
  let existingImages = [];

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    login: $("#admin-login"),
    loginForm: $("#admin-login-form"),
    loginError: $("#admin-login-error"),
    configHelp: $("#admin-config-help"),
    shell: $("#admin-shell"),
    logout: $("#admin-logout"),
    listBody: $("#admin-products-body"),
    listEmpty: $("#admin-products-empty"),
    search: $("#admin-product-search"),
    stats: $("#admin-stats"),
    editor: $("#admin-editor"),
    editorMode: $("#admin-editor-mode"),
    editorTitle: $("#admin-editor-title"),
    editorClose: $("#admin-editor-close"),
    newProduct: $("#admin-new-product"),
    form: $("#admin-product-form"),
    formError: $("#admin-product-error"),
    productId: $("#admin-product-id"),
    name: $("#product-name-admin"),
    sku: $("#product-sku-admin"),
    category: $("#product-category-admin"),
    collection: $("#product-collection-admin"),
    price: $("#product-price-admin"),
    condition: $("#product-condition-admin"),
    shortDescription: $("#product-short-admin"),
    description: $("#product-description-admin"),
    material: $("#product-material-admin"),
    care: $("#product-care-admin"),
    measurements: $("#product-measurements-admin"),
    sizes: $("#product-sizes-admin"),
    colors: $("#product-colors-admin"),
    tags: $("#product-tags-admin"),
    variants: $("#admin-variants"),
    generateVariants: $("#generate-variants"),
    images: $("#product-images-admin"),
    imageList: $("#admin-image-list"),
    status: $("#product-status-admin"),
    featured: $("#product-featured-admin"),
    uniquePiece: $("#product-unique-admin"),
    cancel: $("#admin-cancel-product"),
    save: $("#admin-save-product")
  };

  function splitList(value) {
    return [...new Set(String(value).split(",").map((item) => item.trim()).filter(Boolean))];
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        })[character]
    );
  }

  function slugify(value) {
    return String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function measurementsFromText(value) {
    return Object.fromEntries(
      String(value)
        .split("\n")
        .map((line) => line.split(":"))
        .filter((parts) => parts.length >= 2 && parts[0].trim())
        .map(([label, ...rest]) => [label.trim(), rest.join(":").trim()])
    );
  }

  function measurementsToText(value) {
    return Object.entries(value || {})
      .map(([label, measurement]) => `${label}: ${measurement}`)
      .join("\n");
  }

  function showToast(message) {
    const region = $("#toast-region");
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    region.append(toast);
    window.setTimeout(() => toast.remove(), 3500);
  }

  async function isAdmin(userId) {
    const { data, error } = await supabase
      .from("admin_profiles")
      .select("is_admin")
      .eq("user_id", userId)
      .maybeSingle();
    return !error && data?.is_admin === true;
  }

  async function showAuthenticated(session) {
    if (!session || !(await isAdmin(session.user.id))) {
      if (session) await supabase.auth.signOut();
      elements.login.hidden = false;
      elements.shell.hidden = true;
      elements.logout.hidden = true;
      elements.loginError.textContent = session
        ? "La cuenta existe, pero todavía no tiene permiso de administradora."
        : "";
      return;
    }

    elements.login.hidden = true;
    elements.shell.hidden = false;
    elements.logout.hidden = false;
    await loadProducts();
  }

  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select(`
        *,
        product_variants (id, size, color, stock, sku),
        product_images (id, storage_path, public_url, alt_text, sort_order)
      `)
      .order("updated_at", { ascending: false });

    if (error) {
      showToast(`No se pudo cargar el catálogo: ${error.message}`);
      return;
    }

    products = data || [];
    renderProducts();
  }

  function renderProducts() {
    const query = elements.search.value.trim().toLowerCase();
    const visible = products.filter(
      (product) =>
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query)
    );

    elements.listBody.innerHTML = visible
      .map((product) => {
        const image = [...(product.product_images || [])].sort(
          (a, b) => a.sort_order - b.sort_order
        )[0];
        const stock = (product.product_variants || []).reduce(
          (total, variant) => total + Number(variant.stock || 0),
          0
        );
        const statusLabels = {
          draft: "Borrador",
          published: "Publicado",
          hidden: "Oculto"
        };

        return `
          <tr data-product-id="${product.id}">
            <td>
              <div class="admin-table__product">
                ${image
                  ? `<img src="${escapeHtml(image.public_url)}" alt="">`
                  : '<span class="admin-table__placeholder" aria-hidden="true"></span>'}
                <strong>${escapeHtml(product.name)}</strong>
              </div>
            </td>
            <td>${escapeHtml(product.sku)}</td>
            <td><span class="admin-status admin-status--${product.status}">${statusLabels[product.status]}</span></td>
            <td>${stock}</td>
            <td>${new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(product.price)}</td>
            <td>
              <div class="admin-table__actions">
                <button type="button" data-admin-action="edit">Editar</button>
                <button type="button" data-admin-action="duplicate">Duplicar</button>
                ${product.status === "published"
                  ? '<button type="button" data-admin-action="hidden">Ocultar</button>'
                  : '<button type="button" data-admin-action="published">Publicar</button>'}
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    elements.listEmpty.hidden = visible.length > 0;
    const counts = {
      total: products.length,
      published: products.filter((item) => item.status === "published").length,
      draft: products.filter((item) => item.status === "draft").length,
      hidden: products.filter((item) => item.status === "hidden").length
    };
    elements.stats.innerHTML = `
      <p><span>Total</span><strong>${counts.total}</strong></p>
      <p><span>Publicados</span><strong>${counts.published}</strong></p>
      <p><span>Borradores</span><strong>${counts.draft}</strong></p>
      <p><span>Ocultos</span><strong>${counts.hidden}</strong></p>
    `;
  }

  function renderVariants(existing = []) {
    const sizes = splitList(elements.sizes.value);
    const colors = splitList(elements.colors.value);
    const byKey = new Map(
      existing.map((variant) => [`${variant.size}|${variant.color}`, variant])
    );

    elements.variants.innerHTML = sizes
      .flatMap((size) =>
        colors.map((color) => {
          const current = byKey.get(`${size}|${color}`);
          return `
            <div class="admin-variant-row" data-variant-id="${current?.id || ""}">
              <label>Talle<input class="input" data-variant-size value="${escapeHtml(size)}" readonly></label>
              <label>Color<input class="input" data-variant-color value="${escapeHtml(color)}" readonly></label>
              <label>Stock<input class="input" data-variant-stock type="number" min="0" value="${current?.stock ?? 0}" required></label>
              <label>SKU variante<input class="input" data-variant-sku value="${escapeHtml(current?.sku || "")}"></label>
            </div>
          `;
        })
      )
      .join("");
  }

  function renderImages() {
    elements.imageList.innerHTML = existingImages
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(
        (image) => `
          <figure class="admin-image" data-image-id="${escapeHtml(image.id)}" data-storage-path="${escapeHtml(image.storage_path)}">
            <img src="${escapeHtml(image.public_url)}" alt="${escapeHtml(image.alt_text || "")}">
            <button type="button" data-delete-image aria-label="Eliminar imagen">×</button>
          </figure>
        `
      )
      .join("");
  }

  function openEditor(product = null) {
    editingProduct = product;
    existingImages = [...(product?.product_images || [])];
    elements.form.reset();
    elements.productId.value = product?.id || "";
    elements.name.value = product?.name || "";
    elements.sku.value = product?.sku || "";
    elements.category.value = product?.category || "";
    elements.collection.value = product?.collection || "";
    elements.price.value = product?.price ?? "";
    elements.condition.value = product?.condition || "Custom";
    elements.shortDescription.value = product?.short_description || "";
    elements.description.value = product?.description || "";
    elements.material.value = product?.material || "";
    elements.care.value = product?.care || "";
    elements.measurements.value = measurementsToText(product?.measurements);
    elements.sizes.value = (product?.sizes || []).join(", ");
    elements.colors.value = (product?.colors || []).join(", ");
    elements.tags.value = (product?.tags || []).join(", ");
    elements.status.value = product?.status || "draft";
    elements.featured.checked = Boolean(product?.featured);
    elements.uniquePiece.checked = Boolean(product?.unique_piece);
    elements.editorMode.textContent = product ? "Editar registro" : "Nuevo registro";
    elements.editorTitle.textContent = product?.name || "Producto";
    elements.formError.textContent = "";
    renderVariants(product?.product_variants || []);
    renderImages();
    elements.editor.hidden = false;
    elements.editor.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeEditor() {
    elements.editor.hidden = true;
    editingProduct = null;
    existingImages = [];
  }

  function readVariantRows(productId) {
    return [...elements.variants.querySelectorAll(".admin-variant-row")].map((row) => ({
      ...(row.dataset.variantId ? { id: row.dataset.variantId } : {}),
      product_id: productId,
      size: row.querySelector("[data-variant-size]").value.trim(),
      color: row.querySelector("[data-variant-color]").value.trim(),
      stock: Number(row.querySelector("[data-variant-stock]").value) || 0,
      sku: row.querySelector("[data-variant-sku]").value.trim() || null
    }));
  }

  async function saveVariants(productId) {
    const nextVariants = readVariantRows(productId);
    const keptIds = nextVariants.filter((item) => item.id).map((item) => item.id);
    const previousIds = (editingProduct?.product_variants || []).map((item) => item.id);
    const removedIds = previousIds.filter((id) => !keptIds.includes(id));

    if (removedIds.length) {
      const { error } = await supabase.from("product_variants").delete().in("id", removedIds);
      if (error) throw error;
    }

    const existing = nextVariants.filter((item) => item.id);
    const newRows = nextVariants.filter((item) => !item.id).map(({ id, ...item }) => item);
    if (existing.length) {
      const { error } = await supabase.from("product_variants").upsert(existing);
      if (error) throw error;
    }
    if (newRows.length) {
      const { error } = await supabase.from("product_variants").insert(newRows);
      if (error) throw error;
    }
  }

  async function uploadImages(productId, productName) {
    const files = [...elements.images.files];
    for (const [index, file] of files.entries()) {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error(`${file.name} supera el límite de 10 MB.`);
      }

      const extension = file.name.split(".").pop().toLowerCase();
      const path = `${productId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type
      });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      const { error: rowError } = await supabase.from("product_images").insert({
        product_id: productId,
        storage_path: path,
        public_url: data.publicUrl,
        alt_text: productName,
        sort_order: existingImages.length + index
      });
      if (rowError) {
        await supabase.storage.from(bucket).remove([path]);
        throw rowError;
      }
    }
  }

  async function saveProduct(event) {
    event.preventDefault();
    elements.formError.textContent = "";
    elements.save.disabled = true;
    elements.save.textContent = "Guardando...";

    try {
      const sizes = splitList(elements.sizes.value);
      const colors = splitList(elements.colors.value);
      if (!sizes.length || !colors.length) {
        throw new Error("Ingresá al menos un talle y un color.");
      }
      if (!elements.variants.children.length) renderVariants(editingProduct?.product_variants || []);

      const selectedFiles = elements.images.files.length;
      if (elements.status.value === "published" && !existingImages.length && !selectedFiles) {
        throw new Error("Para publicar el producto necesitás al menos una fotografía.");
      }

      const { data: authData } = await supabase.auth.getUser();
      const payload = {
        name: elements.name.value.trim(),
        slug: slugify(elements.name.value),
        sku: elements.sku.value.trim(),
        category: elements.category.value.trim(),
        collection: elements.collection.value.trim(),
        price: Number(elements.price.value),
        short_description: elements.shortDescription.value.trim(),
        description: elements.description.value.trim(),
        material: elements.material.value.trim(),
        care: elements.care.value.trim(),
        measurements: measurementsFromText(elements.measurements.value),
        sizes,
        colors,
        tags: splitList(elements.tags.value),
        condition: elements.condition.value,
        featured: elements.featured.checked,
        unique_piece: elements.uniquePiece.checked,
        status: elements.status.value,
        created_by: editingProduct?.created_by || authData.user.id
      };

      let productId = editingProduct?.id;
      if (productId) {
        const { error } = await supabase.from("products").update(payload).eq("id", productId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("products").insert(payload).select("id").single();
        if (error) throw error;
        productId = data.id;
      }

      await saveVariants(productId);
      await uploadImages(productId, payload.name);
      showToast("Producto guardado correctamente.");
      await loadProducts();
      closeEditor();
    } catch (error) {
      elements.formError.textContent = error.message || "No se pudo guardar el producto.";
    } finally {
      elements.save.disabled = false;
      elements.save.textContent = "Guardar producto";
    }
  }

  async function deleteImage(figure) {
    if (elements.status.value === "published" && existingImages.length <= 1) {
      showToast("Un producto publicado debe conservar al menos una fotografía.");
      return;
    }
    const imageId = figure.dataset.imageId;
    const path = figure.dataset.storagePath;
    const { error: storageError } = await supabase.storage.from(bucket).remove([path]);
    if (storageError) {
      showToast(storageError.message);
      return;
    }
    const { error } = await supabase.from("product_images").delete().eq("id", imageId);
    if (error) {
      showToast(error.message);
      return;
    }
    existingImages = existingImages.filter((image) => image.id !== imageId);
    renderImages();
  }

  async function duplicateProduct(product) {
    const timestamp = Date.now().toString().slice(-6);
    const { id, product_variants: variants, product_images, created_at, updated_at, ...copy } = product;
    copy.name = `${product.name} copia`;
    copy.slug = `${product.slug}-copia-${timestamp}`;
    copy.sku = `${product.sku}-COPY-${timestamp}`;
    copy.status = "draft";

    const { data, error } = await supabase.from("products").insert(copy).select("id").single();
    if (error) {
      showToast(error.message);
      return;
    }

    if (variants?.length) {
      const rows = variants.map(({ id: variantId, created_at: created, updated_at: updated, ...variant }) => ({
        ...variant,
        product_id: data.id
      }));
      const { error: variantsError } = await supabase.from("product_variants").insert(rows);
      if (variantsError) {
        showToast(variantsError.message);
        return;
      }
    }

    showToast("Copia creada como borrador y sin fotografías.");
    await loadProducts();
  }

  async function setStatus(product, status) {
    if (status === "published" && !(product.product_images || []).length) {
      showToast("Agregá una fotografía antes de publicar.");
      return;
    }
    const { error } = await supabase.from("products").update({ status }).eq("id", product.id);
    if (error) showToast(error.message);
    else {
      showToast(status === "published" ? "Producto publicado." : "Producto ocultado.");
      await loadProducts();
    }
  }

  function bindEvents() {
    elements.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      elements.loginError.textContent = "";
      const { data, error } = await supabase.auth.signInWithPassword({
        email: $("#admin-email").value.trim(),
        password: $("#admin-password").value
      });
      if (error) elements.loginError.textContent = "Correo o contraseña incorrectos.";
      else await showAuthenticated(data.session);
    });

    elements.logout.addEventListener("click", async () => {
      await supabase.auth.signOut();
      window.location.reload();
    });
    elements.search.addEventListener("input", renderProducts);
    elements.newProduct.addEventListener("click", () => openEditor());
    elements.editorClose.addEventListener("click", closeEditor);
    elements.cancel.addEventListener("click", closeEditor);
    elements.generateVariants.addEventListener("click", () =>
      renderVariants(editingProduct?.product_variants || [])
    );
    elements.form.addEventListener("submit", saveProduct);
    elements.imageList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-delete-image]");
      if (button) deleteImage(button.closest(".admin-image"));
    });
    elements.listBody.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-admin-action]");
      const row = event.target.closest("[data-product-id]");
      if (!button || !row) return;
      const product = products.find((item) => item.id === row.dataset.productId);
      if (!product) return;
      const action = button.dataset.adminAction;
      if (action === "edit") openEditor(product);
      if (action === "duplicate") await duplicateProduct(product);
      if (action === "published" || action === "hidden") await setStatus(product, action);
    });
  }

  async function initialize() {
    if (!window.ArvelSupabase?.isConfigured) {
      elements.configHelp.hidden = false;
      elements.loginForm.querySelector("button").disabled = true;
      return;
    }

    bindEvents();
    const { data } = await supabase.auth.getSession();
    await showAuthenticated(data.session);
  }

  initialize();
})();
