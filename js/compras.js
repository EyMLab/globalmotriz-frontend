document.addEventListener('DOMContentLoaded', () => {

  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';
  const token = localStorage.getItem('token');

  if (!token) {
    localStorage.clear();
    window.location.href = 'index.html';
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
      MODAL: NUEVA ORDEN DE COMPRA
  ====================================================== */
  async function modalNuevaOC() {
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
        <div id="oc-items" style="border:1px solid #e2e8f0; border-radius:6px; padding:10px; max-height:220px; overflow-y:auto; background:#f8fafc; margin-bottom:10px;">
          <div class="oc-row" style="display:flex; gap:8px; margin-bottom:8px;">
            <input type="text" placeholder="Código (Ej: INS001)" class="swal2-input oc-codigo" style="margin:0; flex:2; height:38px; font-size:14px;">
            <input type="number" placeholder="Cant. pedida" class="swal2-input oc-cant" style="margin:0; flex:1; height:38px; font-size:14px;" min="1">
            <button type="button" class="btn-del-oc-row" style="background:#ef4444; color:white; border:none; border-radius:6px; cursor:pointer; width:36px; height:38px; font-size:18px;">&times;</button>
          </div>
        </div>
        <button type="button" id="btn-add-oc-row" style="background:#3b82f6; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:13px;">+ Agregar ítem</button>
      </div>
    `;

    const { value: form } = await Swal.fire({
      title: 'Nueva Orden de Compra',
      html: htmlForm,
      width: '550px',
      showCancelButton: true,
      confirmButtonText: 'Crear Orden',
      cancelButtonText: 'Cancelar',
      didOpen: () => {
        const popup = Swal.getPopup();
        const container = popup.querySelector('#oc-items');
        const btnAdd = popup.querySelector('#btn-add-oc-row');

        btnAdd.addEventListener('click', () => {
          const div = document.createElement('div');
          div.className = 'oc-row';
          div.style.cssText = 'display:flex; gap:8px; margin-bottom:8px;';
          div.innerHTML = `
            <input type="text" placeholder="Código" class="swal2-input oc-codigo" style="margin:0; flex:2; height:38px; font-size:14px;">
            <input type="number" placeholder="Cant." class="swal2-input oc-cant" style="margin:0; flex:1; height:38px; font-size:14px;" min="1">
            <button type="button" class="btn-del-oc-row" style="background:#ef4444; color:white; border:none; border-radius:6px; cursor:pointer; width:36px; height:38px; font-size:18px;">&times;</button>
          `;
          container.appendChild(div);
          div.querySelector('.oc-codigo').focus();
        });

        container.addEventListener('click', (e) => {
          const btn = e.target.closest('.btn-del-oc-row');
          if (btn) {
            if (container.querySelectorAll('.oc-row').length > 1) {
              btn.parentElement.remove();
            } else {
              const row = btn.parentElement;
              row.querySelector('.oc-codigo').value = '';
              row.querySelector('.oc-cant').value = '';
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
          const codigo = fila.querySelector('.oc-codigo').value.trim().toUpperCase();
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

      tablaHtml += `
        <tr>
          <td>${d.codigo}</td>
          <td style="text-align:left;">${d.insumo || '-'}</td>
          <td>${d.cantidad_pedida}</td>
          <td>${d.cantidad_recibida_matriz}</td>
          <td>${d.cantidad_recibida_sucursal}</td>
          <td class="${diffClass}">${diff >= 0 ? '+' : ''}${diff}</td>
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

          <div style="max-height:300px; overflow-y:auto;">
            <table class="tabla-recepcion">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Insumo</th>
                  <th>Pedido</th>
                  <th>Recibido Matriz</th>
                  <th>Recibido Sucursal</th>
                </tr>
              </thead>
              <tbody>${filasHtml}</tbody>
            </table>
          </div>
        </div>
      `,
      width: '700px',
      showCancelButton: true,
      confirmButtonText: 'Finalizar Orden',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#059669'
    });

    if (!isConfirmed) return;

    const detallesEnvio = detalles.map(d => {
      const inputM = document.querySelector(`.rec-matriz[data-id="${d.id}"]`);
      const inputS = document.querySelector(`.rec-sucursal[data-id="${d.id}"]`);
      return {
        id: d.id,
        cantidad_recibida_matriz: Number(inputM?.value) || 0,
        cantidad_recibida_sucursal: Number(inputS?.value) || 0
      };
    });

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
      body: JSON.stringify({ orden_id: id, detalles: detallesEnvio })
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
      Genera un documento formal con:
      - Logo de Global Motriz
      - Datos de la orden
      - Tabla de insumos pedidos
      - Observaciones
      - Espacio para firmas (Solicitante + Autorización Gerencia)
  ====================================================== */
  async function imprimirOC(id) {
    Swal.fire({ title: 'Generando PDF...', didOpen: () => Swal.showLoading() });

    try {
      const res = await apiFetch(`/compras/detalle/${id}`);
      if (!res || !res.ok) throw new Error('No se pudo cargar la orden');

      const data = await safeJson(res);
      const { orden, detalles } = data;

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('p', 'mm', 'a4'); // Vertical, milímetros, A4

      const pageW = doc.internal.pageSize.getWidth();
      const marginL = 20;
      const marginR = 20;
      const contentW = pageW - marginL - marginR;

      // ─── COLORES CORPORATIVOS ───
      const primaryColor = [30, 58, 95];     // Azul oscuro
      const accentColor = [234, 88, 12];     // Naranja
      const grayText = [100, 116, 139];
      const darkText = [15, 23, 42];

      // ═══════════════════════════════════════════
      // ENCABEZADO
      // ═══════════════════════════════════════════

      // Franja superior de color
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, pageW, 3, 'F');

      // Intentar cargar logo (si falla, solo texto)
      let logoLoaded = false;
      try {
        const logoImg = await cargarImagenBase64('img/logo.png');
        if (logoImg) {
          doc.addImage(logoImg, 'PNG', marginL, 8, 35, 18);
          logoLoaded = true;
        }
      } catch {
        // Sin logo, no pasa nada
      }

      const headerTextX = logoLoaded ? marginL + 40 : marginL;

      // Nombre empresa
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(...primaryColor);
      doc.text('GLOBAL MOTRIZ S.A.', headerTextX, 16);

      // Subtítulo
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...grayText);
      doc.text('Sistema de Gestión de Inventario e Insumos', headerTextX, 22);

      // Número de OC (lado derecho)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(...accentColor);
      doc.text(`OC #${orden.id}`, pageW - marginR, 18, { align: 'right' });

      // Línea divisoria
      doc.setDrawColor(...primaryColor);
      doc.setLineWidth(0.5);
      doc.line(marginL, 30, pageW - marginR, 30);

      // ═══════════════════════════════════════════
      // TÍTULO DEL DOCUMENTO
      // ═══════════════════════════════════════════
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...darkText);
      doc.text('ORDEN DE COMPRA', pageW / 2, 40, { align: 'center' });

      // ═══════════════════════════════════════════
      // DATOS DE LA ORDEN (Recuadro)
      // ═══════════════════════════════════════════
      const boxY = 46;
      doc.setFillColor(248, 250, 252); // bg gris claro
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(marginL, boxY, contentW, 30, 2, 2, 'FD');

      doc.setFontSize(10);
      const col1 = marginL + 5;
      const col2 = marginL + contentW / 2 + 5;

      // Fila 1
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...grayText);
      doc.text('Fecha:', col1, boxY + 8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...darkText);
      doc.text(orden.fecha || '-', col1 + 22, boxY + 8);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...grayText);
      doc.text('Estado:', col2, boxY + 8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...darkText);
      doc.text(orden.estado || '-', col2 + 24, boxY + 8);

      // Fila 2
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...grayText);
      doc.text('Proveedor:', col1, boxY + 17);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...darkText);
      doc.text(orden.proveedor || '-', col1 + 32, boxY + 17);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...grayText);
      doc.text('Solicitante:', col2, boxY + 17);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...darkText);
      doc.text(orden.usuario_solicita || '-', col2 + 32, boxY + 17);

      // Fila 3 - Observaciones (si hay)
      if (orden.observaciones) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayText);
        doc.text('Obs:', col1, boxY + 26);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(...darkText);
        const obsText = doc.splitTextToSize(orden.observaciones, contentW - 25);
        doc.text(obsText[0] || '', col1 + 15, boxY + 26); // Solo primera línea en el recuadro
      }

      // ═══════════════════════════════════════════
      // TABLA DE INSUMOS
      // ═══════════════════════════════════════════
      const tableStartY = boxY + 36;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...primaryColor);
      doc.text('DETALLE DE INSUMOS SOLICITADOS', marginL, tableStartY);

      const tableBody = detalles.map((d, i) => [
        (i + 1).toString(),
        d.codigo,
        d.insumo || '-',
        d.cantidad_pedida.toString()
      ]);

      doc.autoTable({
        startY: tableStartY + 3,
        head: [['#', 'Código', 'Insumo / Descripción', 'Cantidad Pedida']],
        body: tableBody,
        margin: { left: marginL, right: marginR },
        styles: {
          fontSize: 10,
          cellPadding: 4,
          lineColor: [226, 232, 240],
          lineWidth: 0.3
        },
        headStyles: {
          fillColor: primaryColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center'
        },
        bodyStyles: {
          textColor: darkText
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },
          1: { halign: 'center', cellWidth: 30 },
          2: { halign: 'left' },
          3: { halign: 'center', cellWidth: 35 }
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        }
      });

      const afterTableY = doc.lastAutoTable.finalY + 5;

      // ═══════════════════════════════════════════
      // OBSERVACIONES LARGAS (si hay y no cupieron arriba)
      // ═══════════════════════════════════════════
      let currentY = afterTableY;

      if (orden.observaciones && orden.observaciones.length > 60) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...primaryColor);
        doc.text('OBSERVACIONES:', marginL, currentY);
        currentY += 5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...darkText);
        const obsLines = doc.splitTextToSize(orden.observaciones, contentW);
        doc.text(obsLines, marginL, currentY);
        currentY += obsLines.length * 4 + 5;
      }

      // ═══════════════════════════════════════════
      // SECCIÓN DE FIRMAS
      // ═══════════════════════════════════════════
      // Verificar si hay espacio suficiente, si no, nueva página
      if (currentY > 230) {
        doc.addPage();
        currentY = 30;
      }

      const firmaY = Math.max(currentY + 15, 220); // Posicionar firmas abajo
      const firmaLineW = 65;
      const firmaGap = 20;

      // Línea divisoria antes de firmas
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(marginL, firmaY - 10, pageW - marginR, firmaY - 10);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...grayText);
      doc.text('Este documento requiere las siguientes firmas para su validez:', marginL, firmaY - 5);

      // ── FIRMA 1: Solicitante (Bodega) ──
      const firma1X = marginL + (contentW / 2 - firmaLineW) / 2;

      doc.setDrawColor(...primaryColor);
      doc.setLineWidth(0.4);
      doc.line(firma1X, firmaY + 25, firma1X + firmaLineW, firmaY + 25);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...darkText);
      doc.text('Solicitado por:', firma1X + firmaLineW / 2, firmaY + 31, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...grayText);
      doc.text('(Bodega)', firma1X + firmaLineW / 2, firmaY + 36, { align: 'center' });

      doc.setFontSize(8);
      doc.text(orden.usuario_solicita || '', firma1X + firmaLineW / 2, firmaY + 41, { align: 'center' });

      // ── FIRMA 2: Autorización (Gerencia) ──
      const firma2X = marginL + contentW / 2 + (contentW / 2 - firmaLineW) / 2;

      doc.setDrawColor(...accentColor);
      doc.setLineWidth(0.4);
      doc.line(firma2X, firmaY + 25, firma2X + firmaLineW, firmaY + 25);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...darkText);
      doc.text('Autorizado por:', firma2X + firmaLineW / 2, firmaY + 31, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...grayText);
      doc.text('(Gerencia)', firma2X + firmaLineW / 2, firmaY + 36, { align: 'center' });

      // ═══════════════════════════════════════════
      // PIE DE PÁGINA
      // ═══════════════════════════════════════════
      const pageH = doc.internal.pageSize.getHeight();

      // Franja inferior
      doc.setFillColor(...primaryColor);
      doc.rect(0, pageH - 12, pageW, 12, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text('Global Motriz S.A. — Documento generado automáticamente por el Sistema de Inventario', pageW / 2, pageH - 7, { align: 'center' });

      doc.setTextColor(200, 200, 200);
      doc.text(`Impreso: ${new Date().toLocaleString('es-EC')}`, pageW / 2, pageH - 3, { align: 'center' });

      // ═══════════════════════════════════════════
      // DESCARGAR / ABRIR PDF
      // ═══════════════════════════════════════════
      doc.save(`OC_${orden.id}_GlobalMotriz.pdf`);

      Swal.close();

    } catch (err) {
      console.error('Error generando PDF:', err);
      Swal.fire('Error', 'No se pudo generar el PDF', 'error');
    }
  }

  /* ======================================================
      HELPER: Cargar imagen como Base64
      (Para el logo en el PDF)
  ====================================================== */
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
        } catch {
          resolve(null);
        }
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