// auth.js

async function verificarSesion() {
  const token = localStorage.getItem('token');
  const usuarioSpan = document.getElementById('nombre-usuario');

  if (!token) {
    Swal.fire({
      icon: 'warning',
      title: 'Sesión requerida',
      text: '⚠️ Debes iniciar sesión para continuar.',
      confirmButtonText: 'Aceptar'
    }).then(() => {
      window.location.href = 'index.html';
    });
    return;
  }

  try {
    const res = await fetch('https://globalmotriz-backend.onrender.com/auth/me', {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (res.status === 401) {
      Swal.fire({
        icon: 'warning',
        title: 'Sesión expirada',
        text: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
        confirmButtonText: 'Aceptar'
      }).then(() => {
        localStorage.clear();
        window.location.href = 'index.html';
      });
      return;
    }

    if (res.status === 403) {
      Swal.fire({
        icon: 'error',
        title: 'Token inválido',
        text: 'Hubo un problema con la autenticación. Inicia sesión nuevamente.',
        confirmButtonText: 'Aceptar'
      }).then(() => {
        localStorage.clear();
        window.location.href = 'index.html';
      });
      return;
    }

    if (!res.ok) {
      console.error("❌ Error inesperado en /auth/me:", res.status);
      return;
    }

    const data = await res.json();

    // ✅ Ahora sí guardamos usuario correctamente
    localStorage.setItem('usuario', data.usuario);
    localStorage.setItem('rol', data.rol);

    // Mostrar nombre en pantalla si existe ese span
    if (usuarioSpan) {
      usuarioSpan.textContent = `${data.usuario} (${data.rol})`;
    }

  } catch (err) {
    console.error('❌ Error de conexión con /auth/me:', err.message);
    Swal.fire({
      icon: 'error',
      title: 'Error de conexión',
      text: 'No se pudo conectar con el servidor. Inténtalo más tarde.',
      confirmButtonText: 'Aceptar'
    }).then(() => {
      localStorage.clear();
      window.location.href = 'index.html';
    });
  }
}

// ✅ Función global para cerrar sesión
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
