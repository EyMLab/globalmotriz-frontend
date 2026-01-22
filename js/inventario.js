document.addEventListener('DOMContentLoaded', () => {

  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';
  const token = localStorage.getItem('token');

  // 1. Verificación inicial de token
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
      REFERENCIAS AL DOM
  ====================================================== */
  const tbody = document.getElementById('tablaInventario');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const pageInfo = document.getElementById('page-info');

  // Filtros
  const inputQ       = document.getElementById('filtro-q');
  const selTipo      = document.getElementById('filtro-tipo');
  const selEstado    = document.getElementById('filtro-estado');
  const selLocalidad = document.getElementById('filtro-localidad');

  // Botones Superiores
  const btnNuevo     = document.getElementById('btnNuevo');
  const btnTraslado  = document.getElementById('btnTraslado'); // Nuevo botón
  const btnImportar  = document.getElementById('btnImportar');
  const btnPlantilla = document.getElementById('btnPlantilla');

  /* ======================================================
      HELPERS (Utilidades)
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
      VERIFICAR SESIÓN Y ROL
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

      // Seguridad Frontend: Si no tiene rol válido, fuera
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

  function configurarVistaPorRol() {
    // Si es ASESOR, ocultamos botones de acción masiva
    if (state.esAsesor) {
      const botones = [btnNuevo, btnImportar, btnPlantilla, btnTraslado];
      botones.forEach(btn => {
        if (btn) btn.style.display = 'none';
      });

      // Ocultar columna de acciones en la tabla
      const thAcciones = document.querySelector('.col-acciones');
      if (thAcciones) thAcciones.style.display = 'none';

      // Forzar filtro de localidad a su localidad asignada
      if (selLocalidad) {
        selLocalidad.innerHTML = `<option value="${state.localidadUsuario}">${state.localidadUsuario}</option>`;
        selLocalidad.value = state.localidadUsuario;
        selLocalidad.disabled = true;
      }
      state.localidad = state.localidadUsuario;
    }
  }

  /* ======================================================
      EVENTOS FILTROS & PAGINACIÓN
  ====================================================== */
  if (inputQ) {
    inputQ.addEventListener('input', debounce(() => {
      state.q = inputQ.value.trim();
      state.page = 1;
      cargarInventario();
    }));
  }

  [selTipo, selEstado, selLocalidad].forEach(el => {
    if (el) {
      el.addEventListener('change', () => {
        if (el === selTipo) state.tipo = el.value;
        if (el === selEstado) state.estado = el.value;
        if (el === selLocalidad) state.localidad = el.value;
        state.page = 1;
        cargarInventario();
      });
    }
  });

  if (btnPrev) {
    btnPrev.onclick = () => {
      if (state.page > 1) {
        state.page--;
        cargarInventario();
      }
    };
  }

  if (btnNext) {
    btnNext.onclick = () => {
      const max = Math.ceil(state.total / state.pageSize);
      if (state.page < max) {
        state.page++;
        cargarInventario();
      }
    };
  }

  /* ======================================================
      EVENTOS BOTONES SUPERIORES
  ====================================================== */
  if (btnNuevo && !state.esAsesor) btnNuevo.onclick = modalNuevoInsumo;
  if (btnTraslado && !state.esAsesor) btnTraslado.onclick = modalTraslado; // <--- BOTÓN TRASLADO
  if (btnImportar) btnImportar.onclick = modalImportarExcel;
  if (btnPlantilla) btnPlantilla.onclick = descargarPlantilla;

  /* ======================================================
      CARGAR DATA (CORE)
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

      // Loader simple en tabla
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Cargando...</td></tr>';

      const res = await apiFetch(`/inventario/list?${params.toString()}`);
      if (!res || !res.ok) throw new Error();

      const data = await safeJson(res);

      state.page = data.page;
      state.pageSize = data.pageSize;
      state.total = data.total;

      renderTabla(data.items);
      renderPaginacion();

    } catch {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:red;">Error al cargar datos</td></tr>';
    }
  }

  function renderTabla(items) {
    tbody.innerHTML = '';

    if (!items || items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${state.esAsesor ? 8 : 9}" style="text-align:center;">Sin resultados</td></tr>`;
      return;
    }

    items.forEach(item => {
      // Colores de estado
      const colorStyle =
        item.estado === 'green' ? 'color:#16a34a; font-weight:700;' : // Verde
        item.estado === 'yellow' ? 'color:#d97706; font-weight:700;' : // Naranja
        'color:#dc2626; font-weight:700;'; // Rojo

      const tr = document.createElement('tr');
      
      // HTML de la fila
      let html = `
        <td>${item.codigo}</td>
        <td style="text-align:left;">${item.nombre}</td>
        <td>${item.tipo}</td>
        <td>${item.unidad ?? '-'}</td>
        <td>${item.localidad}</td>
        <td>${item.stock}</td>
        <td>${item.min_stock}</td>
        <td style="${colorStyle}">${item.estado.toUpperCase()}</td>
      `;

      // Columna Acciones (Solo si NO es asesor)
      if (!state.esAsesor) {
        html += `
          <td class="user-actions">
            <button class="btn-obs" onclick="modalEditar('${item.codigo}','${item.localidad}')" title="Editar">
              Editar
            </button>
            <button class="btn-obs" onclick="modalStock('${item.codigo}','${item.localidad}')" title="Ajustar Stock">
              Stock
            </button>
            ${state.esAdmin ? 
              `<button class="btn-eliminar" onclick="modalEliminar('${item.codigo}','${item.localidad}')" title="Eliminar">
                Eliminar
               </button>` : ''
            }
          </td>
        `;
      }

      tr.innerHTML = html;
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
      MODAL: NUEVO INSUMO
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
            <input id="unidad" class="swal2-input" placeholder="Ej: UNIDAD">
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

    Swal.showLoading();
    const res = await apiFetch('/inventario/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });

    if (res && res.ok) {
      Swal.fire('✅ Insumo creado', '', 'success');
      cargarInventario();
    } else {
      const err = await safeJson(res);
      Swal.fire('Error', err?.error || 'No se pudo crear', 'error');
    }
  }

  /* ======================================================
      MODAL: EDITAR
  ====================================================== */
  async function modalEditar(codigo, localidad) {
    // 1. Obtener datos actuales
    const res = await apiFetch(`/inventario/info/${codigo}/${localidad}`);
    const data = await safeJson(res);

    if (!data) {
      Swal.fire('Error', 'No se pudo cargar la información', 'error');
      return;
    }

    // 2. Mostrar Formulario
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
            <input id="unidad" class="swal2-input" value="${data.unidad ?? ''}" placeholder="Ej: UNIDAD">
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

    Swal.showLoading();
    const updateRes = await apiFetch(`/inventario/update/${codigo}/${localidad}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });

    if (updateRes && updateRes.ok) {
      Swal.fire('✅ Insumo actualizado', '', 'success');
      cargarInventario();
    } else {
      Swal.fire('Error', 'No se pudo actualizar', 'error');
    }
  }

  /* ======================================================
      MODAL: STOCK (AJUSTE MANUAL)
  ====================================================== */
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
          <label>Motivo</label>
          <textarea id="motivo" class="swal2-textarea" placeholder="Describa el motivo..."></textarea>
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
        return { codigo, qty, tipo, motivo, localidad };
      }
    });

    if (!form) return;

    Swal.showLoading();
    const res = await apiFetch('/inventario/stock-adjust', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });

    if (res && res.ok) {
      Swal.fire('✅ Stock actualizado', '', 'success');
      cargarInventario();
    } else {
      const err = await safeJson(res);
      Swal.fire('Error', err?.error || 'Falló el ajuste', 'error');
    }
  }

  /* ======================================================
      MODAL: ELIMINAR
  ====================================================== */
  async function modalEliminar(codigo, localidad) {
    const ok = await Swal.fire({
      title: `¿Eliminar ${codigo}?`,
      text: `Se eliminará de ${localidad}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (!ok.isConfirmed) return;

    Swal.showLoading();
    const res = await apiFetch(`/inventario/${codigo}/${localidad}`, { method: 'DELETE' });
    
    if (res && res.ok) {
      Swal.fire('✅ Insumo eliminado', '', 'success');
      cargarInventario();
    } else {
      Swal.fire('Error', 'No se pudo eliminar', 'error');
    }
  }

  /* ======================================================
      MODAL: IMPORTAR EXCEL
  ====================================================== */
  async function modalImportarExcel() {
    const { value: f } = await Swal.fire({
      title: "Importar inventario",
      html: `
        <div class="form-group">
          <label>Localidad Destino</label>
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

    Swal.fire({ title: 'Subiendo...', didOpen: () => Swal.showLoading() });
    
    const res = await apiFetch('/inventario/import', { method: 'POST', body: fd });
    
    if (res && res.ok) {
      const data = await safeJson(res);
      Swal.fire('✅ Éxito', data.message, 'success');
      cargarInventario();
    } else {
      Swal.fire('Error', 'Fallo en la importación', 'error');
    }
  }

  /* ======================================================
      FUNCIONALIDAD: PLANTILLA
  ====================================================== */
  async function descargarPlantilla() {
    Swal.showLoading();
    const res = await apiFetch('/inventario/plantilla');
    if (res && res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla_inventario.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      Swal.close();
    } else {
      Swal.fire('Error', 'No se pudo descargar', 'error');
    }
  }

  /* ======================================================
      MODAL: TRASLADO (NUEVO)
      Lógica de filas dinámicas
  ====================================================== */
  async function modalTraslado() {
    const htmlForm = `
      <div style="text-align:left; font-size: 0.95rem;">
        
        <div class="form-row" style="display:flex; gap:10px; margin-bottom:15px;">
          <div style="flex:1;">
            <label style="font-size:12px; font-weight:600; color:#555;">Origen</label>
            <select id="t-origen" class="swal2-select" style="width:100%; margin:0;">
              <option value="MATRIZ">MATRIZ</option>
              <option value="SUCURSAL">SUCURSAL</option>
            </select>
          </div>
          <div style="display:flex; align-items:end; padding-bottom:10px; color:#aaa; font-size:20px;">➔</div>
          <div style="flex:1;">
            <label style="font-size:12px; font-weight:600; color:#555;">Destino</label>
            <select id="t-destino" class="swal2-select" style="width:100%; margin:0;" disabled>
              <option value="SUCURSAL">SUCURSAL</option>
              <option value="MATRIZ">MATRIZ</option>
            </select>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:15px;">
          <label style="font-size:12px; font-weight:600; color:#555;">Motivo del traslado</label>
          <input id="t-motivo" class="swal2-input" placeholder="Ej: Reabastecimiento semanal" style="margin:0; width:100%;">
        </div>

        <label style="font-size:12px; font-weight:600; color:#555; display:block; margin-bottom:5px;">Ítems a trasladar</label>
        <div id="items-container" style="border:1px solid #e2e8f0; border-radius:6px; padding:10px; max-height:220px; overflow-y:auto; margin-bottom:10px; background:#f8fafc;">
          <div class="item-row" style="display:flex; gap:8px; margin-bottom:8px;">
            <input type="text" placeholder="Código (Ej: INS001)" class="swal2-input t-codigo" style="margin:0; flex:2; height:38px; font-size:14px;">
            <input type="number" placeholder="Cant." class="swal2-input t-cant" style="margin:0; flex:1; height:38px; font-size:14px;" min="1">
            <button type="button" class="btn-eliminar-row" style="background:#ef4444; color:white; border:none; border-radius:6px; cursor:pointer; width:36px; height:38px; display:flex; align-items:center; justify-content:center;">
              <span style="font-size:18px; line-height:1;">&times;</span>
            </button>
          </div>
        </div>

        <button type="button" id="btn-add-row" style="background:#3b82f6; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:13px; font-weight:500; display:flex; align-items:center; gap:5px;">
          <span>+</span> Agregar otro ítem
        </button>
      </div>
    `;

    const { value: form } = await Swal.fire({
      title: 'Traslado de Inventario',
      html: htmlForm,
      width: '550px',
      showCancelButton: true,
      confirmButtonText: 'Realizar Traslado',
      cancelButtonText: 'Cancelar',
      // Lógica interna del modal (Listeners)
      didOpen: () => {
        const popup = Swal.getPopup();
        const selOrigen = popup.querySelector('#t-origen');
        const selDestino = popup.querySelector('#t-destino');
        const btnAdd = popup.querySelector('#btn-add-row');
        const container = popup.querySelector('#items-container');

        // 1. Sincronizar Origen/Destino
        selOrigen.addEventListener('change', () => {
          if (selOrigen.value === 'MATRIZ') {
             selDestino.innerHTML = '<option value="SUCURSAL">SUCURSAL</option>';
          } else {
             selDestino.innerHTML = '<option value="MATRIZ">MATRIZ</option>';
          }
        });

        // 2. Botón agregar fila
        btnAdd.addEventListener('click', () => {
          const div = document.createElement('div');
          div.className = 'item-row';
          div.style.cssText = 'display:flex; gap:8px; margin-bottom:8px;';
          div.innerHTML = `
            <input type="text" placeholder="Código" class="swal2-input t-codigo" style="margin:0; flex:2; height:38px; font-size:14px;">
            <input type="number" placeholder="Cant." class="swal2-input t-cant" style="margin:0; flex:1; height:38px; font-size:14px;" min="1">
            <button type="button" class="btn-eliminar-row" style="background:#ef4444; color:white; border:none; border-radius:6px; cursor:pointer; width:36px; height:38px; display:flex; align-items:center; justify-content:center;">
              <span style="font-size:18px; line-height:1;">&times;</span>
            </button>
          `;
          container.appendChild(div);
          
          // Auto-focus al nuevo input
          div.querySelector('.t-codigo').focus();
        });

        // 3. Delegación para eliminar fila
        container.addEventListener('click', (e) => {
          // Buscamos el botón o su contenido
          const btn = e.target.closest('.btn-eliminar-row');
          if (btn) {
            if (container.querySelectorAll('.item-row').length > 1) {
              btn.parentElement.remove();
            } else {
              // Si es la última, solo limpiar inputs
              const row = btn.parentElement;
              row.querySelector('.t-codigo').value = '';
              row.querySelector('.t-cant').value = '';
            }
          }
        });
      },
      preConfirm: () => {
        const origen = document.getElementById('t-origen').value;
        // Tomamos el valor de la opción seleccionada, no del select disabled directamente
        const destino = document.getElementById('t-destino').options[0].value;
        const motivo = document.getElementById('t-motivo').value.trim();
        
        // Recolectar Items
        const filas = document.querySelectorAll('.item-row');
        const items = [];
        
        for (const fila of filas) {
          const codigo = fila.querySelector('.t-codigo').value.trim().toUpperCase();
          const cantidad = Number(fila.querySelector('.t-cant').value);

          // Solo agregamos si tiene código y cantidad válida
          if (codigo && cantidad > 0) {
            items.push({ codigo, cantidad });
          }
        }

        if (items.length === 0) {
          Swal.showValidationMessage('Debes agregar al menos un ítem válido');
          return false;
        }

        if (!motivo) {
            Swal.showValidationMessage('El motivo es obligatorio para auditoría');
            return false;
        }

        return { items, origen, destino, motivo };
      }
    });

    if (!form) return;

    // ENVIAR AL BACKEND
    Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const res = await apiFetch('/inventario/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });

    if (res && res.ok) {
      Swal.fire('✅ Traslado Exitoso', 'El inventario ha sido actualizado.', 'success');
      cargarInventario();
    } else {
      const errorData = await safeJson(res);
      Swal.fire('Error', errorData?.error || 'No se pudo realizar el traslado', 'error');
    }
  }

  /* ======================================================
      EXPONER FUNCIONES GLOBALES
      (Necesario para los onclick del HTML generado dinámicamente)
  ====================================================== */
  window.modalEditar = modalEditar;
  window.modalStock = modalStock;
  window.modalEliminar = modalEliminar;
  window.modalNuevoInsumo = modalNuevoInsumo;
  window.modalImportarExcel = modalImportarExcel;
  window.descargarPlantilla = descargarPlantilla;
  window.modalTraslado = modalTraslado;

});