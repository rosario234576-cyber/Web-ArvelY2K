import { db } from './firebase-config.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

let minisFilter = 'all';
let minisProducts = [];

async function loadMinisProducts() {
  try {
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
        <img src="${product.images?.[0] || 'assets/placeholder.png'}" alt="${product.name}" loading="lazy">
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

// Event listeners para filtros
document.querySelectorAll('.drop-filter-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.drop-filter-btn').forEach(b => b.classList.remove('is-active'));
    e.target.classList.add('is-active');
    minisFilter = e.target.dataset.filter || 'all';
    loadMinisProducts();
  });
});

// Cargar al iniciar
if (db) {
  loadMinisProducts();
}
