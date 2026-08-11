(function () {
  "use strict";

  const CACHE_KEY = "arvel-products-cache-v2";
  const fallback = Array.isArray(window.ARVEL_PRODUCTS) ? [...window.ARVEL_PRODUCTS] : [];
  let cached = [];

  try {
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
    cached = Array.isArray(stored) ? stored : [];
  } catch {
    cached = [];
  }

  const immediateCatalog = cached.length ? cached : fallback;
  window.ARVEL_PRODUCTS = Object.freeze(immediateCatalog);

  window.ARVEL_PRODUCTS_READY = (async () => {
    try {
      const [
        { initializeApp },
        { collection, getDocs, getFirestore, query, where },
        { getDownloadURL, getStorage, ref },
        configModule
      ] =
        await Promise.all([
          import("https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js"),
          import("https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js"),
          import("https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js"),
          import("./firebase-config.js?v=20260731-5")
        ]);

      if (!configModule.firebaseConfigured) return immediateCatalog;
      const app = initializeApp(configModule.firebaseConfig, "arvel-public-catalog");
      const db = getFirestore(app);
      const storage = getStorage(app);
      const snapshot = await getDocs(
        query(collection(db, "products"), where("status", "==", "published"))
      );
      const resolveImages = async (data) => {
        const references = Array.isArray(data.imageRefs) ? data.imageRefs : [];
        const durable = await Promise.all(references.map(async (image) => {
          if (typeof image === "string") return image;
          if (image?.url) return image.url;
          if (!image?.path) return "";
          try {
            return await getDownloadURL(ref(storage, image.path));
          } catch (error) {
            console.warn("No se pudo resolver una imagen de Storage.", image.path, error);
            return "";
          }
        }));
        const legacy = Array.isArray(data.images) ? data.images.filter(Boolean) : [];
        return durable.filter(Boolean).length ? durable.filter(Boolean) : legacy;
      };
      const remote = await Promise.all(snapshot.docs.map(async (item) => {
        const data = item.data();
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
      if (!remote.length) return immediateCatalog;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(remote));
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
