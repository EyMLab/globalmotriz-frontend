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
    else if (window.location.pathname.includes("finanzas")) pagina = "Finanzas";
    else if (window.location.pathname.includes("insumos")) pagina = "Insumos";
    else if (window.location.pathname.includes("inventario") || window.location.pathname.includes("historial")) {
        pagina = "Inventario";
    }
    else if (window.location.pathname.includes("compras")) pagina = "Compras";
    else if (window.location.pathname.includes("cotizaciones")) pagina = "Cotizaciones";
    else if (window.location.pathname.includes("lpr")) pagina = "Taller";

    // Seguro solo puede ver Taller
    if (rol === 'seguro' && pagina !== 'Taller') {
      window.location.href = 'lpr.html';
      return;
    }

    // Asistente contable solo puede ver Finanzas
    if (rol === 'asistente_contable' && pagina !== 'Finanzas') {
      window.location.href = 'finanzas.html';
      return;
    }

    // ============================================
    // Enlaces según rol
    // ============================================
    const enlaceUsuarios = ['admin', 'control'].includes(rol)
      ? `<a href="usuarios.html" class="${pagina === 'Usuarios' ? 'active' : ''}">Usuarios</a>`
      : "";

    const enlaceInsumos = ['admin', 'control', 'bodega', 'asesor'].includes(rol)
      ? `<a href="insumos.html" class="${pagina === 'Insumos' ? 'active' : ''}">Insumos</a>`
      : "";

    const enlaceInventario = ['admin', 'control', 'bodega', 'asesor'].includes(rol)
      ? `<a href="inventario.html" class="${pagina === 'Inventario' ? 'active' : ''}">Inventario</a>`
      : "";

    const enlaceCompras = ['admin', 'control', 'bodega'].includes(rol)
      ? `<a href="compras.html" class="${pagina === 'Compras' ? 'active' : ''}">Compras</a>`
      : "";

    const enlaceCotizaciones = ['admin', 'control'].includes(rol)
      ? `<a href="cotizaciones.html" class="${pagina === 'Cotizaciones' ? 'active' : ''}">Cotizaciones</a>`
      : "";

    const enlaceLPR = ['admin', 'control', 'seguro'].includes(rol)
      ? `<a href="lpr.html" class="${pagina === 'Taller' ? 'active' : ''}">Taller</a>`
      : "";

    const enlaceFacturas = ['admin', 'control'].includes(rol)
      ? `<a href="dashboard.html" class="${pagina === 'Facturas' ? 'active' : ''}">Facturas</a>`
      : "";

    const enlaceFinanzas = ['admin', 'control', 'asistente_contable'].includes(rol)
      ? `<a href="finanzas.html" class="${pagina === 'Finanzas' ? 'active' : ''}">Finanzas</a>`
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
          ${(enlaceInsumos || enlaceInventario || enlaceCompras) ? `
          <div class="nav-dropdown">
            <button class="nav-dropdown-btn ${['Insumos','Inventario','Compras'].includes(pagina) ? 'active' : ''}">Bodega <span class="nav-arrow">&#9662;</span></button>
            <div class="nav-dropdown-menu">
              ${enlaceInsumos}
              ${enlaceInventario}
              ${enlaceCompras}
            </div>
          </div>` : ''}
          ${(enlaceFacturas || enlaceCotizaciones) ? `
          <div class="nav-dropdown">
            <button class="nav-dropdown-btn ${['Facturas','Cotizaciones'].includes(pagina) ? 'active' : ''}">Ventas <span class="nav-arrow">&#9662;</span></button>
            <div class="nav-dropdown-menu">
              ${enlaceFacturas}
              ${enlaceCotizaciones}
            </div>
          </div>` : ''}
          ${enlaceLPR}
          ${enlaceFinanzas}
          ${enlaceUsuarios}
        </nav>

        <div class="nav-right">
          ${['admin', 'control', 'bodega', 'asesor'].includes(rol) ? `
          <div style="position:relative;display:inline-block;" id="notif-bell-container">
            <button class="notif-bell" id="btn-notif-bell" title="Notificaciones">&#128276;
              <span class="notif-badge" id="notif-count" style="display:none;">0</span>
            </button>
            <div class="notif-dropdown" id="notif-dropdown">
              <div class="notif-header">
                <span>Notificaciones</span>
                <button id="btn-leer-todas">Marcar todas leidas</button>
              </div>
              <div id="notif-list"></div>
            </div>
          </div>
          ` : ''}
          <p id="usuario-info" class="usuario-badge">${data.usuario} (${rol})</p>
          <button class="btn-nav" onclick="abrirModalCambioClave()">Cambiar contraseña</button>
          <button id="btn-cerrar-sesion" class="btn-nav logout">Cerrar sesión</button>
        </div>
      </header>
    `;

    const btnCerrar = document.getElementById("btn-cerrar-sesion");
    if (btnCerrar) btnCerrar.addEventListener("click", cerrarSesion);

    // ============================================
    // Notificaciones (campanita)
    // ============================================
    if (['admin', 'control', 'bodega', 'asesor'].includes(rol)) {
      initNotificaciones();
    }

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
// Notificaciones (campanita)
// ===================================================
function initNotificaciones() {
  const bell = document.getElementById('btn-notif-bell');
  const dropdown = document.getElementById('notif-dropdown');
  const countEl = document.getElementById('notif-count');

  if (!bell) return;

  // Toggle dropdown
  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.toggle('open');
    if (isOpen) cargarNotificaciones();
  });

  // Cerrar al click fuera
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#notif-bell-container')) {
      dropdown.classList.remove('open');
    }
  });

  // Marcar todas leidas
  document.getElementById('btn-leer-todas')?.addEventListener('click', async () => {
    try {
      await apiFetch('/cotizaciones/notificaciones/leer-todas', { method: 'PATCH' });
      cargarNotificaciones();
      actualizarContadorNotif();
    } catch (e) { /* ignore */ }
  });

  // Polling cada 60s
  actualizarContadorNotif();
  setInterval(actualizarContadorNotif, 60000);
}

async function actualizarContadorNotif() {
  try {
    const res = await apiFetch('/cotizaciones/notificaciones/count');
    if (!res.ok) return;
    const data = await safeJson(res);
    const countEl = document.getElementById('notif-count');
    if (!countEl) return;
    const n = data.no_leidas || 0;
    countEl.textContent = n;
    countEl.style.display = n > 0 ? 'flex' : 'none';
  } catch (e) { /* ignore */ }
}

async function cargarNotificaciones() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  try {
    const res = await apiFetch('/cotizaciones/notificaciones?limit=15');
    const data = await safeJson(res);
    if (!res.ok || !data.items?.length) {
      list.innerHTML = '<div class="notif-empty">Sin notificaciones</div>';
      return;
    }
    list.innerHTML = data.items.map(n => `
      <div class="notif-item ${n.leida ? '' : 'no-leida'}" onclick="clickNotificacion(${n.id}, ${n.solicitud_id}, ${n.leida})">
        <div>${n.mensaje}</div>
        <div class="notif-fecha">${n.fecha}</div>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = '<div class="notif-empty">Error cargando</div>';
  }
}

async function clickNotificacion(id, solicitudId, leida) {
  if (!leida) {
    try {
      await apiFetch(`/cotizaciones/notificaciones/${id}/leer`, { method: 'PATCH' });
      actualizarContadorNotif();
    } catch (e) { /* ignore */ }
  }
  // Navegar a cotizaciones si no estamos ahi
  if (!window.location.pathname.includes('cotizaciones')) {
    window.location.href = `cotizaciones.html`;
  } else {
    // Si ya estamos, abrir detalle
    if (typeof COT !== 'undefined' && COT.verDetalle) {
      COT.verDetalle(solicitudId);
      document.getElementById('notif-dropdown')?.classList.remove('open');
    }
  }
}

// ===================================================
// Cerrar sesion
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