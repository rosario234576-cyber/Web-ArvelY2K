(function () {
  "use strict";

  const CACHE_KEY = "arvel-products-cache-v8";
  const fallback = Array.isArray(window.ARVEL_PRODUCTS) ? [...window.ARVEL_PRODUCTS] : [];
  let cached = [];

  try {
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
    cached = Array.isArray(stored) ? stored : [];
  } catch {
    cached = [];
  }

  // En producción nunca mostramos el catálogo local de demostración: si aún no
  // hay caché esperamos la API y evitamos enseñar productos/fotos incorrectos.
  const immediateCatalog = cached.length
    ? cached
    : window.location.protocol === "file:"
      ? fallback
      : [];
  window.ARVEL_PRODUCTS = Object.freeze(immediateCatalog);

  window.ARVEL_PRODUCTS_READY = (async () => {
    try {
      let productRecords = [];
      let firebaseApp = null;
      let firebaseAppPromise = null;
      let storageToolsPromise = null;

      async function getFirebaseApp() {
        if (firebaseApp) return firebaseApp;
        if (!firebaseAppPromise) {
          firebaseAppPromise = Promise.all([
            import("https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js"),
            import("./firebase-config.js?v=20260731-5")
          ]).then(([{ initializeApp }, configModule]) => {
            if (!configModule.firebaseConfigured) throw new Error("Firebase no configurado");
            firebaseApp = initializeApp(configModule.firebaseConfig, "arvel-public-catalog");
            return firebaseApp;
          });
        }
        return firebaseAppPromise;
      }

      try {
        const canUseSameOrigin = window.location.hostname.endsWith("vercel.app")
          || ["localhost", "127.0.0.1"].includes(window.location.hostname);
        const apiBase = String(
          window.ARVEL_API_BASE
          || (canUseSameOrigin ? window.location.origin : "https://web-arvel-y2-k.vercel.app")
        ).replace(/\/+$/, "");
        const response = await fetch(`${apiBase}/api/products?refresh=${Date.now()}`, {
          headers: { Accept: "application/json" },
          cache: "no-store"
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (!Array.isArray(payload.products)) throw new Error("Respuesta de catalogo invalida");
        productRecords = payload.products
          .filter((data) => data?.status === "published" && !data.archived)
          .map((data) => ({ id: data.documentId || data.id, data }));
      } catch (apiError) {
        console.warn("La API publica del catalogo no respondio; se intenta Firestore.", apiError);
        const app = await getFirebaseApp();
        const { collection, getDocs, getFirestore, query, where } = await import(
          "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js"
        );
        const db = getFirestore(app);
        const snapshot = await getDocs(
          query(collection(db, "products"), where("status", "==", "published"))
        );
        productRecords = snapshot.docs
          .map((item) => ({ id: item.id, data: item.data() }))
          .filter((item) => item.data?.status === "published" && !item.data.archived);
      }
      const resolveImages = async (data) => {
        const references = Array.isArray(data.imageRefs) ? data.imageRefs : [];
        const durable = await Promise.all(references.map(async (image) => {
          if (typeof image === "string") return image;
          // Las URLs permanentes ya guardadas se usan directamente. Evita cargar
          // Firebase Storage y hacer una consulta adicional por cada fotografía.
          if (image?.url) return image.url;
          if (image?.path) {
            try {
              if (!storageToolsPromise) {
                storageToolsPromise = Promise.all([
                  getFirebaseApp(),
                  import("https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js")
                ]);
              }
              const [app, { getDownloadURL, getStorage, ref }] = await storageToolsPromise;
              const storage = getStorage(app);
              return await getDownloadURL(ref(storage, image.path));
            } catch (error) {
              console.warn("No se pudo resolver una imagen de Storage.", image.path, error);
            }
          }
          return image?.url || "";
        }));
        const legacy = Array.isArray(data.images) ? data.images.filter(Boolean) : [];
        return durable.filter(Boolean).length ? durable.filter(Boolean) : legacy;
      };
      const remote = await Promise.all(productRecords.map(async (item) => {
        const data = item.data;
        const sizes = Array.isArray(data.sizes) && data.sizes.length ? data.sizes : ["Único"];
        const colors = Array.isArray(data.colors) && data.colors.length
          ? data.colors
          : ["Según publicación"];
        const stock = Math.max(0, Number(data.stock) || 0);
        const isUniquePiece = Boolean(data.uniquePiece);
        const stockByVariant = data.stockByVariant && Object.keys(data.stockByVariant).length
          ? data.stockByVariant
          : { [`${sizes[0]}|${colors[0]}`]: stock };
        const finalStock = stock;
        return {
          ...data,
          name: data.name || "Pieza Arvel",
          shortDescription: data.shortDescription || data.description || "Pieza seleccionada por Arvel.",
          description: data.description || data.shortDescription || "Pieza seleccionada por Arvel.",
          condition: data.condition || "Seleccionada",
          category: data.category || "Sin categoría",
          collection: data.collection || "Arvel",
          images: await resolveImages(data),
          measurements: data.measurements || {},
          material: data.material || "Consultá la publicación",
          care: data.care || "Consultá antes de lavar",
          sizes,
          colors,
          stock: finalStock,
          stockByVariant,
          featured: data.featured === true || data.featured === "true" || data.featured === 1,
          uniquePiece: isUniquePiece,
          soldOut: Boolean(data.soldOut) || finalStock <= 0,
          documentId: item.id,
          // Firestore document IDs are the stable public identifier for products.
          // Keeping them as strings prevents every manually-created product from
          // collapsing to the numeric ID 0 in product pages and the cart.
          id: item.id,
          createdAt: data.createdAt?.toDate?.().toISOString() || data.createdAt || "",
          updatedAt: data.updatedAt?.toDate?.().toISOString() || data.updatedAt || ""
        };
      }));
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(remote));
        localStorage.removeItem("arvel-products-cache-v6");
        localStorage.removeItem("arvel-products-cache-v7");
      } catch {
        // El catálogo sigue funcionando aunque el navegador no permita guardar caché.
      }
      window.ARVEL_PRODUCTS = Object.freeze(remote);
      document.dispatchEvent(new CustomEvent("arvel:products-updated", { detail: { products: remote } }));
      return remote;
    } catch (error) {
      console.warn("Catálogo Firebase no disponible; se usa el catálogo local.", error);
      return immediateCatalog;
    }
  })();
})();
