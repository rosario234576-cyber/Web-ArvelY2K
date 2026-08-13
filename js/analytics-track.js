import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const sessionId = sessionStorage.getItem('session_id') || (() => {
  const id = Math.random().toString(36).slice(2);
  sessionStorage.setItem('session_id', id);
  return id;
})();

export async function trackEvent(eventName, data = {}) {
  if (!db) return;
  try {
    await addDoc(collection(db, 'analytics_events'), {
      event: eventName,
      sessionId,
      url: window.location.pathname,
      timestamp: serverTimestamp(),
      ...data
    });
  } catch (error) {
    console.log('Analytics track:', eventName);
  }
}

trackEvent('page_view', {
  referrer: document.referrer,
  userAgent: navigator.userAgent
});

document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href*="producto"]');
  if (link) trackEvent('product_click', { productUrl: link.href });
});

const cartObserver = new MutationObserver(() => {
  const cart = JSON.parse(localStorage.getItem('arvel_cart') || '[]');
  if (cart.length > 0) trackEvent('add_to_cart', { itemCount: cart.length });
});

const cartEl = document.querySelector('#cart-list');
if (cartEl) cartObserver.observe(cartEl, { childList: true });
