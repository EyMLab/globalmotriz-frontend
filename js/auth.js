// auth.js

let inactivityTimer;

// ---- CONFIG ----
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
  const usuarioSpan = document.getElementById('nombre-usuario');

  if (!getToken()) {
    redirectLogin();
    return;
  }

  try {
    const res = await apiFetch('/auth/me');

    if (!res || !res.ok) {
      redirectLogin();
      return;
    }

    const data = await safeJson(res);

    // ✅ Refresca storage en caso de cambios
    localStorage.setItem('usuario', data.usuario);
    localStorage.setItem('rol', data.rol);

    // ✅ Reflejar en navbar si existe el span
    if (usuarioSpan) usuarioSpan.textContent = `${data.usuario} (${data.rol})`;

    // ✅ Arranca el contador de inactividad
    resetInactivityTimer();

  } catch (err) {
    console.error('Error de conexión en /auth/me:', err);
    redirectLogin();
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
