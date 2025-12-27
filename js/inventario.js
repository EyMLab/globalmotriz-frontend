document.addEventListener('DOMContentLoaded', () => {

  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';
  const token = localStorage.getItem('token');

  if (!token) {
    localStorage.clear();
    window.location.href = 'index.html';
    return;
  }

  // ======================================================
  // ESTADO GLOBAL
  // ======================================================
  const state = {
    page: 1,
    pageSize: 15,
    total: 0,
    q: '',
    tipo: '',
    estado: '',
    localidad: '',
    rol: '',
    localidadUsuario: '',
    esAdmin: false,
    esBodega: false,
    esAsesor: false
  };

  // ======================================================
  // DOM
  // ======================================================
  const tbody = document.getElementById('tablaInventario');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const pageInfo = document.getElementById('page-info');

  const inputQ       = document.getElementById('filtro-q');
  const selTipo      = document.getElementById('filtro-tipo');
  const selEstado    = document.getElementById('filtro-estado');
  const selLocalidad = document.getElementById('filtro-localidad');

  const btnNuevo     = document.getElementById('btnNuevo');
  const btnImportar  = document.getElementById('btnImportar');
  const btnPlantilla = document.getElementById('btnPlantilla');

  // ======================================================
  // HELPERS
  // ======================================================
  function redirectLogin() {
    localStorage.clear();
    window.location.href = 'index.html';
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
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

  async function safeJson(res) {
    try { return await res.json(); } catch { return null; }
  }

  function debounce(fn, delay = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  }

  // ======================================================
  // VERIFICAR SESIÓN
  // ======================================================
  verificarSesion();

  async function verificarSesion(reintentos = 2) {
    try {
      const res = await apiFetch('/auth/me');
      if (!res || !res.ok) throw new Error();

      const data = await safeJson(res);

      state.rol = data.rol;
      state.localidadUsuario = data.localidad || '';

      state.esAdmin  = data.rol === 'admin';
      state.esBodega = data.rol === 'bodega';
      state.esAsesor = data.rol === 'asesor';

      if (!state.esAdmin && !state.esBodega && !state.esAsesor) {
        Swal.fire('Acceso denegado', 'No tienes permiso para Inventario', 'error');
        window.location.href = 'dashboard.html';
        return;
      }

      configurarVistaPorRol();
      cargarInventario();

    } catch {
      if (reintentos > 0) {
        setTimeout(() => verificarSesion(reintentos - 1), 1200);
      } else {
        Swal.fire('Error', 'No se pudo verificar sesión', 'error');
        redirectLogin();
      }
    }
  }

  // ======================================================
  // CONFIGURACIÓN SEGÚN ROL
  // ======================================================
  function configurarVistaPorRol() {
    if (!state.esAsesor) return;

    // Ocultar botones
    [btnNuevo, btnImportar, btnPlantilla].forEach(btn => {
      if (btn) btn.style.display = 'none';
    });

    // Ocultar columna acciones
    const thAcciones = document.querySelector('.col-acciones');
    if (thAcciones) thAcciones.style.display = 'none';

    // Fijar localidad
    selLocalidad.innerHTML = `<option value="${state.localidadUsuario}">${state.localidadUsuario}</option>`;
    selLocalidad.value = state.localidadUsuario;
    selLocalidad.disabled = true;

    state.localidad = state.localidadUsuario;
  }

  // ======================================================
  // EVENTOS FILTROS
  // ======================================================
  inputQ.addEventListener('input', debounce(() => {
    state.q = inputQ.value.trim();
    state.page = 1;
    cargarInventario();
  }));

  selTipo.addEventListener('change', () => {
    state.tipo = selTipo.value;
    state.page = 1;
    cargarInventario();
  });

  selEstado.addEventListener('change', () => {
    state.estado = selEstado.value;
    state.page = 1;
    cargarInventario();
  });

  selLocalidad.addEventListener('change', () => {
    state.localidad = selLocalidad.value;
    state.page = 1;
    cargarInventario();
  });

  btnPrev.onclick = () => {
    if (state.page > 1) {
      state.page--;
      cargarInventario();
    }
  };

  btnNext.onclick = () => {
    const max = Math.ceil(state.total / state.pageSize);
    if (state.page < max) {
      state.page++;
      cargarInventario();
    }
  };

  // ======================================================
  // CARGAR INVENTARIO
  // ======================================================
  async function cargarInventario() {
    try {
      const params = new URLSearchParams({
        page: state.page,
        pageSize: state.pageSize
      });

      if (state.q) params.append('q', state.q);
      if (state.tipo) params.append('tipo', state.tipo);
      if (state.estado) params.append('estado', state.estado);
      if (state.localidad) params.append('localidad', state.localidad);

      const res = await apiFetch(`/inventario/list?${params.toString()}`);
      if (!res || !res.ok) throw new Error();

      const data = await safeJson(res);

      state.page = data.page;
      state.pageSize = data.pageSize;
      state.total = data.total;

      renderTabla(data.items);
      renderPaginacion();

    } catch {
      Swal.fire('Error', 'No se pudo cargar inventario', 'error');
    }
  }

  // ======================================================
  // RENDER TABLA
  // ======================================================
  function renderTabla(items) {
    tbody.innerHTML = '';

    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="${state.esAsesor ? 8 : 9}">Sin resultados</td></tr>`;
      return;
    }

    items.forEach(item => {
      const color =
        item.estado === 'green' ? 'green' :
        item.estado === 'yellow' ? 'orange' : 'red';

      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td>${item.codigo}</td>
        <td>${item.nombre}</td>
        <td>${item.tipo}</td>
        <td>${item.unidad ?? '-'}</td>
        <td>${item.localidad}</td>
        <td>${item.stock}</td>
        <td>${item.min_stock}</td>
        <td style="font-weight:bold;color:${color}">
          ${item.estado.toUpperCase()}
        </td>
        ${
          state.esAsesor ? '' :
          `<td>
            <button class="btn-obs" onclick="modalEditar('${item.codigo}', '${item.localidad}')">Editar</button>
            <button class="btn-obs" onclick="modalStock('${item.codigo}', '${item.localidad}')">Stock</button>
            ${
              state.esAdmin
                ? `<button class="btn-eliminar" onclick="modalEliminar('${item.codigo}', '${item.localidad}')">Eliminar</button>`
                : ''
            }
          </td>`
        }
      `;

      tbody.appendChild(tr);
    });
  }

  function renderPaginacion() {
    const max = Math.max(1, Math.ceil(state.total / state.pageSize));
    pageInfo.textContent = `Página ${state.page} de ${max}`;
    btnPrev.disabled = state.page <= 1;
    btnNext.disabled = state.page >= max;
  }

  // ======================================================
  // BOTONES SUPERIORES
  // ======================================================
  if (!state.esAsesor && btnNuevo)
    btnNuevo.onclick = modalNuevoInsumo;

  if (btnImportar)
    btnImportar.onclick = modalImportarExcel;

  if (btnPlantilla)
    btnPlantilla.onclick = descargarPlantilla;

  // ======================================================
  // MODALES (SE MANTIENEN – MISMA LÓGICA)
  // ======================================================
  // modalNuevoInsumo
  // modalStock
  // modalEliminar
  // modalEditar
  // descargarPlantilla
  // modalImportarExcel
  // 👉 Se mantienen EXACTAMENTE igual que en tu versión
  // 👉 No se tocan para no romper backend ni reglas

  // ======================================================
  // PRIMERA CARGA
  // ======================================================
  cargarInventario();

});
