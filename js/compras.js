document.addEventListener('DOMContentLoaded', () => {

  if (!getToken()) {
    redirectLogin();
    return;
  }

  /* ======================================================
      ESTADO
  ====================================================== */
  const state = {
    page: 1,
    pageSize: 15,
    total: 0,
    estado: '',
    rol: '',
    esAdmin: false,
    esBodega: false,
    esAsesor: false
  };

  /* ======================================================
      CACHE DE INSUMOS (para autocompletado)
  ====================================================== */
  let catalogoInsumos = []; // Se carga una vez: [{ codigo, nombre }, ...]

  async function cargarCatalogoInsumos() {
    try {
      // Traemos todos los insumos (sin paginación limitante)
      const res = await apiFetch('/inventario/list?pageSize=500&page=1');
      if (!res || !res.ok) return;
      const data = await safeJson(res);
      if (!data || !data.items) return;

      // Deduplicar por código (puede venir MATRIZ y SUCURSAL)
      const mapa = new Map();
      data.items.forEach(item => {
        if (!mapa.has(item.codigo)) {
          mapa.set(item.codigo, { codigo: item.codigo, nombre: item.nombre, unidad: item.unidad });
        }
      });
      catalogoInsumos = Array.from(mapa.values());
    } catch {
      catalogoInsumos = [];
    }
  }

  /* ======================================================
      REFERENCIAS DOM
  ====================================================== */
  const tbody      = document.getElementById('tablaCompras');
  const btnPrev    = document.getElementById('btn-prev-oc');
  const btnNext    = document.getElementById('btn-next-oc');
  const pageInfo   = document.getElementById('page-info-oc');
  const selEstado  = document.getElementById('filtro-estado-oc');
  const btnNuevaOC = document.getElementById('btnNuevaOC');
  const btnNuevoProv = document.getElementById('btnNuevoProveedor');

  /* ======================================================
      SESIÓN
  ====================================================== */
  verificarSesion();

  async function verificarSesion(reintentos = 2) {
    try {
      const res = await apiFetch('/auth/me');
      if (!res || !res.ok) throw new Error();
      const data = await safeJson(res);

      state.rol = data.rol;
      state.esAdmin  = data.rol === 'admin';
      state.esBodega = data.rol === 'bodega';
      state.esAsesor = data.rol === 'asesor';

      if (!state.esAdmin && !state.esBodega && !state.esAsesor) {
        Swal.fire('Acceso denegado', '', 'error');
        window.location.href = 'dashboard.html';
        return;
      }

      if (state.esAsesor) {
        if (btnNuevaOC) btnNuevaOC.style.display = 'none';
        if (btnNuevoProv) btnNuevoProv.style.display = 'none';
      }

      // Cargar catálogo en background para autocompletado
      cargarCatalogoInsumos();
      cargarOrdenes();
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
      EVENTOS
  ====================================================== */
  if (selEstado) {
    selEstado.addEventListener('change', () => {
      state.estado = selEstado.value;
      state.page = 1;
      cargarOrdenes();
    });
  }

  if (btnPrev) {
    btnPrev.onclick = () => {
      if (state.page > 1) { state.page--; cargarOrdenes(); }
    };
  }
  if (btnNext) {
    btnNext.onclick = () => {
      const max = Math.ceil(state.total / state.pageSize);
      if (state.page < max) { state.page++; cargarOrdenes(); }
    };
  }

  if (btnNuevaOC) btnNuevaOC.onclick = modalNuevaOC;
  if (btnNuevoProv) btnNuevoProv.onclick = modalNuevoProveedor;

  /* ======================================================
      CARGAR ÓRDENES
  ====================================================== */
  async function cargarOrdenes() {
    try {
      const params = new URLSearchParams({ page: state.page, pageSize: state.pageSize });
      if (state.estado) params.append('estado', state.estado);

      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Cargando...</td></tr>';

      const res = await apiFetch(`/compras/list?${params.toString()}`);
      if (!res || !res.ok) throw new Error();
      const data = await safeJson(res);

      state.page = data.page;
      state.total = data.total;

      renderTabla(data.items);
      renderPaginacion();
    } catch {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">Error al cargar</td></tr>';
    }
  }

  function renderTabla(items) {
    tbody.innerHTML = '';

    if (!items || items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Sin órdenes</td></tr>';
      return;
    }

    items.forEach(item => {
      const badgeClass =
        item.estado === 'Pendiente' ? 'badge-pendiente' :
        item.estado === 'Finalizada' ? 'badge-finalizada' : 'badge-anulada';

      const tr = document.createElement('tr');

      let acciones = `
        <button class="btn-ver" onclick="verOrden(${item.id})">Ver</button>
        <button class="btn-pdf" onclick="imprimirOC(${item.id})">PDF</button>
      `;

      if (item.estado === 'Pendiente' && !state.esAsesor) {
        acciones += ` <button class="btn-recibir" onclick="modalRecepcion(${item.id})">Recibir</button>`;
        if (state.esAdmin) {
          acciones += ` <button class="btn-anular" onclick="anularOrden(${item.id})">Anular</button>`;
        }
      }

      tr.innerHTML = `
        <td>${item.id}</td>
        <td>${item.fecha}</td>
        <td>${item.proveedor || '-'}</td>
        <td>${item.solicitante}</td>
        <td><span class="badge ${badgeClass}">${item.estado}</span></td>
        <td class="user-actions">${acciones}</td>
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
      MODAL: NUEVO PROVEEDOR
  ====================================================== */
  async function modalNuevoProveedor() {
    const { value: form } = await Swal.fire({
      title: 'Nuevo Proveedor',
      html: `
        <div class="form-group">
          <label>Nombre</label>
          <input id="prov-nombre" class="swal2-input" placeholder="Ej: Distribuidora XYZ">
        </div>
        <div class="form-group">
          <label>Contacto (opcional)</label>
          <input id="prov-contacto" class="swal2-input" placeholder="Teléfono o correo">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Crear',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const nombre = document.getElementById('prov-nombre').value.trim();
        if (!nombre) {
          Swal.showValidationMessage('El nombre es obligatorio');
          return false;
        }
        return { nombre, contacto: document.getElementById('prov-contacto').value.trim() };
      }
    });

    if (!form) return;

    Swal.showLoading();
    const res = await apiFetch('/proveedores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });

    if (res && res.ok) {
      Swal.fire('✅ Proveedor creado', '', 'success');
    } else {
      const err = await safeJson(res);
      Swal.fire('Error', err?.error || 'No se pudo crear', 'error');
    }
  }

  /* ======================================================
      AUTOCOMPLETADO DE INSUMOS
      Busca por código o nombre en el catálogo cargado
  ====================================================== */

  // CSS inyectado una sola vez para el dropdown de autocompletado
  const acStyleTag = document.createElement('style');
  acStyleTag.textContent = `
    .ac-wrapper {
      position: relative;
      flex: 2;
    }
    .ac-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: white;
      border: 1px solid #cbd5e1;
      border-top: none;
      border-radius: 0 0 6px 6px;
      max-height: 160px;
      overflow-y: auto;
      z-index: 99999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.12);
      display: none;
    }
    .ac-dropdown.show {
      display: block;
    }
    .ac-option {
      padding: 7px 10px;
      cursor: pointer;
      font-size: 13px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #f1f5f9;
    }
    .ac-option:hover, .ac-option.ac-active {
      background: #eff6ff;
    }
    .ac-option .ac-code {
      font-weight: 700;
      color: #1e3a5f;
      margin-right: 8px;
      font-size: 12px;
      white-space: nowrap;
    }
    .ac-option .ac-name {
      color: #334155;
      flex: 1;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ac-option .ac-unit {
      color: #94a3b8;
      font-size: 11px;
      margin-left: 6px;
      white-space: nowrap;
    }
    .ac-empty {
      padding: 10px;
      text-align: center;
      color: #94a3b8;
      font-size: 12px;
    }
  `;
  document.head.appendChild(acStyleTag);

  /**
   * Convierte un input de código en un buscador con autocompletado.
   * @param {HTMLInputElement} input - El input donde el usuario escribe.
   */
  function activarAutocompletado(input) {
    // Envolver el input en un wrapper relativo
    const wrapper = document.createElement('div');
    wrapper.className = 'ac-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    // Crear dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'ac-dropdown';
    wrapper.appendChild(dropdown);

    let activeIdx = -1;

    // Buscar y mostrar resultados
    function buscar() {
      const q = input.value.trim().toLowerCase();
      dropdown.innerHTML = '';
      activeIdx = -1;

      if (q.length < 1) {
        dropdown.classList.remove('show');
        return;
      }

      const resultados = catalogoInsumos.filter(item =>
        item.codigo.toLowerCase().includes(q) ||
        item.nombre.toLowerCase().includes(q)
      ).slice(0, 15); // Máximo 15 resultados

      if (resultados.length === 0) {
        dropdown.innerHTML = '<div class="ac-empty">No se encontraron insumos</div>';
        dropdown.classList.add('show');
        return;
      }

      resultados.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'ac-option';
        div.dataset.index = idx;
        div.innerHTML = `
          <span class="ac-code">${item.codigo}</span>
          <span class="ac-name">${item.nombre}</span>
          ${item.unidad ? `<span class="ac-unit">${item.unidad}</span>` : ''}
        `;

        div.addEventListener('mousedown', (e) => {
          e.preventDefault(); // Evitar blur
          seleccionarInsumo(input, item, dropdown);
        });

        dropdown.appendChild(div);
      });

      dropdown.classList.add('show');
    }

    function seleccionarInsumo(input, item, dropdown) {
      input.value = item.codigo;
      input.dataset.selectedCodigo = item.codigo;
      input.dataset.selectedNombre = item.nombre;
      dropdown.classList.remove('show');

      // Actualizar el label visual si existe
      const label = input.parentNode.querySelector('.ac-selected-label');
      if (label) label.remove();

      const tag = document.createElement('div');
      tag.className = 'ac-selected-label';
      tag.style.cssText = 'font-size:11px; color:#059669; margin-top:2px; font-weight:500;';
      tag.textContent = `✓ ${item.nombre}`;
      input.parentNode.appendChild(tag);

      // Mover focus a cantidad
      const row = input.closest('.oc-row');
      if (row) {
        const cantInput = row.querySelector('.oc-cant');
        if (cantInput) cantInput.focus();
      }
    }

    // Navegación con teclado
    input.addEventListener('keydown', (e) => {
      const opciones = dropdown.querySelectorAll('.ac-option');
      if (!opciones.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, opciones.length - 1);
        actualizarActivo(opciones);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        actualizarActivo(opciones);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIdx >= 0 && activeIdx < opciones.length) {
          const idx = activeIdx;
          const q = input.value.trim().toLowerCase();
          const resultados = catalogoInsumos.filter(item =>
            item.codigo.toLowerCase().includes(q) ||
            item.nombre.toLowerCase().includes(q)
          ).slice(0, 15);
          if (resultados[idx]) {
            seleccionarInsumo(input, resultados[idx], dropdown);
          }
        }
      } else if (e.key === 'Escape') {
        dropdown.classList.remove('show');
      }
    });

    function actualizarActivo(opciones) {
      opciones.forEach((op, i) => {
        op.classList.toggle('ac-active', i === activeIdx);
        if (i === activeIdx) op.scrollIntoView({ block: 'nearest' });
      });
    }

    // Eventos
    input.addEventListener('input', debounce(buscar, 200));
    input.addEventListener('focus', () => {
      if (input.value.trim().length >= 1) buscar();
    });
    input.addEventListener('blur', () => {
      // Delay para permitir click en opción
      setTimeout(() => dropdown.classList.remove('show'), 150);
    });
  }

  /* ======================================================
      MODAL: NUEVA ORDEN DE COMPRA
      (CON AUTOCOMPLETADO DE INSUMOS)
  ====================================================== */
  async function modalNuevaOC() {
    // Si el catálogo no se cargó aún, intentar
    if (catalogoInsumos.length === 0) {
      await cargarCatalogoInsumos();
    }

    const provRes = await apiFetch('/proveedores');
    let proveedores = [];
    if (provRes && provRes.ok) {
      proveedores = await safeJson(provRes) || [];
    }

    if (proveedores.length === 0) {
      Swal.fire('Sin proveedores', 'Primero crea al menos un proveedor.', 'warning');
      return;
    }

    const optsProv = proveedores.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');

    const htmlForm = `
      <div style="text-align:left; font-size:0.95rem;">
        <div class="form-group" style="margin-bottom:12px;">
          <label style="font-size:12px; font-weight:600; color:#555;">Proveedor</label>
          <select id="oc-proveedor" class="swal2-select" style="width:100%; margin:0;">
            ${optsProv}
          </select>
        </div>

        <div class="form-group" style="margin-bottom:12px;">
          <label style="font-size:12px; font-weight:600; color:#555;">Observaciones</label>
          <textarea id="oc-obs" class="swal2-textarea" placeholder="Notas adicionales..." style="margin:0; width:100%; min-height:60px;"></textarea>
        </div>

        <label style="font-size:12px; font-weight:600; color:#555; display:block; margin-bottom:5px;">Ítems a pedir</label>
        <p style="font-size:11px; color:#94a3b8; margin:0 0 8px 0;">Escribe código o nombre para buscar insumos</p>
        <div id="oc-items" style="border:1px solid #e2e8f0; border-radius:6px; padding:10px; max-height:260px; overflow-y:auto; background:#f8fafc; margin-bottom:10px;">
          <div class="oc-row" style="display:flex; gap:8px; margin-bottom:8px; align-items:flex-start;">
            <input type="text" placeholder="Buscar insumo..." class="swal2-input oc-codigo" style="margin:0; height:38px; font-size:14px;" autocomplete="off">
            <input type="number" placeholder="Cant." class="swal2-input oc-cant" style="margin:0; flex:0 0 80px; height:38px; font-size:14px;" min="1">
            <button type="button" class="btn-del-oc-row" style="background:#ef4444; color:white; border:none; border-radius:6px; cursor:pointer; width:36px; min-height:38px; font-size:18px; flex-shrink:0;">&times;</button>
          </div>
        </div>
        <button type="button" id="btn-add-oc-row" style="background:#3b82f6; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:13px;">+ Agregar ítem</button>
      </div>
    `;

    const { value: form } = await Swal.fire({
      title: 'Nueva Orden de Compra',
      html: htmlForm,
      width: '580px',
      showCancelButton: true,
      confirmButtonText: 'Crear Orden',
      cancelButtonText: 'Cancelar',
      didOpen: () => {
        const popup = Swal.getPopup();
        const container = popup.querySelector('#oc-items');
        const btnAdd = popup.querySelector('#btn-add-oc-row');

        // Activar autocompletado en el primer input
        const primerInput = container.querySelector('.oc-codigo');
        if (primerInput) activarAutocompletado(primerInput);

        // Botón agregar fila
        btnAdd.addEventListener('click', () => {
          const div = document.createElement('div');
          div.className = 'oc-row';
          div.style.cssText = 'display:flex; gap:8px; margin-bottom:8px; align-items:flex-start;';
          div.innerHTML = `
            <input type="text" placeholder="Buscar insumo..." class="swal2-input oc-codigo" style="margin:0; height:38px; font-size:14px;" autocomplete="off">
            <input type="number" placeholder="Cant." class="swal2-input oc-cant" style="margin:0; flex:0 0 80px; height:38px; font-size:14px;" min="1">
            <button type="button" class="btn-del-oc-row" style="background:#ef4444; color:white; border:none; border-radius:6px; cursor:pointer; width:36px; min-height:38px; font-size:18px; flex-shrink:0;">&times;</button>
          `;
          container.appendChild(div);

          // Activar autocompletado en el nuevo input
          const nuevoInput = div.querySelector('.oc-codigo');
          activarAutocompletado(nuevoInput);
          nuevoInput.focus();
        });

        // Delegación para eliminar fila
        container.addEventListener('click', (e) => {
          const btn = e.target.closest('.btn-del-oc-row');
          if (btn) {
            if (container.querySelectorAll('.oc-row').length > 1) {
              btn.closest('.oc-row').remove();
            } else {
              const row = btn.closest('.oc-row');
              const codigoInput = row.querySelector('.oc-codigo');
              codigoInput.value = '';
              delete codigoInput.dataset.selectedCodigo;
              delete codigoInput.dataset.selectedNombre;
              row.querySelector('.oc-cant').value = '';
              const label = row.querySelector('.ac-selected-label');
              if (label) label.remove();
            }
          }
        });
      },
      preConfirm: () => {
        const proveedor_id = document.getElementById('oc-proveedor').value;
        const observaciones = document.getElementById('oc-obs').value.trim();

        const filas = document.querySelectorAll('.oc-row');
        const items = [];
        for (const fila of filas) {
          const codigoInput = fila.querySelector('.oc-codigo');
          // Usar el código seleccionado del autocompletado, o lo que escribió manualmente
          const codigo = (codigoInput.dataset.selectedCodigo || codigoInput.value).trim().toUpperCase();
          const cantidad_pedida = Number(fila.querySelector('.oc-cant').value);
          if (codigo && cantidad_pedida > 0) {
            items.push({ codigo, cantidad_pedida });
          }
        }

        if (items.length === 0) {
          Swal.showValidationMessage('Agrega al menos un ítem con cantidad válida');
          return false;
        }

        return { proveedor_id, observaciones, items };
      }
    });

    if (!form) return;

    Swal.fire({ title: 'Creando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const res = await apiFetch('/compras/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });

    if (res && res.ok) {
      const data = await safeJson(res);
      Swal.fire('✅ Orden Creada', `OC #${data.orden_id} registrada como Pendiente.`, 'success');
      cargarOrdenes();
    } else {
      const err = await safeJson(res);
      Swal.fire('Error', err?.error || 'No se pudo crear la orden', 'error');
    }
  }

  /* ======================================================
      VER DETALLE DE ORDEN (solo lectura)
  ====================================================== */
  async function verOrden(id) {
    Swal.fire({ title: 'Cargando...', didOpen: () => Swal.showLoading() });

    const res = await apiFetch(`/compras/detalle/${id}`);
    if (!res || !res.ok) {
      Swal.fire('Error', 'No se pudo cargar', 'error');
      return;
    }

    const data = await safeJson(res);
    const { orden, detalles } = data;

    let tablaHtml = `
      <table class="tabla-recepcion">
        <thead>
          <tr>
            <th>Código</th>
            <th>Insumo</th>
            <th>Pedido</th>
            <th>Rec. Matriz</th>
            <th>Rec. Sucursal</th>
            <th>Diferencia</th>
          </tr>
        </thead>
        <tbody>
    `;

    detalles.forEach(d => {
      const totalRec = Number(d.cantidad_recibida_matriz) + Number(d.cantidad_recibida_sucursal);
      const diff = totalRec - Number(d.cantidad_pedida);
      const diffClass = diff > 0 ? 'diff-positive' : diff < 0 ? 'diff-negative' : 'diff-zero';

      const diffLabel = diff > 0 ? `+${diff} (excedente)` : diff < 0 ? `${diff} (faltante)` : '✓ Completo';
      tablaHtml += `
        <tr>
          <td>${d.codigo}</td>
          <td style="text-align:left;">${d.insumo || '-'}</td>
          <td>${d.cantidad_pedida}</td>
          <td>${d.cantidad_recibida_matriz ?? '-'}</td>
          <td>${d.cantidad_recibida_sucursal ?? '-'}</td>
          <td class="${diffClass}">${diffLabel}</td>
        </tr>
      `;
    });

    tablaHtml += '</tbody></table>';

    const badgeClass =
      orden.estado === 'Pendiente' ? 'badge-pendiente' :
      orden.estado === 'Finalizada' ? 'badge-finalizada' : 'badge-anulada';

    Swal.fire({
      title: `OC #${orden.id}`,
      html: `
        <div style="text-align:left; font-size:14px;">
          <p><strong>Proveedor:</strong> ${orden.proveedor || '-'}</p>
          <p><strong>Solicitante:</strong> ${orden.usuario_solicita}</p>
          <p><strong>Fecha:</strong> ${orden.fecha}</p>
          <p><strong>Estado:</strong> <span class="badge ${badgeClass}">${orden.estado}</span></p>
          ${orden.observaciones ? `<p><strong>Observaciones:</strong> ${orden.observaciones}</p>` : ''}
          ${orden.observaciones_recepcion ? `<p><strong>Obs. Recepción:</strong> ${orden.observaciones_recepcion}</p>` : ''}
          <hr style="margin:10px 0;">
          ${tablaHtml}
        </div>
      `,
      width: '700px',
      confirmButtonText: 'Cerrar'
    });
  }

  /* ======================================================
      MODAL: RECEPCIÓN (CERRAR ORDEN)
  ====================================================== */
  async function modalRecepcion(id) {
    Swal.fire({ title: 'Cargando...', didOpen: () => Swal.showLoading() });

    const res = await apiFetch(`/compras/detalle/${id}`);
    if (!res || !res.ok) {
      Swal.fire('Error', 'No se pudo cargar', 'error');
      return;
    }

    const data = await safeJson(res);
    const { orden, detalles } = data;

    let filasHtml = '';
    detalles.forEach(d => {
      filasHtml += `
        <tr>
          <td>${d.codigo}</td>
          <td style="text-align:left; font-size:12px;">${d.insumo || '-'}</td>
          <td><strong>${d.cantidad_pedida}</strong></td>
          <td><input type="number" class="rec-matriz" data-id="${d.id}" value="0" min="0" style="width:70px; padding:4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center;"></td>
          <td><input type="number" class="rec-sucursal" data-id="${d.id}" value="0" min="0" style="width:70px; padding:4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center;"></td>
          <td class="rec-total" data-id="${d.id}" data-pedido="${d.cantidad_pedida}" style="font-weight:600; min-width:80px;">0 / ${d.cantidad_pedida}</td>
        </tr>
      `;
    });

    const { isConfirmed } = await Swal.fire({
      title: `Recibir OC #${id}`,
      html: `
        <div style="text-align:left; font-size:14px;">
          <p style="margin-bottom:5px;"><strong>Proveedor:</strong> ${orden.proveedor || '-'}</p>
          ${orden.observaciones ? `<p style="margin-bottom:10px; color:#64748b;"><em>${orden.observaciones}</em></p>` : ''}

          <p style="font-size:12px; color:#64748b; margin-bottom:8px;">
            Ingresa las cantidades que realmente llegaron para cada localidad:
          </p>

          <div style="max-height:260px; overflow-y:auto;">
            <table class="tabla-recepcion">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Insumo</th>
                  <th>Pedido</th>
                  <th>Rec. Matriz</th>
                  <th>Rec. Sucursal</th>
                  <th>Total / Pedido</th>
                </tr>
              </thead>
              <tbody id="rec-tbody">${filasHtml}</tbody>
            </table>
          </div>

          <div style="margin-top:12px;">
            <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Observaciones de recepción (opcional):</label>
            <textarea id="rec-obs" rows="2" style="width:100%; padding:6px; border:1px solid #cbd5e1; border-radius:4px; font-size:13px; resize:vertical; box-sizing:border-box;"></textarea>
          </div>
        </div>
      `,
      width: '780px',
      showCancelButton: true,
      confirmButtonText: 'Finalizar Orden',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#059669',
      didOpen: () => {
        const tbody = document.getElementById('rec-tbody');
        tbody.addEventListener('input', (e) => {
          if (!e.target.classList.contains('rec-matriz') && !e.target.classList.contains('rec-sucursal')) return;
          const detId = e.target.dataset.id;
          const inputM = tbody.querySelector(`.rec-matriz[data-id="${detId}"]`);
          const inputS = tbody.querySelector(`.rec-sucursal[data-id="${detId}"]`);
          const tdTotal = tbody.querySelector(`.rec-total[data-id="${detId}"]`);
          const pedido = Number(tdTotal.dataset.pedido);
          const total = (Number(inputM?.value) || 0) + (Number(inputS?.value) || 0);
          tdTotal.textContent = `${total} / ${pedido}`;
          tdTotal.className = 'rec-total';
          tdTotal.dataset.id = detId;
          tdTotal.dataset.pedido = pedido;
          if (total === pedido) {
            tdTotal.classList.add('diff-zero');
          } else if (total > pedido) {
            tdTotal.classList.add('diff-positive');
          } else {
            tdTotal.classList.add('diff-negative');
          }
        });
      }
    });

    if (!isConfirmed) return;

    const obsRecepcion = document.getElementById('rec-obs')?.value?.trim() || '';

    const detallesEnvio = detalles.map(d => {
      const inputM = document.querySelector(`.rec-matriz[data-id="${d.id}"]`);
      const inputS = document.querySelector(`.rec-sucursal[data-id="${d.id}"]`);
      return {
        id: d.id,
        cantidad_recibida_matriz: Number(inputM?.value) || 0,
        cantidad_recibida_sucursal: Number(inputS?.value) || 0
      };
    });

    // Advertencia naranja si algún ítem tiene excedente
    const hayExcedentes = detallesEnvio.some((d, i) => {
      const pedido = Number(detalles[i].cantidad_pedida);
      return (d.cantidad_recibida_matriz + d.cantidad_recibida_sucursal) > pedido;
    });

    if (hayExcedentes) {
      const warnResult = await Swal.fire({
        title: 'Hay ítems con excedente',
        text: 'Algunos ítems recibidos superan la cantidad pedida. ¿Deseas continuar de todas formas?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, continuar',
        cancelButtonText: 'Revisar',
        confirmButtonColor: '#d97706'
      });
      if (!warnResult.isConfirmed) return;
    }

    const confirm2 = await Swal.fire({
      title: '¿Confirmar recepción?',
      text: 'Se sumará el stock a cada localidad y la orden pasará a "Finalizada".',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, confirmar',
      cancelButtonText: 'Volver',
      confirmButtonColor: '#059669'
    });

    if (!confirm2.isConfirmed) return;

    Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const closeRes = await apiFetch('/compras/close', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orden_id: id, observaciones_recepcion: obsRecepcion, detalles: detallesEnvio })
    });

    if (closeRes && closeRes.ok) {
      Swal.fire('✅ Orden Finalizada', 'El stock ha sido actualizado en ambas localidades.', 'success');
      cargarOrdenes();
    } else {
      const err = await safeJson(closeRes);
      Swal.fire('Error', err?.error || 'No se pudo cerrar la orden', 'error');
    }
  }

  /* ======================================================
      ANULAR ORDEN
  ====================================================== */
  async function anularOrden(id) {
    const ok = await Swal.fire({
      title: `¿Anular OC #${id}?`,
      text: 'La orden pasará a estado "Anulada" sin afectar stock.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, anular',
      cancelButtonText: 'Cancelar'
    });

    if (!ok.isConfirmed) return;

    Swal.showLoading();
    const res = await apiFetch('/compras/anular', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orden_id: id })
    });

    if (res && res.ok) {
      Swal.fire('✅ Orden anulada', '', 'success');
      cargarOrdenes();
    } else {
      const err = await safeJson(res);
      Swal.fire('Error', err?.error || 'No se pudo anular', 'error');
    }
  }

  /* ======================================================
      IMPRIMIR PDF - ORDEN DE COMPRA
  ====================================================== */
  async function imprimirOC(id) {
    Swal.fire({ title: 'Generando PDF...', didOpen: () => Swal.showLoading() });

    try {
      const res = await apiFetch(`/compras/detalle/${id}`);
      if (!res || !res.ok) throw new Error('No se pudo cargar la orden');

      const data = await safeJson(res);
      const { orden, detalles } = data;

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('p', 'mm', 'a4');

      const pageW = doc.internal.pageSize.getWidth();
      const marginL = 20;
      const marginR = 20;
      const contentW = pageW - marginL - marginR;

      const primaryColor = [30, 58, 95];
      const accentColor = [234, 88, 12];
      const grayText = [100, 116, 139];
      const darkText = [15, 23, 42];

      // Franja superior
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, pageW, 3, 'F');

      // Logo
      let logoLoaded = false;
      try {
        const logoImg = await cargarImagenBase64('img/logo.png');
        if (logoImg) {
          doc.addImage(logoImg, 'PNG', marginL, 8, 35, 18);
          logoLoaded = true;
        }
      } catch { }

      const headerTextX = logoLoaded ? marginL + 40 : marginL;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(...primaryColor);
      doc.text('GLOBAL MOTRIZ S.A.', headerTextX, 16);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...grayText);
      doc.text('Sistema de Gestión de Inventario e Insumos', headerTextX, 22);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(...accentColor);
      doc.text(`OC #${orden.id}`, pageW - marginR, 18, { align: 'right' });

      doc.setDrawColor(...primaryColor);
      doc.setLineWidth(0.5);
      doc.line(marginL, 30, pageW - marginR, 30);

      // Título — condicional por estado
      const esFinalizada = orden.estado === 'Finalizada';
      const tituloPDF = esFinalizada ? 'COMPROBANTE DE RECEPCION' : 'ORDEN DE COMPRA';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...darkText);
      doc.text(tituloPDF, pageW / 2, 40, { align: 'center' });

      // Datos — la caja crece si hay obs. recepción
      const tieneObsRec = esFinalizada && !!orden.observaciones_recepcion;
      const tieneObs = !!orden.observaciones;
      let boxH = 30;
      if (tieneObs) boxH = 35;
      if (tieneObsRec) boxH = tieneObs ? 44 : 35;

      const boxY = 46;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(marginL, boxY, contentW, boxH, 2, 2, 'FD');

      doc.setFontSize(10);
      const col1 = marginL + 5;
      const col2 = marginL + contentW / 2 + 5;

      doc.setFont('helvetica', 'bold'); doc.setTextColor(...grayText);
      doc.text('Fecha:', col1, boxY + 8);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...darkText);
      doc.text(orden.fecha || '-', col1 + 22, boxY + 8);

      doc.setFont('helvetica', 'bold'); doc.setTextColor(...grayText);
      doc.text('Estado:', col2, boxY + 8);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...darkText);
      doc.text(orden.estado || '-', col2 + 24, boxY + 8);

      doc.setFont('helvetica', 'bold'); doc.setTextColor(...grayText);
      doc.text('Proveedor:', col1, boxY + 17);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...darkText);
      doc.text(orden.proveedor || '-', col1 + 32, boxY + 17);

      doc.setFont('helvetica', 'bold'); doc.setTextColor(...grayText);
      doc.text('Solicitante:', col2, boxY + 17);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...darkText);
      doc.text(orden.usuario_solicita || '-', col2 + 32, boxY + 17);

      if (tieneObs) {
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...grayText);
        doc.text('Obs:', col1, boxY + 26);
        doc.setFont('helvetica', 'italic'); doc.setTextColor(...darkText);
        const obsText = doc.splitTextToSize(orden.observaciones, contentW - 25);
        doc.text(obsText[0] || '', col1 + 15, boxY + 26);
      }

      if (tieneObsRec) {
        const obsRecY = boxY + 26 + (tieneObs ? 9 : 0);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...grayText);
        doc.text('Obs.Rec:', col1, obsRecY);
        doc.setFont('helvetica', 'italic'); doc.setTextColor(...darkText);
        const obsRecText = doc.splitTextToSize(orden.observaciones_recepcion, contentW - 30);
        doc.text(obsRecText[0] || '', col1 + 26, obsRecY);
      }

      // Tabla — condicional por estado
      const tableStartY = boxY + boxH + 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...primaryColor);

      if (esFinalizada) {
        doc.text('DETALLE DE RECEPCION', marginL, tableStartY);

        const tableBody = detalles.map((d, i) => {
          const recM = Number(d.cantidad_recibida_matriz) || 0;
          const recS = Number(d.cantidad_recibida_sucursal) || 0;
          const totalRec = recM + recS;
          const diff = totalRec - Number(d.cantidad_pedida);
          const diffLabel = diff > 0 ? `+${diff} (excedente)` : diff < 0 ? `${diff} (faltante)` : 'Completo';
          return [
            (i + 1).toString(),
            d.codigo,
            d.insumo || '-',
            d.cantidad_pedida.toString(),
            recM.toString(),
            recS.toString(),
            totalRec.toString(),
            diffLabel
          ];
        });

        doc.autoTable({
          startY: tableStartY + 3,
          head: [['#', 'Codigo', 'Insumo', 'Pedido', 'Rec. Matriz', 'Rec. Sucursal', 'Total', 'Diferencia']],
          body: tableBody,
          margin: { left: marginL, right: marginR },
          styles: { fontSize: 8.5, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.3 },
          headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
          bodyStyles: { textColor: darkText },
          columnStyles: {
            0: { halign: 'center', cellWidth: 8 },
            1: { halign: 'center', cellWidth: 22 },
            2: { halign: 'left' },
            3: { halign: 'center', cellWidth: 18 },
            4: { halign: 'center', cellWidth: 22 },
            5: { halign: 'center', cellWidth: 24 },
            6: { halign: 'center', cellWidth: 14 },
            7: { halign: 'center', cellWidth: 28 }
          },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 7) {
              const val = data.cell.raw || '';
              if (val === 'Completo') {
                data.cell.styles.textColor = [5, 150, 105];   // verde
                data.cell.styles.fontStyle = 'bold';
              } else if (val.includes('excedente')) {
                data.cell.styles.textColor = [217, 119, 6];   // naranja
                data.cell.styles.fontStyle = 'bold';
              } else if (val.includes('faltante')) {
                data.cell.styles.textColor = [220, 38, 38];   // rojo
                data.cell.styles.fontStyle = 'bold';
              }
            }
          }
        });

      } else {
        doc.text('DETALLE DE INSUMOS SOLICITADOS', marginL, tableStartY);

        const tableBody = detalles.map((d, i) => [
          (i + 1).toString(),
          d.codigo,
          d.insumo || '-',
          d.cantidad_pedida.toString()
        ]);

        doc.autoTable({
          startY: tableStartY + 3,
          head: [['#', 'Codigo', 'Insumo / Descripcion', 'Cantidad Pedida']],
          body: tableBody,
          margin: { left: marginL, right: marginR },
          styles: { fontSize: 10, cellPadding: 4, lineColor: [226, 232, 240], lineWidth: 0.3 },
          headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
          bodyStyles: { textColor: darkText },
          columnStyles: {
            0: { halign: 'center', cellWidth: 12 },
            1: { halign: 'center', cellWidth: 30 },
            2: { halign: 'left' },
            3: { halign: 'center', cellWidth: 35 }
          },
          alternateRowStyles: { fillColor: [248, 250, 252] }
        });
      }

      let currentY = doc.lastAutoTable.finalY + 5;

      // Observaciones de la orden (si son largas)
      if (tieneObs && orden.observaciones.length > 60) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...primaryColor);
        doc.text('OBSERVACIONES:', marginL, currentY);
        currentY += 5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...darkText);
        const obsLines = doc.splitTextToSize(orden.observaciones, contentW);
        doc.text(obsLines, marginL, currentY);
        currentY += obsLines.length * 4 + 5;
      }

      // Observaciones de recepción (solo si Finalizada)
      if (tieneObsRec) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...primaryColor);
        doc.text('OBSERVACIONES DE RECEPCION:', marginL, currentY);
        currentY += 5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...darkText);
        const obsRecLines = doc.splitTextToSize(orden.observaciones_recepcion, contentW);
        doc.text(obsRecLines, marginL, currentY);
        currentY += obsRecLines.length * 4 + 5;
      }

      // Firmas — condicionales por estado
      if (currentY > 230) { doc.addPage(); currentY = 30; }

      const firmaY = Math.max(currentY + 15, 220);
      const firmaLineW = 65;

      doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3);
      doc.line(marginL, firmaY - 10, pageW - marginR, firmaY - 10);

      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...grayText);
      doc.text('Este documento requiere las siguientes firmas para su validez:', marginL, firmaY - 5);

      const firma1X = marginL + (contentW / 2 - firmaLineW) / 2;
      doc.setDrawColor(...primaryColor); doc.setLineWidth(0.4);
      doc.line(firma1X, firmaY + 25, firma1X + firmaLineW, firmaY + 25);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...darkText);
      doc.text(esFinalizada ? 'Recibido por:' : 'Solicitado por:', firma1X + firmaLineW / 2, firmaY + 31, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...grayText);
      doc.text('(Bodega)', firma1X + firmaLineW / 2, firmaY + 36, { align: 'center' });
      doc.setFontSize(8);
      doc.text(orden.usuario_solicita || '', firma1X + firmaLineW / 2, firmaY + 41, { align: 'center' });

      const firma2X = marginL + contentW / 2 + (contentW / 2 - firmaLineW) / 2;
      doc.setDrawColor(...accentColor); doc.setLineWidth(0.4);
      doc.line(firma2X, firmaY + 25, firma2X + firmaLineW, firmaY + 25);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...darkText);
      doc.text(esFinalizada ? 'Conforme:' : 'Autorizado por:', firma2X + firmaLineW / 2, firmaY + 31, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...grayText);
      doc.text('(Gerencia)', firma2X + firmaLineW / 2, firmaY + 36, { align: 'center' });

      // Pie de página
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFillColor(...primaryColor);
      doc.rect(0, pageH - 12, pageW, 12, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(255, 255, 255);
      doc.text('Global Motriz S.A. — Documento generado automaticamente por el Sistema de Inventario', pageW / 2, pageH - 7, { align: 'center' });
      doc.setTextColor(200, 200, 200);
      doc.text(`Impreso: ${new Date().toLocaleString('es-EC')}`, pageW / 2, pageH - 3, { align: 'center' });

      // Nombre de archivo condicional
      const prefijoPDF = esFinalizada ? 'RECEPCION' : 'OC';
      doc.save(`${prefijoPDF}_${orden.id}_GlobalMotriz.pdf`);
      Swal.close();

    } catch (err) {
      console.error('Error generando PDF:', err);
      Swal.fire('Error', 'No se pudo generar el PDF', 'error');
    }
  }

  function cargarImagenBase64(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  /* ======================================================
      EXPONER GLOBALES
  ====================================================== */
  window.verOrden = verOrden;
  window.modalRecepcion = modalRecepcion;
  window.anularOrden = anularOrden;
  window.imprimirOC = imprimirOC;

});