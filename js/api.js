// ======================================================
// api.js - Utilidades compartidas para todas las páginas
// ======================================================

const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';

function getToken() {
  return localStorage.getItem('token');
}

// Keys de autenticación guardadas en localStorage
const AUTH_KEYS = ['token', 'usuario', 'rol', 'permisos'];

function clearAuthStorage() {
  AUTH_KEYS.forEach(k => localStorage.removeItem(k));
}

function redirectLogin() {
  clearAuthStorage();
  window.location.href = 'index.html';
}

// Cambia de página (los redirects nuevos pasan por aquí para poder probarlos)
function irA(url) {
  window.location.href = url;
}

// ======================================================
// Permisos del usuario actual
// ======================================================
// Los entrega /auth/me y nav.js los guarda aquí (y en localStorage, para leerlos al instante
// al abrir otra página). Solo mandan en los módulos ya MIGRADOS (Permisos.migrado(modulo)):
// el resto de las pantallas sigue con las reglas por rol de siempre. Si el servidor no los
// manda (disponibles() = false) todo sigue como siempre.
// Ojo: tiene('bodega.solo_su_sede') = true significa que la persona TIENE esa limitación.
const Permisos = (() => {
  let conjunto = null;        // null = el servidor no los mandó
  let migrados = [];
  let base = false;           // true = uno de los 8 perfiles de siempre
  let inicio = null;          // página a la que entra su perfil (la calcula el servidor)
  let avisarListo;
  const listo = new Promise(resolver => { avisarListo = resolver; });   // se cumple cuando nav.js ya habló con /auth/me

  function aplicar(permisos, modulosMigrados, perfilBase, paginaInicio) {
    conjunto = Array.isArray(permisos) ? new Set(permisos) : null;
    migrados = Array.isArray(modulosMigrados) ? modulosMigrados : [];
    base = perfilBase === true;
    inicio = (typeof paginaInicio === 'string' && /^[a-z0-9-]+\.html$/.test(paginaInicio)) ? paginaInicio : null;
  }

  try {
    const guardado = JSON.parse(localStorage.getItem('permisos') || 'null');
    if (guardado) aplicar(guardado.permisos, guardado.migrados, guardado.base, guardado.inicio);
  } catch { /* no hay permisos guardados */ }

  return {
    listo,
    disponibles: () => conjunto !== null,
    tiene: (clave) => conjunto !== null && conjunto.has(clave),
    migrado: (modulo) => migrados.includes(modulo),
    esBase: () => base,
    paginaInicio: () => inicio,
    // Recibe la respuesta de /auth/me
    actualizar(datos) {
      aplicar(datos && datos.permisos, datos && datos.modulos_migrados, datos && datos.perfil_base, datos && datos.pagina_inicio);
      try {
        if (conjunto) localStorage.setItem('permisos', JSON.stringify({ permisos: [...conjunto], migrados, base, inicio }));
        else localStorage.removeItem('permisos');
      } catch { /* almacenamiento no disponible */ }
      avisarListo();
    },
    // nav.js lo llama si no pudo hablar con /auth/me: las pantallas dejan de esperar y siguen con
    // lo que haya (permisos ya guardados o, si no hay, las reglas por rol de siempre)
    sinRespuesta() { avisarListo(); }
  };
})();

// Aviso flotante propio (no usa SweetAlert para no pisar un modal que esté abierto)
function mostrarAviso(texto) {
  if (!document.body) return;
  const el = document.createElement('div');
  el.setAttribute('role', 'alert');
  el.textContent = texto;
  el.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;max-width:360px;'
    + 'padding:12px 16px;background:#fef2f2;color:#991b1b;border:1px solid #fca5a5;'
    + 'border-radius:8px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.15);cursor:pointer';
  el.onclick = () => el.remove();
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

const MSG_SIN_PERMISO = 'No tienes permiso para esta acción';
let _ultimoAvisoPermiso = 0;

// Avisa que el servidor rechazó la acción por falta de permiso (403).
// Usa el mensaje del servidor si lo trae; evita repetir avisos seguidos.
async function avisarSinPermiso(res) {
  const ahora = Date.now();
  if (ahora - _ultimoAvisoPermiso < 4000) return;
  _ultimoAvisoPermiso = ahora;

  let mensaje = '';
  try {
    if ((res.headers.get('content-type') || '').includes('application/json')) {
      const d = await res.clone().json();
      mensaje = (d && d.error) || '';
    }
  } catch { /* se usa el mensaje genérico */ }

  // El mensaje genérico también sale cuando cambiaron el perfil de la persona con
  // la sesión abierta: en ese caso ayuda volver a entrar.
  if (!mensaje || mensaje === 'No autorizado para esta acción') {
    mensaje = `${MSG_SIN_PERMISO}. Si te acaban de cambiar el perfil, cierra sesión y vuelve a entrar.`;
  }
  mostrarAviso(mensaje);
}

/**
 * Fetch autenticado. Agrega el Bearer token.
 *  - 401 (sesión inválida o vencida): cierra sesión y devuelve null.
 *  - 403 (identificado pero sin permiso): NO cierra sesión; avisa y devuelve la
 *    respuesta (res.ok === false) para que cada pantalla maneje su caso.
 * Opción { silencioso: true } evita el aviso del 403 (llamadas en segundo plano:
 * contadores, keep-alive, autocompletar).
 * @param {string} path - Ruta del API (ej: '/auth/me') o URL completa
 * @param {object} options - Opciones de fetch (+ silencioso)
 * @returns {Promise<Response|null>}
 */
async function apiFetch(path, options = {}) {
  const { silencioso, ...fetchOptions } = options;
  const token = getToken();
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...fetchOptions,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(fetchOptions.body && !(fetchOptions.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(fetchOptions.headers || {})
    }
  });

  if (res.status === 401) {
    redirectLogin();
    return null;
  }

  if (res.status === 403 && !silencioso) avisarSinPermiso(res);

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
