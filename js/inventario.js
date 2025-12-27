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
     MODALES (ORIGINALES – FUNCIONALES)
  ====================================================== */

  async function modalNuevoInsumo() {
    const { value: form } = await Swal.fire({
      title: "Nuevo Insumo",
      html: `
        <input id="codigo" class="swal2-input" placeholder="Código">
        <input id="nombre" class="swal2-input" placeholder="Nombre">
        <select id="tipo" class="swal2-input">
          <option value="STOCK">STOCK</option>
          <option value="DIRECTO">DIRECTO</option>
        </select>
        <input id="unidad" class="swal2-input" placeholder="Unidad">
        <input id="min_stock" type="number" class="swal2-input" placeholder="Stock mínimo">
      `,
      showCancelButton: true,
      confirmButtonText: "Crear",
      preConfirm: () => ({
        codigo: codigo.value.trim(),
        nombre: nombre.value.trim(),
        tipo: tipo.value,
        unidad: unidad.value.trim(),
        min_stock: min_stock.value
      })
    });

    if (!form) return;

    await apiFetch('/inventario/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });

    Swal.fire('✅ Guardado');
    cargarInventario();
  }

  async function modalEliminar(codigo, localidad) {
    const ok = await Swal.fire({
      title: `Eliminar ${codigo}`,
      text: `Localidad: ${localidad}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33'
    });

    if (!ok.isConfirmed) return;

    await apiFetch(`/inventario/${codigo}/${localidad}`, { method: 'DELETE' });
    Swal.fire('✅ Eliminado');
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
        <select id="locX" class="swal2-input">
          <option value="MATRIZ">MATRIZ</option>
          <option value="SUCURSAL">SUCURSAL</option>
        </select>
        <input type="file" id="fileX" class="swal2-file" accept=".xlsx">
      `,
      showCancelButton: true,
      confirmButtonText: "Subir",
      preConfirm: () => {
        const file = document.getElementById('fileX').files[0];
        if (!file) return Swal.showValidationMessage('Selecciona archivo');
        return { file, localidad: locX.value };
      }
    });

    if (!f) return;

    const fd = new FormData();
    fd.append('file', f.file);
    fd.append('localidad', f.localidad);

    await apiFetch('/inventario/import', { method: 'POST', body: fd });
    Swal.fire('✅ Importado');
    cargarInventario();
  }

  async function modalStock(codigo, localidad) {
    const { value: form } = await Swal.fire({
      title: `Stock · ${codigo}`,
      html: `
        <input id="qty" type="number" class="swal2-input" placeholder="Cantidad">
        <select id="tipo" class="swal2-input">
          <option value="sumar">Sumar</option>
          <option value="restar">Restar</option>
        </select>
        <input id="motivo" class="swal2-input" placeholder="Motivo (solo resta)">
      `,
      showCancelButton: true,
      confirmButtonText: "Aplicar",
      preConfirm: () => ({
        codigo,
        qty: Number(qty.value),
        tipo: tipo.value,
        motivo: motivo.value,
        localidad
      })
    });

    if (!form || !form.qty) return;

    await apiFetch('/inventario/stock-adjust', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });

    Swal.fire('✅ Stock actualizado');
    cargarInventario();
  }

  async function modalEditar(codigo, localidad) {
    const res = await apiFetch(`/inventario/info/${codigo}/${localidad}`);
    const data = await safeJson(res);

    const { value: form } = await Swal.fire({
      title: `Editar ${codigo}`,
      html: `
        <input id="nombre" class="swal2-input" value="${data.nombre}">
        <input id="unidad" class="swal2-input" value="${data.unidad ?? ''}">
        <input id="min_stock" type="number" class="swal2-input" value="${data.min_stock}">
      `,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      preConfirm: () => ({
        nombre: nombre.value.trim(),
        unidad: unidad.value.trim(),
        min_stock: Number(min_stock.value)
      })
    });

    if (!form) return;

    await apiFetch(`/inventario/update/${codigo}/${localidad}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });

    Swal.fire('✅ Guardado');
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
