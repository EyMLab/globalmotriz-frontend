// ======================================================
// api.js - Utilidades compartidas para todas las páginas
// ======================================================

const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';

function getToken() {
  return localStorage.getItem('token');
}

function redirectLogin() {
  localStorage.clear();
  window.location.href = 'index.html';
}

/**
 * Fetch autenticado. Agrega Bearer token y redirige a login si 401/403.
 * @param {string} path - Ruta del API (ej: '/auth/me') o URL completa
 * @param {object} options - Opciones de fetch
 * @returns {Promise<Response|null>}
 */
async function apiFetch(path, options = {}) {
  const token = getToken();
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  if (res.status === 401 || res.status === 403) {
    redirectLogin();
    return null;
  }

  return res;
}

/**
 * Parsea JSON de forma segura, retorna null si falla.
 */
async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

/**
 * Debounce genérico.
 */
function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}
