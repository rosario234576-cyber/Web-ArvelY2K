(function () {
  "use strict";

  const fallback = Array.isArray(window.ARVEL_PRODUCTS) ? [...window.ARVEL_PRODUCTS] : [];

  window.ARVEL_PRODUCTS_READY = (async () => {
    try {
      const [{ initializeApp }, { collection, getDocs, getFirestore, query, where }, configModule] =
        await Promise.all([
          import("https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js"),
          import("https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js"),
          import("./firebase-config.js?v=20260731-3")
        ]);

      if (!configModule.firebaseConfigured) return fallback;
      const app = initializeApp(configModule.firebaseConfig, "arvel-public-catalog");
      const db = getFirestore(app);
      const snapshot = await getDocs(
        query(collection(db, "products"), where("status", "==", "published"))
      );
      const remote = snapshot.docs.map((item) => {
        const data = item.data();
        return {
          ...data,
          documentId: item.id,
          id: Number(data.id) || 0,
          createdAt: data.createdAt?.toDate?.().toISOString() || data.createdAt || "",
          updatedAt: data.updatedAt?.toDate?.().toISOString() || data.updatedAt || ""
        };
      });
      if (!remote.length) return fallback;
      window.ARVEL_PRODUCTS = Object.freeze(remote);
      return remote;
    } catch (error) {
      console.warn("Catálogo Firebase no disponible; se usa el catálogo local.", error);
      return fallback;
    }
  })();
})();
