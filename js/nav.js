// Rol del usuario actual — se asigna al cargar el nav y lo usan las funciones de notificaciones
let _navRol = null;

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
    _navRol = rol; // guardamos para las funciones de notificaciones

    // ============================================
    // Detectar página actual (match exacto por nombre de archivo)
    // ============================================
    const PAGINA_POR_ARCHIVO = {
      'dashboard':      'Facturas',
      'usuarios':       'Usuarios',
      'finanzas':       'Finanzas',
      'insumos':        'Insumos',
      'inventario':     'Inventario',
      'historial':      'Inventario',     // sub-página de inventario
      'compras':        'Compras',
      'cotizaciones':   'Cotizaciones',
      'control-taller': 'ControlTaller',
      'proveedores':    'Proveedores',
      'clientes':       'Clientes',
      'lpr':            'Taller',
      'cumpleanos':     'Cumpleaños',
      'rrhh':           'RRHH',
      'asistencia':     'Asistencia'
    };

    const archivo = window.location.pathname.split('/').pop().replace('.html', '');
    const pagina = PAGINA_POR_ARCHIVO[archivo] || 'Facturas';

    // Bloqueo si intenta acceder a Proveedores o Clientes sin ser admin ni control
    if (!['admin', 'control'].includes(rol) && (pagina === 'Proveedores' || pagina === 'Clientes')) {
      window.location.href = 'dashboard.html';
      return;
    }

    // Seguro solo puede ver Taller
    if (rol === 'seguro' && pagina !== 'Taller') {
      window.location.href = 'lpr.html';
      return;
    }

    // Asistente contable solo puede ver Finanzas, RRHH, Cumpleanos y ControlTaller
    if (rol === 'asistente_contable' && pagina !== 'Finanzas' && pagina !== 'RRHH' && pagina !== 'Cumpleaños' && pagina !== 'ControlTaller') {
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

    const enlaceCotizaciones = ['admin', 'control', 'bodega', 'asesor'].includes(rol)
      ? `<a href="cotizaciones.html" class="${pagina === 'Cotizaciones' ? 'active' : ''}">Cotizaciones</a>`
      : "";

    const enlaceLPR = ['admin', 'control', 'seguro'].includes(rol)
      ? `<a href="lpr.html" class="${pagina === 'Taller' ? 'active' : ''}">Monitoreo LPR</a>`
      : "";

    const enlaceControlTaller = ['admin', 'control', 'asistente_contable'].includes(rol)
      ? `<a href="control-taller.html" class="${pagina === 'ControlTaller' ? 'active' : ''}">Control Taller</a>`
      : "";

    const enlaceAsistencia = rol === 'admin'
      ? `<a href="asistencia.html" class="${pagina === 'Asistencia' ? 'active' : ''}">Asistencia</a>`
      : "";

    const enlaceRRHH = ['admin', 'control', 'asistente_contable'].includes(rol)
      ? `<a href="rrhh.html" class="${pagina === 'RRHH' ? 'active' : ''}">Empleados</a>`
      : "";

    const enlaceCumpleanos = ['admin', 'control', 'asistente_contable'].includes(rol)
      ? `<a href="cumpleanos.html" class="${pagina === 'Cumpleaños' ? 'active' : ''}">Cumpleaños</a>`
      : "";

    const enlaceFacturas = ['admin', 'control'].includes(rol)
      ? `<a href="dashboard.html" class="${pagina === 'Facturas' ? 'active' : ''}">Facturas</a>`
      : "";

    const enlaceFinanzas = ['admin', 'control', 'asistente_contable'].includes(rol)
      ? `<a href="finanzas.html" class="${pagina === 'Finanzas' ? 'active' : ''}">Finanzas</a>`
      : "";

    const enlaceProveedores = ['admin', 'control'].includes(rol)
      ? `<a href="proveedores.html" class="${pagina === 'Proveedores' ? 'active' : ''}">Cuentas x Pagar</a>`
      : "";

    const enlaceClientes = ['admin', 'control'].includes(rol)
      ? `<a href="clientes.html" class="${pagina === 'Clientes' ? 'active' : ''}">Cuentas x Cobrar</a>`
      : "";


    // ============================================
    // Renderizado del navbar
    // ============================================

    navContainer.innerHTML = `
      <header class="navbar">
        <div class="nav-left">
          <img src="img/logo.png" alt="Logo" class="logo-header">
          <span class="nav-title">${pagina === 'Taller' ? 'Monitoreo LPR' : pagina}</span>
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
          ${(enlaceLPR || enlaceControlTaller) ? `
          <div class="nav-dropdown">
            <button class="nav-dropdown-btn ${['Taller','ControlTaller'].includes(pagina) ? 'active' : ''}">Taller <span class="nav-arrow">&#9662;</span></button>
            <div class="nav-dropdown-menu">
              ${enlaceLPR}
              ${enlaceControlTaller}
            </div>
          </div>` : ''}
          ${(enlaceAsistencia || enlaceRRHH || enlaceCumpleanos) ? `
          <div class="nav-dropdown">
            <button class="nav-dropdown-btn ${['Asistencia','RRHH','Cumpleaños'].includes(pagina) ? 'active' : ''}">RRHH <span class="nav-arrow">&#9662;</span></button>
            <div class="nav-dropdown-menu">
              ${enlaceAsistencia}
              ${enlaceRRHH}
              ${enlaceCumpleanos}
            </div>
          </div>` : ''}
          ${enlaceFinanzas}
          ${(enlaceProveedores || enlaceClientes) ? `
          <div class="nav-dropdown">
            <button class="nav-dropdown-btn ${['Proveedores','Clientes'].includes(pagina) ? 'active' : ''}">Contabilidad <span class="nav-arrow">&#9662;</span></button>
            <div class="nav-dropdown-menu">
              ${enlaceProveedores}
              ${enlaceClientes}
            </div>
          </div>` : ''}
          ${enlaceUsuarios}
        </nav>

        <div class="nav-right">
          ${['admin', 'control', 'bodega', 'asesor', 'asistente_contable'].includes(rol) ? `
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
    if (['admin', 'control', 'bodega', 'asesor', 'asistente_contable'].includes(rol)) {
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

  // Marcar todas leidas (ambos módulos)
  document.getElementById('btn-leer-todas')?.addEventListener('click', async () => {
    try {
      const promises = [
        apiFetch('/cotizaciones/notificaciones/leer-todas', { method: 'PATCH' })
      ];
      if (ROLES_RRHH_NOTIF.includes(_navRol)) {
        promises.push(apiFetch('/rrhh/notificaciones/leer-todas', { method: 'PATCH' }).catch(() => {}));
      }
      await Promise.all(promises);
      cargarNotificaciones();
      actualizarContadorNotif();
    } catch (e) { /* ignore */ }
  });

  // Polling cada 60s
  actualizarContadorNotif();
  setInterval(actualizarContadorNotif, 60000);
}

const ROLES_RRHH_NOTIF = ['admin', 'asistente_contable'];

async function actualizarContadorNotif() {
  try {
    const [resCot, resRrhh] = await Promise.all([
      apiFetch('/cotizaciones/notificaciones/count'),
      ROLES_RRHH_NOTIF.includes(_navRol)
        ? apiFetch('/rrhh/notificaciones/count').catch(() => null)
        : Promise.resolve(null)
    ]);
    const countEl = document.getElementById('notif-count');
    if (!countEl) return;
    let total = 0;
    if (resCot && resCot.ok) {
      const d = await safeJson(resCot);
      total += d.no_leidas || 0;
    }
    if (resRrhh && resRrhh.ok) {
      const d2 = await safeJson(resRrhh);
      total += d2.no_leidas || 0;
    }
    countEl.textContent = total;
    countEl.style.display = total > 0 ? 'flex' : 'none';
  } catch (e) { /* ignore */ }
}

async function cargarNotificaciones() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  try {
    const [resCot, resRrhh] = await Promise.all([
      apiFetch('/cotizaciones/notificaciones?limit=15'),
      ROLES_RRHH_NOTIF.includes(_navRol)
        ? apiFetch('/rrhh/notificaciones?limit=15').catch(() => null)
        : Promise.resolve(null)
    ]);

    let todas = [];

    if (resCot && resCot.ok) {
      const dataCot = await safeJson(resCot);
      if (dataCot.items) {
        todas = todas.concat(dataCot.items.map(n => ({ ...n, modulo: 'cotizaciones' })));
      }
    }

    if (resRrhh && resRrhh.ok) {
      const dataRrhh = await safeJson(resRrhh);
      if (dataRrhh.items) {
        todas = todas.concat(dataRrhh.items.map(n => ({ ...n, modulo: n.modulo || 'rrhh' })));
      }
    }

    if (!todas.length) {
      list.innerHTML = '<div class="notif-empty">Sin notificaciones</div>';
      return;
    }

    todas.sort((a, b) => (b.id || 0) - (a.id || 0));

    list.innerHTML = todas.slice(0, 20).map(n => {
      const moduloTag = n.modulo === 'rrhh' ? '<span class="notif-tag notif-tag-rrhh">RRHH</span> ' : '';
      return `<div class="notif-item ${n.leida ? '' : 'no-leida'}" onclick="clickNotificacion(${n.id}, ${n.solicitud_id || 'null'}, ${n.leida}, '${n.modulo}')">
        <div>${moduloTag}${n.mensaje}</div>
        <div class="notif-fecha">${n.fecha}</div>
      </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = '<div class="notif-empty">Error cargando</div>';
  }
}

async function clickNotificacion(id, solicitudId, leida, modulo) {
  if (!leida) {
    try {
      const endpoint = modulo === 'rrhh'
        ? `/rrhh/notificaciones/${id}/leer`
        : `/cotizaciones/notificaciones/${id}/leer`;
      await apiFetch(endpoint, { method: 'PATCH' });
      actualizarContadorNotif();
    } catch (e) { /* ignore */ }
  }

  if (modulo === 'rrhh') {
    if (!window.location.pathname.includes('rrhh')) {
      window.location.href = 'rrhh.html';
    } else {
      document.getElementById('notif-dropdown')?.classList.remove('open');
    }
    return;
  }

  if (!window.location.pathname.includes('cotizaciones')) {
    window.location.href = `cotizaciones.html`;
  } else {
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
      clearAuthStorage();
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