document.addEventListener('DOMContentLoaded', async () => {
  const navContainer = document.getElementById('nav-container');

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
    const rol = data.rol;

    // ============================================
    // Detectar página actual
    // ============================================
    let pagina = "Facturas";

    if (window.location.pathname.includes("usuarios")) pagina = "Usuarios";
    else if (window.location.pathname.includes("insumos")) pagina = "Insumos";
    else if (window.location.pathname.includes("inventario") || window.location.pathname.includes("historial")) {
        pagina = "Inventario";
    }
    else if (window.location.pathname.includes("compras")) pagina = "Compras";
    else if (window.location.pathname.includes("lpr")) pagina = "Taller";

    // Seguro solo puede ver Taller
    if (rol === 'seguro' && pagina !== 'Taller') {
      window.location.href = 'lpr.html';
      return;
    }

    // ============================================
    // Enlaces según rol
    // ============================================
    const enlaceUsuarios = rol === 'admin'
      ? `<a href="usuarios.html" class="${pagina === 'Usuarios' ? 'active' : ''}">Usuarios</a>`
      : "";

    const enlaceInsumos = ['admin', 'bodega', 'asesor'].includes(rol)
      ? `<a href="insumos.html" class="${pagina === 'Insumos' ? 'active' : ''}">Insumos</a>`
      : "";

    const enlaceInventario = ['admin', 'bodega', 'asesor'].includes(rol)
      ? `<a href="inventario.html" class="${pagina === 'Inventario' ? 'active' : ''}">Inventario</a>`
      : "";

    const enlaceCompras = ['admin', 'bodega'].includes(rol)
      ? `<a href="compras.html" class="${pagina === 'Compras' ? 'active' : ''}">Compras</a>`
      : "";

    const enlaceLPR = ['admin', 'seguro'].includes(rol)
      ? `<a href="lpr.html" class="${pagina === 'Taller' ? 'active' : ''}">Taller</a>`
      : "";

    const enlaceFacturas = rol === 'admin'
      ? `<a href="dashboard.html" class="${pagina === 'Facturas' ? 'active' : ''}">Facturas</a>`
      : "";

    // ============================================
    // Renderizado del navbar
    // ============================================

    navContainer.innerHTML = `
      <header class="navbar">
        <div class="nav-left">
          <img src="img/logo.png" alt="Logo" class="logo-header">
          <span class="nav-title">${pagina}</span>
        </div>

        <nav class="nav-center nav-links">
          ${enlaceFacturas}
          ${enlaceInsumos}
          ${enlaceInventario}
          ${enlaceCompras}
          ${enlaceLPR}
          ${enlaceUsuarios}
        </nav>

        <div class="nav-right">
          <p id="usuario-info" class="usuario-badge">${data.usuario} (${rol})</p>
          <button class="btn-nav" onclick="abrirModalCambioClave()">Cambiar contraseña</button>
          <button id="btn-cerrar-sesion" class="btn-nav logout">Cerrar sesión</button>
        </div>
      </header>
    `;

    const btnCerrar = document.getElementById("btn-cerrar-sesion");
    if (btnCerrar) btnCerrar.addEventListener("click", cerrarSesion);

  } catch (err) {
    console.error("❌ Error al cargar nav:", err.message);
    Swal.fire("Error", "No se pudo conectar con el servidor.", "error");
  }
});


// ===================================================
// 🔐 Modal para cambiar contraseña
// ===================================================
async function abrirModalCambioClave() {
  if (!getToken()) {
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
    const res = await apiFetch('/cambiar-password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formValues)
    });

    const data = await safeJson(res);
    if (!res.ok) throw new Error(data?.error || 'Error al cambiar contraseña');

    await Swal.fire('Contraseña actualizada', 'Vuelve a iniciar sesión.', 'success');
    redirectLogin();

  } catch (err) {
    Swal.fire('Error', err.message || 'No se pudo cambiar la contraseña.', 'error');
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
    confirmButtonColor: '#d33'
  }).then(result => {
    if (result.isConfirmed) {
      localStorage.clear();
      window.location.href = 'index.html';
    }
  });
}


// ===================================================
// 🟢 Mantener backend activo
// ===================================================
(function () {
  if (!getToken()) return;

  function keepBackendAwake() {
    apiFetch('/health').catch(() => {});
  }

  keepBackendAwake();
  setInterval(keepBackendAwake, 10 * 60 * 1000);
})();