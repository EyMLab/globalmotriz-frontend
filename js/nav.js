document.addEventListener('DOMContentLoaded', async () => {
  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';

  const token = localStorage.getItem('token');
  const navContainer = document.getElementById('nav-container');

  if (!token) {
    window.location.href = "index.html";
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (res.status === 401) {
      localStorage.clear();
      window.location.href = "index.html";
      return;
    }

    if (res.status === 403) {
      Swal.fire("Acceso denegado", "Tu rol no tiene permisos para esta vista", "error");
      return;
    }

    const data = await res.json();
    const rol = data.rol;

    // Detectar la página actual
    let pagina = "Facturas";
    if (window.location.pathname.includes("usuarios")) pagina = "Usuarios";
    else if (window.location.pathname.includes("insumos")) pagina = "Insumos";

    // Pestañas según rol
    const enlaceUsuarios = rol === 'admin'
      ? `<a href="usuarios.html" class="${pagina === 'Usuarios' ? 'active' : ''}">Usuarios</a>`
      : "";

    const enlaceInsumos = ['admin', 'bodega', 'asesor'].includes(rol)
      ? `<a href="insumos.html" class="${pagina === 'Insumos' ? 'active' : ''}">Insumos</a>`
      : "";

    // Render del navbar
    navContainer.innerHTML = `
      <header class="navbar">
        <div class="nav-left">
          <img src="img/logo.png" alt="Logo" class="logo-header">
          <span class="nav-title">${pagina}</span>
        </div>
        <nav class="nav-center nav-links">
          <a href="dashboard.html" class="${pagina === 'Facturas' ? 'active' : ''}">Facturas</a>
          ${enlaceInsumos}
          ${enlaceUsuarios}
        </nav>
        <div class="nav-right">
          <p id="usuario-info">Sesión: ${data.usuario} (${rol})</p>
          <button onclick="abrirModalCambioClave()">Cambiar contraseña</button>
          <button id="btn-cerrar-sesion">Cerrar sesión</button>
        </div>
      </header>
    `;

    document.getElementById("btn-cerrar-sesion")?.addEventListener("click", cerrarSesion);

  } catch (err) {
    console.error("❌ Error al cargar nav:", err.message);
    Swal.fire("Error", "No se pudo conectar con el servidor.", "error");
  }
});

// ===================================================
// 🔐 Modal para cambiar contraseña
// ===================================================
async function abrirModalCambioClave() {
  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';
  const token = localStorage.getItem('token');

  if (!token) {
    Swal.fire('Error', 'Debes iniciar sesión para cambiar la contraseña.', 'error');
    return;
  }

  const { value: formValues } = await Swal.fire({
    title: 'Cambiar contraseña',
    html: `
      <input id="pass-actual" type="password" class="swal2-input" placeholder="Contraseña actual">
      <input id="pass-nueva" type="password" class="swal2-input" placeholder="Nueva contraseña">
    `,
    showCancelButton: true,
    confirmButtonText: 'Guardar',
    cancelButtonText: 'Cancelar',
    preConfirm: () => {
      const actual = document.getElementById('pass-actual').value.trim();
      const nueva = document.getElementById('pass-nueva').value.trim();
      if (!actual || !nueva) {
        Swal.showValidationMessage('Por favor completa ambos campos');
        return false;
      }
      return { actual, nueva };
    }
  });

  if (!formValues) return;

  try {
    const res = await fetch(`${API_BASE_URL}/cambiar-password`, {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formValues)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al cambiar contraseña');

    await Swal.fire('✅ Éxito', 'Contraseña actualizada correctamente. Vuelve a iniciar sesión.', 'success');
    localStorage.clear();
    window.location.href = 'index.html';

  } catch (err) {
    Swal.fire('❌ Error', err.message || 'No se pudo cambiar la contraseña.', 'error');
  }
}

// ===================================================
// 🚪 Cerrar sesión
// ===================================================
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
