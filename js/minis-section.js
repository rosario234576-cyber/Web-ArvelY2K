let minisFilter = 'all';
let minisProducts = [];
let firestoreToolsPromise = null;

function hasMinisSection() {
  return Boolean(document.querySelector("#minis-products-grid"));
}

async function getFirestoreTools() {
  if (!firestoreToolsPromise) {
    firestoreToolsPromise = Promise.all([
      import("https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js"),
      import("./firebase-config.js?v=20260731-5")
    ]).then(([{ initializeApp }, firestore, configModule]) => {
      if (!configModule.firebaseConfigured) return null;
      const app = initializeApp(configModule.firebaseConfig, "arvel-minis-section");
      return {
        db: firestore.getFirestore(app),
        collection: firestore.collection,
        getDocs: firestore.getDocs,
        query: firestore.query,
        where: firestore.where
      };
    });
  }

  return firestoreToolsPromise;
}

async function loadMinisProducts() {
  try {
    const tools = await getFirestoreTools();
    if (!tools) return;
    const { collection, db, getDocs, query, where } = tools;
    const productsRef = collection(db, "products");
    let q;

    if (minisFilter === 'all') {
      q = query(productsRef, where("status", "==", "published"), where("condition", "in", ["Custom", "Segunda mano"]));
    } else if (minisFilter === 'custom') {
      q = query(productsRef, where("status", "==", "published"), where("condition", "==", "Custom"));
    } else if (minisFilter === 'unique') {
      q = query(productsRef, where("status", "==", "published"), where("uniquePiece", "==", true));
    }

    const snapshot = await getDocs(q);
    minisProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    renderMinisProducts();
  } catch (error) {
    console.error("Error cargando productos minis:", error);
  }
}

function renderMinisProducts() {
  const grid = document.querySelector("#minis-products-grid");
  if (!grid) return;

  if (minisProducts.length === 0) {
    grid.innerHTML = '<p style="color: var(--color-silver);">No hay productos en esta categoría</p>';
    return;
  }

  grid.innerHTML = minisProducts.slice(0, 6).map(product => `
    <article class="shop-card" data-product-id="${product.id}">
      <a href="producto.html?id=${product.id}" class="shop-card__image">
        <img src="${product.images?.[0] || 'assets/images/moodboard/optimized/arvel-editorial-hero-720.jpg'}" alt="${product.name}" width="1080" height="1440" loading="lazy" decoding="async">
        ${product.oldPrice ? '<span class="shop-card__badge">-' + Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100) + '%</span>' : ''}
      </a>
      <div class="shop-card__body">
        <h3 class="shop-card__title">${product.name}</h3>
        <p class="shop-card__price">$${product.price.toLocaleString('es-AR')}</p>
        ${product.stock === 0 ? '<p style="color: #9b1839; font-size: 0.85rem; font-weight: 600;">Agotado</p>' : ''}
      </div>
    </article>
  `).join('');
}

if (hasMinisSection()) {
  document.querySelectorAll('.drop-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.drop-filter-btn').forEach(b => b.classList.remove('is-active'));
      e.target.classList.add('is-active');
      minisFilter = e.target.dataset.filter || 'all';
      loadMinisProducts();
    });
  });

  loadMinisProducts();
}
