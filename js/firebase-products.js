(function () {
  "use strict";

  const CACHE_KEY = "arvel-products-cache-v1";
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
      const [{ initializeApp }, { collection, getDocs, getFirestore, query, where }, configModule] =
        await Promise.all([
          import("https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js"),
          import("https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js"),
          import("./firebase-config.js?v=20260731-5")
        ]);

      if (!configModule.firebaseConfigured) return immediateCatalog;
      const app = initializeApp(configModule.firebaseConfig, "arvel-public-catalog");
      const db = getFirestore(app);
      const snapshot = await getDocs(
        query(collection(db, "products"), where("status", "==", "published"))
      );
      const remote = snapshot.docs.map((item) => {
        const data = item.data();
        const sizes = Array.isArray(data.sizes) && data.sizes.length ? data.sizes : ["Único"];
        const colors = Array.isArray(data.colors) && data.colors.length
          ? data.colors
          : ["Según publicación"];
        const stock = Math.max(0, Number(data.stock) || 0);
        const stockByVariant = data.stockByVariant && Object.keys(data.stockByVariant).length
          ? data.stockByVariant
          : { [`${sizes[0]}|${colors[0]}`]: stock };
        return {
          ...data,
          name: data.name || "Pieza Arvel",
          shortDescription: data.shortDescription || data.description || "Pieza seleccionada por Arvel.",
          description: data.description || data.shortDescription || "Pieza seleccionada por Arvel.",
          condition: data.condition || "Seleccionada",
          category: data.category || "Sin categoría",
          collection: data.collection || "Arvel",
          images: Array.isArray(data.images) ? data.images.filter(Boolean) : [],
          measurements: data.measurements || {},
          material: data.material || "Consultá la publicación",
          care: data.care || "Consultá antes de lavar",
          sizes,
          colors,
          stock,
          stockByVariant,
          soldOut: Boolean(data.soldOut) || stock <= 0,
          documentId: item.id,
          // Firestore document IDs are the stable public identifier for products.
          // Keeping them as strings prevents every manually-created product from
          // collapsing to the numeric ID 0 in product pages and the cart.
          id: item.id,
          createdAt: data.createdAt?.toDate?.().toISOString() || data.createdAt || "",
          updatedAt: data.updatedAt?.toDate?.().toISOString() || data.updatedAt || ""
        };
      });
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
