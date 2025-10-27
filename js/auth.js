// auth.js

let inactivityTimer;

// ---- CONFIG ----
const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';
const MAX_INACTIVITY_MINUTES = 10;
const MAX_INACTIVITY_MS = MAX_INACTIVITY_MINUTES * 60 * 1000;

// ---- Reinicia el contador de inactividad ----
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    Swal.fire({
      icon: 'warning',
      title: 'Sesión finalizada',
      text: 'Se cerró sesión por inactividad.',
      confirmButtonText: 'Aceptar'
    }).then(() => {
      localStorage.clear();
      window.location.href = 'index.html';
    });
  }, MAX_INACTIVITY_MS);
}

// ---- Detectar actividad del usuario ----
['mousemove', 'keydown', 'click'].forEach(evt => {
  window.addEventListener(evt, resetInactivityTimer);
});

// ---- Función principal de verificación ----
async function verificarSesion() {
  const token = localStorage.getItem('token');
  const usuarioSpan = document.getElementById('nombre-usuario');

  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (res.status === 401 || res.status === 403) {
      localStorage.clear();
      window.location.href = 'index.html';
      return;
    }

    if (!res.ok) return;

    const data = await res.json();

    // ✅ Refresca storage en caso de cambios
    localStorage.setItem('usuario', data.usuario);
    localStorage.setItem('rol', data.rol);

    // ✅ Reflejar en navbar si existe el span
    if (usuarioSpan) usuarioSpan.textContent = `${data.usuario} (${data.rol})`;

    // ✅ Arranca el contador de inactividad
    resetInactivityTimer();

  } catch (err) {
    console.error('❌ Error de conexión en /auth/me:', err);
    localStorage.clear();
    window.location.href = 'index.html';
  }
}

// ---- Logout manual ----
function cerrarSesion() {
  Swal.fire({
    icon: 'question',
    title: 'Cerrar sesión',
    text: '¿Seguro que deseas cerrar sesión?',
    showCancelButton: true,
    confirmButtonText: 'Sí, salir',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#d33'
  }).then(result => {
    if (result.isConfirmed) {
      localStorage.clear();
      window.location.href = 'index.html';
    }
  });
}
