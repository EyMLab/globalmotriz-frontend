document.addEventListener('DOMContentLoaded', () => {

  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';
  const token = localStorage.getItem('token');

  if (!token) {
    localStorage.clear();
    window.location.href = 'index.html';
    return;
  }

  /* ======================================================
     ESTADO GLOBAL
  ====================================================== */
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

  /* ======================================================
     DOM
  ====================================================== */
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

  /* ======================================================
     HELPERS
  ====================================================== */
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

  /* ======================================================
     VERIFICAR SESIÓN
  ====================================================== */
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

  /* ======================================================
     CONFIGURACIÓN SEGÚN ROL
  ====================================================== */
  function configurarVistaPorRol() {
    if (!state.esAsesor) return;

    [btnNuevo, btnImportar, btnPlantilla].forEach(btn => {
      if (btn) btn.style.display = 'none';
    });

    const thAcciones = document.querySelector('.col-acciones');
    if (thAcciones) thAcciones.style.display = 'none';

    selLocalidad.innerHTML = `<option value="${state.localidadUsuario}">${state.localidadUsuario}</option>`;
    selLocalidad.value = state.localidadUsuario;
    selLocalidad.disabled = true;

    state.localidad = state.localidadUsuario;
  }

  /* ======================================================
     EVENTOS FILTROS
  ====================================================== */
  inputQ.addEventListener('input', debounce(() => {
    state.q = inputQ.value.trim();
    state.page = 1;
    cargarInventario();
  }));

  [selTipo, selEstado, selLocalidad].forEach(el => {
    el.addEventListener('change', () => {
      state[el === selTipo ? 'tipo' : el === selEstado ? 'estado' : 'localidad'] = el.value;
      state.page = 1;
      cargarInventario();
    });
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

  /* ======================================================
     CARGAR INVENTARIO
  ====================================================== */
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

  /* ======================================================
     RENDER TABLA
  ====================================================== */
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
        <td style="font-weight:bold;color:${color}">${item.estado.toUpperCase()}</td>
        ${
          state.esAsesor ? '' :
          `<td>
            <button class="btn-obs" onclick="modalEditar('${item.codigo}','${item.localidad}')">Editar</button>
            <button class="btn-obs" onclick="modalStock('${item.codigo}','${item.localidad}')">Stock</button>
            ${state.esAdmin ? `<button class="btn-eliminar" onclick="modalEliminar('${item.codigo}','${item.localidad}')">Eliminar</button>` : ''}
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

  /* ======================================================
     MODALES MEJORADOS
  ====================================================== */

  async function modalNuevoInsumo() {
    const { value: form } = await Swal.fire({
      title: "Nuevo Insumo",
      html: `
        <div class="form-row">
          <div class="form-group">
            <label>Código</label>
            <input id="codigo" class="swal2-input" placeholder="Ej: INS001">
          </div>
          <div class="form-group">
            <label>Tipo</label>
            <select id="tipo" class="swal2-select">
              <option value="STOCK">STOCK</option>
              <option value="DIRECTO">DIRECTO</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label>Nombre / Descripción</label>
          <input id="nombre" class="swal2-input" placeholder="Ej: Focos 2 contactos">
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Unidad</label>
            <input id="unidad" class="swal2-input" placeholder="Ej: UNIDAD, KG">
          </div>
          <div class="form-group">
            <label>Stock Mínimo</label>
            <input id="min_stock" type="number" class="swal2-input" placeholder="0" value="0">
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Crear",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const codigo = document.getElementById('codigo').value.trim();
        const nombre = document.getElementById('nombre').value.trim();
        const tipo = document.getElementById('tipo').value;
        const unidad = document.getElementById('unidad').value.trim();
        const min_stock = document.getElementById('min_stock').value;

        if (!codigo || !nombre) {
          Swal.showValidationMessage('Código y Nombre son obligatorios');
          return false;
        }

        return { codigo, nombre, tipo, unidad, min_stock };
      }
    });

    if (!form) return;

    await apiFetch('/inventario/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });

    Swal.fire('✅ Insumo creado', '', 'success');
    cargarInventario();
  }

  async function modalEditar(codigo, localidad) {
    const res = await apiFetch(`/inventario/info/${codigo}/${localidad}`);
    const data = await safeJson(res);

    if (!data) {
      Swal.fire('Error', 'No se pudo cargar la información', 'error');
      return;
    }

    const { value: form } = await Swal.fire({
      title: `Editar ${codigo}`,
      html: `
        <div class="form-group">
          <label>Nombre / Descripción</label>
          <input id="nombre" class="swal2-input" value="${data.nombre}" placeholder="Nombre del insumo">
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Unidad</label>
            <input id="unidad" class="swal2-input" value="${data.unidad ?? ''}" placeholder="Ej: UNIDAD, KG">
          </div>
          <div class="form-group">
            <label>Stock Mínimo</label>
            <input id="min_stock" type="number" class="swal2-input" value="${data.min_stock}" placeholder="0">
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const nombre = document.getElementById('nombre').value.trim();
        const unidad = document.getElementById('unidad').value.trim();
        const min_stock = Number(document.getElementById('min_stock').value);

        if (!nombre) {
          Swal.showValidationMessage('El nombre es obligatorio');
          return false;
        }

        return { nombre, unidad, min_stock };
      }
    });

    if (!form) return;

    await apiFetch(`/inventario/update/${codigo}/${localidad}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });

    Swal.fire('✅ Insumo actualizado', '', 'success');
    cargarInventario();
  }

  async function modalStock(codigo, localidad) {
    const { value: form } = await Swal.fire({
      title: `Stock • ${codigo}`,
      html: `
        <div class="form-group">
          <label>Cantidad</label>
          <input id="qty" type="number" class="swal2-input" placeholder="Ingresa la cantidad" min="1">
        </div>
        
        <div class="form-group">
          <label>Operación</label>
          <select id="tipo" class="swal2-select">
            <option value="sumar">Sumar (+)</option>
            <option value="restar">Restar (-)</option>
          </select>
        </div>
        
        <div class="form-group">
          <label>Motivo (opcional, recomendado para restas)</label>
          <textarea id="motivo" class="swal2-textarea" placeholder="Describe el motivo de la operación..."></textarea>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Aplicar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const qty = Number(document.getElementById('qty').value);
        const tipo = document.getElementById('tipo').value;
        const motivo = document.getElementById('motivo').value.trim();

        if (!qty || qty <= 0) {
          Swal.showValidationMessage('La cantidad debe ser mayor a 0');
          return false;
        }

        return {
          codigo,
          qty,
          tipo,
          motivo,
          localidad
        };
      }
    });

    if (!form) return;

    await apiFetch('/inventario/stock-adjust', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });

    Swal.fire('✅ Stock actualizado', '', 'success');
    cargarInventario();
  }

  async function modalEliminar(codigo, localidad) {
    const ok = await Swal.fire({
      title: `¿Eliminar ${codigo}?`,
      text: `Localidad: ${localidad}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (!ok.isConfirmed) return;

    await apiFetch(`/inventario/${codigo}/${localidad}`, { method: 'DELETE' });
    Swal.fire('✅ Insumo eliminado', '', 'success');
    cargarInventario();
  }

  async function descargarPlantilla() {
    const res = await apiFetch('/inventario/plantilla');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_inventario.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function modalImportarExcel() {
    const { value: f } = await Swal.fire({
      title: "Importar inventario",
      html: `
        <div class="form-group">
          <label>Localidad</label>
          <select id="locX" class="swal2-select">
            <option value="MATRIZ">MATRIZ</option>
            <option value="SUCURSAL">SUCURSAL</option>
          </select>
        </div>

        <div class="form-group">
          <label>Archivo Excel (.xlsx)</label>
          <input type="file" id="fileX" class="swal2-input" accept=".xlsx" style="padding:10px;">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Subir",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const file = document.getElementById('fileX').files[0];
        const localidad = document.getElementById('locX').value;

        if (!file) {
          Swal.showValidationMessage('Selecciona un archivo');
          return false;
        }

        return { file, localidad };
      }
    });

    if (!f) return;

    const fd = new FormData();
    fd.append('file', f.file);
    fd.append('localidad', f.localidad);

    await apiFetch('/inventario/import', { method: 'POST', body: fd });
    Swal.fire('✅ Inventario importado', '', 'success');
    cargarInventario();
  }

  /* ======================================================
     BOTONES SUPERIORES
  ====================================================== */
  if (!state.esAsesor && btnNuevo) btnNuevo.onclick = modalNuevoInsumo;
  if (btnImportar) btnImportar.onclick = modalImportarExcel;
  if (btnPlantilla) btnPlantilla.onclick = descargarPlantilla;

  /* ======================================================
     EXPONER FUNCIONES (OBLIGATORIO)
  ====================================================== */
  window.modalEditar = modalEditar;
  window.modalStock = modalStock;
  window.modalEliminar = modalEliminar;
  window.modalNuevoInsumo = modalNuevoInsumo;
  window.modalImportarExcel = modalImportarExcel;
  window.descargarPlantilla = descargarPlantilla;

  cargarInventario();
});