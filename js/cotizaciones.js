// js/cotizaciones.js - Modulo de Cotizaciones
(function () {
  'use strict';

  // =====================================================
  // ESTADO GLOBAL
  // =====================================================
  const state = {
    rol: localStorage.getItem('rol') || '',
    usuario: localStorage.getItem('usuario') || '',
    esAdmin: false,
    esBodega: false,
    esAsesor: false,
    esControl: false,
    // Solicitudes tab
    solicitudes: [],
    totalSolicitudes: 0,
    paginaActual: 1,
    pageSize: 15,
    // Catalogs
    aseguradoras: [],
    proveedores: [],
    // Workspace
    workspaceSolicitudId: null
  };

  state.esAdmin = state.rol === 'admin';
  state.esBodega = state.rol === 'bodega';
  state.esAsesor = state.rol === 'asesor';
  state.esControl = state.rol === 'control';

  // =====================================================
  // INIT
  // =====================================================
  document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    await cargarCatalogos();
    initFiltros();
    initBotones();
    cargarSolicitudes();

    // Ocultar tabs segun rol
    if (state.esAsesor || state.esControl) {
      document.getElementById('tab-btn-cotizar').style.display = 'none';
      document.getElementById('tab-btn-recibir').style.display = 'none';
    }
  });

  // =====================================================
  // TABS
  // =====================================================
  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');

        if (btn.dataset.tab === 'cotizar') cargarPendientesCotizar();
        if (btn.dataset.tab === 'por-recibir') cargarPorRecibir();
      });
    });
  }

  // =====================================================
  // CATALOGOS
  // =====================================================
  async function cargarCatalogos() {
    try {
      const [asegRes, provRes] = await Promise.all([
        apiFetch('/cotizaciones/aseguradoras'),
        apiFetch('/proveedores')
      ]);
      if (asegRes.ok) state.aseguradoras = await safeJson(asegRes) || [];
      if (provRes.ok) state.proveedores = await safeJson(provRes) || [];

      // Poblar filtro aseguradoras
      const sel = document.getElementById('filtro-aseguradora');
      state.aseguradoras.forEach(a => {
        if (a.activa) sel.innerHTML += `<option value="${a.id}">${a.nombre}</option>`;
      });
    } catch (err) {
      console.error('Error cargando catalogos:', err);
    }
  }

  // =====================================================
  // FILTROS
  // =====================================================
  function initFiltros() {
    const ids = ['filtro-estado', 'filtro-placa', 'filtro-tipo', 'filtro-aseguradora', 'filtro-desde', 'filtro-hasta'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => { state.paginaActual = 1; cargarSolicitudes(); });
    });
    const placaInput = document.getElementById('filtro-placa');
    if (placaInput) placaInput.addEventListener('input', debounce(() => { state.paginaActual = 1; cargarSolicitudes(); }, 400));
  }

  function initBotones() {
    // Boton nueva solicitud (solo asesor y admin)
    const btnNueva = document.getElementById('btnNuevaSolicitud');
    if (state.esAdmin || state.esAsesor) {
      btnNueva.style.display = 'inline-block';
      btnNueva.addEventListener('click', modalNuevaSolicitud);
    }

    // Paginacion
    document.getElementById('btn-prev')?.addEventListener('click', () => {
      if (state.paginaActual > 1) { state.paginaActual--; cargarSolicitudes(); }
    });
    document.getElementById('btn-next')?.addEventListener('click', () => {
      const totalPaginas = Math.ceil(state.totalSolicitudes / state.pageSize);
      if (state.paginaActual < totalPaginas) { state.paginaActual++; cargarSolicitudes(); }
    });
  }

  // =====================================================
  // TAB 1: SOLICITUDES
  // =====================================================
  async function cargarSolicitudes() {
    try {
      const params = new URLSearchParams({
        page: state.paginaActual,
        pageSize: state.pageSize
      });
      const estado = document.getElementById('filtro-estado').value;
      const placa = document.getElementById('filtro-placa').value.trim();
      const tipo = document.getElementById('filtro-tipo').value;
      const aseg = document.getElementById('filtro-aseguradora').value;
      const desde = document.getElementById('filtro-desde').value;
      const hasta = document.getElementById('filtro-hasta').value;

      if (estado) params.set('estado', estado);
      if (placa) params.set('placa', placa);
      if (tipo) params.set('tipo_cliente', tipo);
      if (aseg) params.set('aseguradora_id', aseg);
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);

      const res = await apiFetch(`/cotizaciones/solicitudes?${params}`);
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error);

      state.solicitudes = data.items;
      state.totalSolicitudes = data.total;
      renderTablaSolicitudes();
    } catch (err) {
      console.error('Error cargando solicitudes:', err);
    }
  }

  function renderTablaSolicitudes() {
    const tbody = document.getElementById('tablaSolicitudes');
    if (!state.solicitudes.length) {
      tbody.innerHTML = '<tr><td colspan="8">No hay solicitudes</td></tr>';
      actualizarPaginacion();
      return;
    }

    tbody.innerHTML = state.solicitudes.map(s => `
      <tr>
        <td>${s.id}</td>
        <td><strong>${s.placa}</strong></td>
        <td><span class="badge ${s.tipo_cliente === 'Aseguradora' ? 'tipo-aseguradora' : 'tipo-particular'}">${s.tipo_cliente}</span></td>
        <td>${s.aseguradora || '-'}</td>
        <td>${badgeEstado(s.estado)}</td>
        <td>${s.creado_por}</td>
        <td>${s.fecha_creacion || '-'}</td>
        <td>
          <button class="btn-ver-detalle" onclick="COT.verDetalle(${s.id})">Ver</button>
          ${(state.esAdmin && (s.estado === 'Pendiente' || s.estado === 'Anulada'))
            ? `<button class="btn-rechazar" onclick="COT.eliminarSolicitud(${s.id})" style="margin-left:4px;">Eliminar</button>`
            : ''}
          ${(state.esAdmin && s.estado !== 'Anulada' && s.estado !== 'Recibida')
            ? `<button class="btn-estado-sm" style="background:#64748b;margin-left:4px;" onclick="COT.anularSolicitud(${s.id})">Anular</button>`
            : ''}
        </td>
      </tr>
    `).join('');

    actualizarPaginacion();
  }

  function actualizarPaginacion() {
    const total = Math.ceil(state.totalSolicitudes / state.pageSize) || 1;
    document.getElementById('page-info').textContent = `Pagina ${state.paginaActual} de ${total}`;
    document.getElementById('btn-prev').disabled = state.paginaActual === 1;
    document.getElementById('btn-next').disabled = state.paginaActual >= total;
  }

  function badgeEstado(estado) {
    const cls = {
      'Pendiente': 'badge-pendiente',
      'En Cotizacion': 'badge-en-cotizacion',
      'Cotizada': 'badge-cotizada',
      'Aprobada': 'badge-aprobada',
      'Rechazada': 'badge-rechazada',
      'Por Recibir': 'badge-por-recibir',
      'Recibida': 'badge-recibida',
      'Anulada': 'badge-anulada'
    };
    return `<span class="badge ${cls[estado] || ''}">${estado}</span>`;
  }

  // =====================================================
  // NUEVA SOLICITUD
  // =====================================================
  async function modalNuevaSolicitud() {
    const asegOptions = state.aseguradoras.filter(a => a.activa)
      .map(a => `<option value="${a.id}">${a.nombre}</option>`).join('');

    const { value: formData } = await Swal.fire({
      title: 'Nueva Solicitud de Cotizacion',
      width: 520,
      html: `
        <div class="form-group">
          <label>Placa del vehiculo *</label>
          <input id="sol-placa" class="swal2-input" placeholder="ABC-1234" style="text-transform:uppercase;">
          <div id="alerta-placa" style="display:none; color:#92400e; background:#fef3c7; padding:6px 10px; border-radius:6px; margin-top:6px; font-size:12px;"></div>
        </div>
        <div class="form-group">
          <label>Tipo de cliente *</label>
          <div style="display:flex; gap:16px; margin-top:6px;">
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="radio" name="tipo_cliente" value="Particular" checked> Particular
            </label>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="radio" name="tipo_cliente" value="Aseguradora"> Aseguradora
            </label>
          </div>
        </div>
        <div class="form-group" id="grupo-aseguradora" style="display:none;">
          <label>Aseguradora *</label>
          <div style="display:flex; gap:6px;">
            <select id="sol-aseguradora" class="swal2-select" style="flex:1;">
              <option value="">Seleccione...</option>
              ${asegOptions}
            </select>
            <button type="button" id="btn-nueva-aseg" class="btn-obs" style="padding:6px 10px; font-size:12px;">+</button>
          </div>
        </div>
        <div class="form-group">
          <label>Foto de proforma</label>
          <input id="sol-foto" type="file" accept="image/*" capture="environment" class="swal2-file" style="border:1px solid #d1d5db; border-radius:8px; padding:8px; width:100%; box-sizing:border-box;">
        </div>
        <div class="form-group">
          <label>Notas / Observaciones</label>
          <textarea id="sol-notas" class="swal2-textarea" placeholder="Detalle adicional..." style="height:60px;"></textarea>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Crear Solicitud',
      cancelButtonText: 'Cancelar',
      didOpen: () => {
        // Toggle aseguradora
        document.querySelectorAll('input[name="tipo_cliente"]').forEach(r => {
          r.addEventListener('change', () => {
            document.getElementById('grupo-aseguradora').style.display =
              r.value === 'Aseguradora' && r.checked ? 'block' : 'none';
          });
        });
        // Check placa duplicada
        const placaInput = document.getElementById('sol-placa');
        placaInput.addEventListener('input', debounce(async () => {
          const placa = placaInput.value.trim();
          const alerta = document.getElementById('alerta-placa');
          if (placa.length < 3) { alerta.style.display = 'none'; return; }
          try {
            const r = await apiFetch(`/cotizaciones/solicitudes/check-placa/${encodeURIComponent(placa)}`);
            const d = await safeJson(r);
            if (d.activas && d.activas.length > 0) {
              alerta.style.display = 'block';
              alerta.textContent = `Ya existe(n) ${d.activas.length} solicitud(es) activa(s) para esta placa (${d.activas.map(a => a.estado).join(', ')})`;
            } else {
              alerta.style.display = 'none';
            }
          } catch (e) { /* ignore */ }
        }, 500));
        // Nueva aseguradora
        document.getElementById('btn-nueva-aseg')?.addEventListener('click', async () => {
          const { value: nombre } = await Swal.fire({
            title: 'Nueva Aseguradora',
            input: 'text',
            inputPlaceholder: 'Nombre de la aseguradora',
            showCancelButton: true,
            inputValidator: v => !v?.trim() ? 'Nombre es obligatorio' : null
          });
          if (!nombre) return;
          try {
            const r = await apiFetch('/cotizaciones/aseguradoras', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ nombre: nombre.trim() })
            });
            const d = await safeJson(r);
            if (!r.ok) throw new Error(d?.error);
            state.aseguradoras.push(d);
            const sel = document.getElementById('sol-aseguradora');
            sel.innerHTML += `<option value="${d.id}">${d.nombre}</option>`;
            sel.value = d.id;
          } catch (e) {
            Swal.fire('Error', e.message, 'error');
          }
        });
      },
      preConfirm: () => {
        const placa = document.getElementById('sol-placa').value.trim();
        if (!placa) { Swal.showValidationMessage('Placa es obligatoria'); return false; }

        const tipo_cliente = document.querySelector('input[name="tipo_cliente"]:checked').value;
        const aseguradora_id = document.getElementById('sol-aseguradora').value;

        if (tipo_cliente === 'Aseguradora' && !aseguradora_id) {
          Swal.showValidationMessage('Debe seleccionar una aseguradora');
          return false;
        }

        const foto = document.getElementById('sol-foto').files[0] || null;
        const notas = document.getElementById('sol-notas').value.trim();

        return { placa, tipo_cliente, aseguradora_id, foto, notas };
      }
    });

    if (!formData) return;

    try {
      const fd = new FormData();
      fd.append('placa', formData.placa.toUpperCase());
      fd.append('tipo_cliente', formData.tipo_cliente);
      if (formData.aseguradora_id) fd.append('aseguradora_id', formData.aseguradora_id);
      if (formData.foto) fd.append('foto', formData.foto);
      if (formData.notas) fd.append('notas_asesor', formData.notas);

      const res = await apiFetch('/cotizaciones/solicitudes', {
        method: 'POST',
        body: fd
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error);

      Swal.fire('Solicitud creada', `ID: ${data.solicitud_id}`, 'success');
      cargarSolicitudes();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  }

  // =====================================================
  // VER DETALLE SOLICITUD
  // =====================================================
  async function verDetalle(id) {
    try {
      const res = await apiFetch(`/cotizaciones/solicitudes/${id}`);
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error);

      const sol = data.solicitud;
      const items = data.items;
      const total = data.total_ganadores;

      // Construir tabla comparativa
      let tablaHTML = '';
      if (items.length > 0) {
        tablaHTML = `<table class="tabla-cotizacion" style="margin-top:12px;">
          <thead><tr>
            <th>Repuesto</th><th>Cant</th>
            <th>Opcion 1</th><th>Opcion 2</th><th>Opcion 3</th>
          </tr></thead><tbody>`;

        items.forEach(item => {
          const opciones = item.opciones || [];
          let celdas = '';
          for (let i = 0; i < 3; i++) {
            const opc = opciones[i];
            if (opc) {
              const esGanador = opc.id === item.ganador_opcion_id;
              const bg = esGanador ? 'background:#ecfdf5;' : (!opc.disponible ? 'background:#fef2f2;' : '');
              celdas += `<td style="${bg}">
                <strong>${opc.proveedor_nombre || 'N/A'}</strong><br>
                $${Number(opc.precio_unitario).toFixed(2)}<br>
                <span class="${opc.tipo === 'Original' ? 'tipo-original' : 'tipo-alterno'}">${opc.tipo}</span>
                ${esGanador ? '<br><strong style="color:#059669;">GANADOR</strong>' : ''}
                ${!opc.disponible ? '<br><em style="color:#dc2626;font-size:11px;">No cotiza</em>' : ''}
              </td>`;
            } else {
              celdas += '<td style="color:#cbd5e1;">-</td>';
            }
          }
          tablaHTML += `<tr><td style="text-align:left;font-weight:500;">${item.nombre_repuesto}</td><td>${item.cantidad}</td>${celdas}</tr>`;
        });

        tablaHTML += `<tr class="total-row"><td colspan="2" style="text-align:right;">TOTAL GANADORES:</td><td colspan="3" style="text-align:left;font-size:16px;">$${Number(total).toFixed(2)}</td></tr>`;
        tablaHTML += '</tbody></table>';
      }

      // Observaciones
      let obsHTML = '';
      if (sol.observaciones_aprobacion) {
        const cls = sol.estado === 'Rechazada' ? 'obs-rechazo' : 'obs-aprobacion';
        obsHTML += `<div class="${cls}" style="margin-top:10px;"><strong>Observaciones del asesor:</strong> ${sol.observaciones_aprobacion}</div>`;
      }
      if (sol.observaciones_bodega) {
        obsHTML += `<div style="margin-top:8px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px 14px;font-size:13px;color:#0c4a6e;"><strong>Observaciones de bodega:</strong> ${sol.observaciones_bodega}</div>`;
      }

      // Foto proforma
      const fotoHTML = sol.foto_proforma_url
        ? `<div style="margin:10px 0;"><img src="${sol.foto_proforma_url}" style="max-width:100%;max-height:200px;border-radius:8px;cursor:pointer;" onclick="window.open('${sol.foto_proforma_url}','_blank')"></div>`
        : '';

      // Botones segun estado y rol
      let botonesHTML = '';
      if (sol.estado === 'Cotizada' && (state.esAsesor || state.esAdmin)) {
        botonesHTML = `
          <div style="margin-top:14px;display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
            <div style="flex:1;">
              <label style="font-size:12px;font-weight:600;color:#475569;">Observaciones / Modificaciones:</label>
              <textarea id="obs-aprobacion" style="width:100%;height:50px;border:1px solid #cbd5e1;border-radius:6px;padding:6px;font-size:13px;margin-top:4px;" placeholder="Opcional..."></textarea>
            </div>
            <button class="btn-aprobar" id="btn-modal-aprobar">Aprobar</button>
            <button class="btn-rechazar" id="btn-modal-rechazar">Rechazar</button>
          </div>`;
      }

      // PDF button
      let pdfBtnHTML = '';
      if (['Cotizada', 'Aprobada', 'Por Recibir', 'Recibida'].includes(sol.estado) && items.length > 0) {
        pdfBtnHTML = `<button class="btn-pdf" id="btn-export-pdf" style="margin-top:10px;">Exportar PDF</button>`;
      }

      const result = await Swal.fire({
        title: `Solicitud #${sol.id}`,
        width: 780,
        html: `
          <div style="text-align:left;">
            <div style="display:flex;gap:20px;flex-wrap:wrap;">
              <div style="flex:1;">
                <p><strong>Placa:</strong> ${sol.placa}</p>
                <p><strong>Tipo:</strong> <span class="badge ${sol.tipo_cliente === 'Aseguradora' ? 'tipo-aseguradora' : 'tipo-particular'}">${sol.tipo_cliente}</span></p>
                <p><strong>Aseguradora:</strong> ${sol.aseguradora_nombre || '-'}</p>
                <p><strong>Estado:</strong> ${badgeEstado(sol.estado)}</p>
                <p><strong>Creado por:</strong> ${sol.creado_por} (${sol.fecha_creacion_fmt || '-'})</p>
                ${sol.cotizado_por ? `<p><strong>Cotizado por:</strong> ${sol.cotizado_por} (${sol.fecha_cotizacion_fmt || '-'})</p>` : ''}
                ${sol.aprobado_por ? `<p><strong>${sol.estado === 'Rechazada' ? 'Rechazado' : 'Aprobado'} por:</strong> ${sol.aprobado_por} (${sol.fecha_aprobacion_fmt || '-'})</p>` : ''}
                ${sol.notas_asesor ? `<p><strong>Notas del asesor:</strong> ${sol.notas_asesor}</p>` : ''}
              </div>
              ${sol.foto_proforma_url ? `<div><img src="${sol.foto_proforma_url}" class="proforma-thumb" onclick="window.open('${sol.foto_proforma_url}','_blank')"></div>` : ''}
            </div>
            ${obsHTML}
            ${tablaHTML}
            ${botonesHTML}
            ${pdfBtnHTML}
          </div>
        `,
        showConfirmButton: true,
        confirmButtonText: 'Cerrar',
        didOpen: () => {
          // Aprobar
          document.getElementById('btn-modal-aprobar')?.addEventListener('click', async () => {
            const obs = document.getElementById('obs-aprobacion')?.value?.trim() || '';
            await cambiarEstado(sol.id, 'Aprobada', obs);
            Swal.close();
          });
          // Rechazar
          document.getElementById('btn-modal-rechazar')?.addEventListener('click', async () => {
            const obs = document.getElementById('obs-aprobacion')?.value?.trim() || '';
            if (!obs) {
              Swal.showValidationMessage('Debe agregar observaciones al rechazar');
              return;
            }
            await cambiarEstado(sol.id, 'Rechazada', obs);
            Swal.close();
          });
          // PDF
          document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
            exportarPDF(sol, items, total);
          });
        }
      });
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  }

  async function cambiarEstado(id, estado, observaciones) {
    try {
      const res = await apiFetch(`/cotizaciones/solicitudes/${id}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado, observaciones })
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error);
      Swal.fire('Actualizado', data.message, 'success');
      cargarSolicitudes();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  }

  async function eliminarSolicitud(id) {
    const { isConfirmed } = await Swal.fire({
      icon: 'warning', title: 'Eliminar solicitud',
      text: 'Esta accion no se puede deshacer.',
      showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Eliminar'
    });
    if (!isConfirmed) return;
    try {
      const res = await apiFetch(`/cotizaciones/solicitudes/${id}`, { method: 'DELETE' });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error);
      Swal.fire('Eliminada', '', 'success');
      cargarSolicitudes();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  }

  async function anularSolicitud(id) {
    const { isConfirmed } = await Swal.fire({
      icon: 'warning', title: 'Anular solicitud',
      text: 'La solicitud pasara a estado Anulada.',
      showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Anular'
    });
    if (!isConfirmed) return;
    await cambiarEstado(id, 'Anulada', null);
  }

  // =====================================================
  // TAB 2: COTIZAR (Workspace de bodega)
  // =====================================================
  async function cargarPendientesCotizar() {
    const container = document.getElementById('lista-pendientes');
    const workspace = document.getElementById('workspace-container');
    workspace.innerHTML = '';

    try {
      const res = await apiFetch('/cotizaciones/solicitudes?pageSize=50&estado=Pendiente');
      const res2 = await apiFetch('/cotizaciones/solicitudes?pageSize=50&estado=En Cotizacion');
      const res3 = await apiFetch('/cotizaciones/solicitudes?pageSize=50&estado=Rechazada');

      const d1 = await safeJson(res);
      const d2 = await safeJson(res2);
      const d3 = await safeJson(res3);

      const todas = [...(d1?.items || []), ...(d2?.items || []), ...(d3?.items || [])];

      if (!todas.length) {
        container.innerHTML = '<p style="color:#64748b;padding:20px;">No hay solicitudes pendientes de cotizar.</p>';
        return;
      }

      container.innerHTML = `
        <table>
          <thead><tr>
            <th>#</th><th>Placa</th><th>Tipo</th><th>Aseguradora</th><th>Estado</th><th>Creado por</th><th>Fecha</th><th>Accion</th>
          </tr></thead>
          <tbody>
            ${todas.map(s => `
              <tr>
                <td>${s.id}</td>
                <td><strong>${s.placa}</strong></td>
                <td><span class="badge ${s.tipo_cliente === 'Aseguradora' ? 'tipo-aseguradora' : 'tipo-particular'}">${s.tipo_cliente}</span></td>
                <td>${s.aseguradora || '-'}</td>
                <td>${badgeEstado(s.estado)}</td>
                <td>${s.creado_por}</td>
                <td>${s.fecha_creacion || '-'}</td>
                <td><button class="btn-cotizar" onclick="COT.abrirWorkspace(${s.id})">Cotizar</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    } catch (err) {
      container.innerHTML = '<p style="color:#dc2626;">Error cargando solicitudes</p>';
    }
  }

  async function abrirWorkspace(solicitudId) {
    const workspace = document.getElementById('workspace-container');
    state.workspaceSolicitudId = solicitudId;

    try {
      const res = await apiFetch(`/cotizaciones/solicitudes/${solicitudId}`);
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error);

      const sol = data.solicitud;
      const existingItems = data.items;

      // Observaciones de rechazo si las hay
      let obsHTML = '';
      if (sol.observaciones_aprobacion && sol.estado === 'Rechazada') {
        obsHTML = `<div class="obs-rechazo"><strong>Observaciones del asesor (rechazo):</strong> ${sol.observaciones_aprobacion}</div>`;
      }

      // Construir items iniciales o vacios
      const itemsData = existingItems.length > 0 ? existingItems : [{ nombre_repuesto: '', cantidad: 1, opciones: [] }];

      workspace.innerHTML = `
        <div class="workspace">
          <div class="workspace-header">
            <div class="info">
              <h3>Cotizar - Placa: ${sol.placa}</h3>
              <p>Tipo: <span class="badge ${sol.tipo_cliente === 'Aseguradora' ? 'tipo-aseguradora' : 'tipo-particular'}">${sol.tipo_cliente}</span>
                 ${sol.aseguradora_nombre ? ` | Aseguradora: <strong>${sol.aseguradora_nombre}</strong>` : ''}
              </p>
              ${sol.notas_asesor ? `<p>Notas del asesor: ${sol.notas_asesor}</p>` : ''}
            </div>
            ${sol.foto_proforma_url
              ? `<img src="${sol.foto_proforma_url}" class="proforma-thumb" onclick="window.open('${sol.foto_proforma_url}','_blank')" title="Click para agrandar">`
              : '<div style="width:120px;height:120px;background:#f1f5f9;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:12px;">Sin foto</div>'}
          </div>
          ${obsHTML}
          <div id="ws-items-container"></div>
          <button class="btn-add-item" id="btn-add-item">+ Agregar Repuesto</button>
          <div style="margin-top:12px;">
            <label style="font-size:12px;font-weight:600;color:#475569;">Observaciones de bodega:</label>
            <textarea id="ws-obs-bodega" style="width:100%;height:50px;border:1px solid #cbd5e1;border-radius:6px;padding:6px;font-size:13px;margin-top:4px;box-sizing:border-box;" placeholder="Opcional...">${sol.observaciones_bodega || ''}</textarea>
          </div>
          <div class="workspace-actions">
            <button class="btn-obs" id="btn-guardar-borrador">Guardar Borrador</button>
            <button class="btn-aprobar" id="btn-enviar-cotizacion">Enviar Cotizacion</button>
          </div>
        </div>`;

      renderWorkspaceItems(itemsData);

      document.getElementById('btn-add-item').addEventListener('click', () => {
        addWorkspaceItem();
      });

      document.getElementById('btn-guardar-borrador').addEventListener('click', () => {
        enviarCotizacion(solicitudId, false);
      });

      document.getElementById('btn-enviar-cotizacion').addEventListener('click', () => {
        enviarCotizacion(solicitudId, true);
      });
    } catch (err) {
      workspace.innerHTML = `<p style="color:#dc2626;">Error: ${err.message}</p>`;
    }
  }

  function renderWorkspaceItems(itemsData) {
    const container = document.getElementById('ws-items-container');
    const provOptions = state.proveedores.map(p =>
      `<option value="${p.id}">${p.nombre}</option>`
    ).join('');

    let html = `<table class="tabla-cotizacion">
      <thead><tr>
        <th class="col-repuesto">Repuesto</th>
        <th class="col-cant">Cant</th>
        <th class="col-proveedor">Proveedor 1</th><th class="col-precio">Precio 1</th><th class="col-tipo">Tipo 1</th>
        <th class="col-proveedor">Proveedor 2</th><th class="col-precio">Precio 2</th><th class="col-tipo">Tipo 2</th>
        <th class="col-proveedor">Proveedor 3</th><th class="col-precio">Precio 3</th><th class="col-tipo">Tipo 3</th>
        <th class="col-ganador">Ganador</th>
        <th class="col-acciones"></th>
      </tr></thead>
      <tbody id="ws-items-tbody">`;

    itemsData.forEach((item, idx) => {
      html += buildItemRow(idx, item, provOptions);
    });

    html += `</tbody>
      <tfoot><tr class="total-row">
        <td colspan="11" style="text-align:right;">TOTAL GANADORES:</td>
        <td colspan="2" id="ws-total" style="text-align:left;font-size:16px;">$0.00</td>
      </tr></tfoot>
    </table>`;

    container.innerHTML = html;

    // Event listeners para calcular total
    container.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('change', recalcularTotal);
      el.addEventListener('input', recalcularTotal);
    });

    recalcularTotal();
  }

  function buildItemRow(idx, item, provOptions) {
    const opciones = item.opciones || [];
    let cells = '';

    for (let o = 0; o < 3; o++) {
      const opc = opciones[o] || {};
      cells += `
        <td><select data-item="${idx}" data-opc="${o}" data-field="proveedor" class="ws-prov">
          <option value="">-</option>${provOptions}
        </select>
        <button type="button" style="font-size:10px;margin-top:2px;background:none;border:none;color:var(--primary);cursor:pointer;" onclick="COT.quickAddProveedor(this)">+ Nuevo</button>
        </td>
        <td><input type="number" step="0.01" min="0" data-item="${idx}" data-opc="${o}" data-field="precio"
            value="${opc.precio_unitario || ''}" placeholder="0.00" class="ws-precio"></td>
        <td><select data-item="${idx}" data-opc="${o}" data-field="tipo" class="ws-tipo">
          <option value="Original" ${opc.tipo === 'Alterno' ? '' : 'selected'}>Original</option>
          <option value="Alterno" ${opc.tipo === 'Alterno' ? 'selected' : ''}>Alterno</option>
        </select></td>`;
    }

    // Determinar ganador
    let ganadorIdx = -1;
    if (item.ganador_opcion_id && opciones.length) {
      ganadorIdx = opciones.findIndex(o => o.id === item.ganador_opcion_id);
    }

    return `<tr data-row="${idx}">
      <td><input type="text" data-item="${idx}" data-field="nombre" value="${item.nombre_repuesto || ''}" placeholder="Nombre del repuesto" class="ws-nombre"></td>
      <td><input type="number" min="1" data-item="${idx}" data-field="cantidad" value="${item.cantidad || 1}" style="width:45px;" class="ws-cant"></td>
      ${cells}
      <td>
        <select data-item="${idx}" data-field="ganador" class="ws-ganador" style="width:55px;">
          <option value="-1">-</option>
          <option value="0" ${ganadorIdx === 0 ? 'selected' : ''}>1</option>
          <option value="1" ${ganadorIdx === 1 ? 'selected' : ''}>2</option>
          <option value="2" ${ganadorIdx === 2 ? 'selected' : ''}>3</option>
        </select>
      </td>
      <td><button class="btn-remove-item" onclick="COT.removeItem(this)" title="Eliminar">&times;</button></td>
    </tr>`;
  }

  function addWorkspaceItem() {
    const tbody = document.getElementById('ws-items-tbody');
    if (!tbody) return;
    const idx = tbody.rows.length;
    const provOptions = state.proveedores.map(p =>
      `<option value="${p.id}">${p.nombre}</option>`
    ).join('');

    const tr = document.createElement('tr');
    tr.dataset.row = idx;
    tr.innerHTML = buildItemRow(idx, { nombre_repuesto: '', cantidad: 1, opciones: [] }, provOptions)
      .replace(/<tr[^>]*>/, '').replace(/<\/tr>/, '');

    tbody.appendChild(tr);

    // Re-bind events
    tr.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('change', recalcularTotal);
      el.addEventListener('input', recalcularTotal);
    });
  }

  function removeItem(btn) {
    const tr = btn.closest('tr');
    if (tr) {
      tr.remove();
      recalcularTotal();
    }
  }

  function recalcularTotal() {
    const tbody = document.getElementById('ws-items-tbody');
    if (!tbody) return;
    let total = 0;

    tbody.querySelectorAll('tr').forEach(row => {
      const ganadorSel = row.querySelector('.ws-ganador');
      const ganadorIdx = parseInt(ganadorSel?.value || '-1');
      const cantidad = parseInt(row.querySelector('.ws-cant')?.value || '1') || 1;

      if (ganadorIdx >= 0) {
        const precio = parseFloat(row.querySelectorAll('.ws-precio')[ganadorIdx]?.value || '0') || 0;
        total += precio * cantidad;
      }
    });

    const el = document.getElementById('ws-total');
    if (el) el.textContent = `$${total.toFixed(2)}`;
  }

  async function enviarCotizacion(solicitudId, finalizar) {
    const tbody = document.getElementById('ws-items-tbody');
    if (!tbody) return;

    const items = [];
    let valid = true;

    tbody.querySelectorAll('tr').forEach(row => {
      const nombre = row.querySelector('.ws-nombre')?.value?.trim();
      if (!nombre) return; // skip empty rows

      const cantidad = parseInt(row.querySelector('.ws-cant')?.value || '1') || 1;
      const ganadorIdx = parseInt(row.querySelector('.ws-ganador')?.value || '-1');

      const opciones = [];
      const provSels = row.querySelectorAll('.ws-prov');
      const precios = row.querySelectorAll('.ws-precio');
      const tipos = row.querySelectorAll('.ws-tipo');

      for (let o = 0; o < 3; o++) {
        const prov = provSels[o]?.value;
        const precio = precios[o]?.value;
        const tipo = tipos[o]?.value || 'Original';

        if (prov && precio) {
          opciones.push({
            proveedor_id: parseInt(prov),
            precio_unitario: parseFloat(precio),
            tipo,
            disponible: true
          });
        } else if (prov && !precio) {
          // Proveedor sin precio = no cotiza
          opciones.push({
            proveedor_id: parseInt(prov),
            precio_unitario: 0,
            tipo,
            disponible: false
          });
        }
      }

      if (finalizar && ganadorIdx < 0) valid = false;

      items.push({
        nombre_repuesto: nombre,
        cantidad,
        opciones,
        ganador_index: ganadorIdx >= 0 ? ganadorIdx : undefined
      });
    });

    if (items.length === 0) {
      Swal.fire('Error', 'Debe agregar al menos un repuesto', 'error');
      return;
    }

    if (finalizar && !valid) {
      Swal.fire('Error', 'Todos los repuestos deben tener un ganador seleccionado', 'error');
      return;
    }

    const obs = document.getElementById('ws-obs-bodega')?.value?.trim() || '';

    try {
      if (finalizar) {
        // Enviar cotizacion completa (bulk)
        const res = await apiFetch(`/cotizaciones/solicitudes/${solicitudId}/cotizar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, observaciones_bodega: obs })
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data?.error);
        Swal.fire('Cotizacion enviada', 'El asesor sera notificado.', 'success');
        cargarPendientesCotizar();
        document.getElementById('workspace-container').innerHTML = '';
      } else {
        // Guardar borrador: enviar como bulk sin cambiar estado
        // Primero borrar items existentes y recrear
        // Usamos el endpoint item por item
        // Mas simple: enviar bulk pero con un endpoint de save draft
        // Por ahora usamos el mismo endpoint pero con estado manual
        // Save items one by one
        for (const item of items) {
          await apiFetch(`/cotizaciones/solicitudes/${solicitudId}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre_repuesto: item.nombre_repuesto, cantidad: item.cantidad })
          });
        }
        Swal.fire('Borrador guardado', 'Los items se guardaron.', 'success');
      }
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  }

  async function quickAddProveedor(btn) {
    const { value: nombre } = await Swal.fire({
      title: 'Nuevo Proveedor',
      input: 'text',
      inputPlaceholder: 'Nombre del proveedor',
      showCancelButton: true,
      inputValidator: v => !v?.trim() ? 'Nombre es obligatorio' : null
    });
    if (!nombre) return;
    try {
      const r = await apiFetch('/proveedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim() })
      });
      const d = await safeJson(r);
      if (!r.ok) throw new Error(d?.error);
      state.proveedores.push(d);

      // Update all provider selects
      document.querySelectorAll('.ws-prov').forEach(sel => {
        sel.innerHTML += `<option value="${d.id}">${d.nombre}</option>`;
      });

      // Select in the closest select
      const td = btn.closest('td');
      const sel = td?.querySelector('select');
      if (sel) sel.value = d.id;

      Swal.fire('Proveedor creado', d.nombre, 'success');
    } catch (e) {
      Swal.fire('Error', e.message, 'error');
    }
  }

  // =====================================================
  // TAB 3: POR RECIBIR
  // =====================================================
  async function cargarPorRecibir() {
    const tbody = document.getElementById('tablaPorRecibir');
    try {
      const res = await apiFetch('/cotizaciones/solicitudes?pageSize=50&estado=Por Recibir');
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error);

      const items = data.items || [];
      if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="7">No hay solicitudes por recibir</td></tr>';
        return;
      }

      tbody.innerHTML = items.map(s => `
        <tr>
          <td>${s.id}</td>
          <td><strong>${s.placa}</strong></td>
          <td><span class="badge ${s.tipo_cliente === 'Aseguradora' ? 'tipo-aseguradora' : 'tipo-particular'}">${s.tipo_cliente}</span></td>
          <td>${s.aseguradora || '-'}</td>
          <td>${s.cotizado_por || '-'}</td>
          <td>${s.fecha_cotizacion || '-'}</td>
          <td>
            <button class="btn-ver-detalle" onclick="COT.verDetalle(${s.id})">Ver</button>
            <button class="btn-aprobar" onclick="COT.marcarRecibida(${s.id})" style="margin-left:4px;">Recibida</button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7" style="color:#dc2626;">Error cargando datos</td></tr>';
    }
  }

  async function marcarRecibida(id) {
    const { isConfirmed } = await Swal.fire({
      icon: 'question',
      title: 'Marcar como Recibida',
      text: 'Confirma que los repuestos fueron recibidos fisicamente.',
      showCancelButton: true,
      confirmButtonText: 'Si, recibida'
    });
    if (!isConfirmed) return;
    await cambiarEstado(id, 'Recibida', null);
    cargarPorRecibir();
  }

  // =====================================================
  // EXPORTAR PDF
  // =====================================================
  function exportarPDF(sol, items, total) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4'); // landscape

    doc.setFontSize(16);
    doc.text(`Cotizacion - Placa: ${sol.placa}`, 14, 20);

    doc.setFontSize(10);
    doc.text(`Tipo: ${sol.tipo_cliente}${sol.aseguradora_nombre ? ' | Aseguradora: ' + sol.aseguradora_nombre : ''}`, 14, 28);
    doc.text(`Creado por: ${sol.creado_por} | Cotizado por: ${sol.cotizado_por || '-'} | Estado: ${sol.estado}`, 14, 34);
    doc.text(`Fecha: ${sol.fecha_creacion_fmt || '-'}`, 14, 40);

    const tableData = items.map(item => {
      const opciones = item.opciones || [];
      const row = [item.nombre_repuesto, item.cantidad];

      for (let i = 0; i < 3; i++) {
        const opc = opciones[i];
        if (opc) {
          const esGanador = opc.id === item.ganador_opcion_id;
          row.push(opc.proveedor_nombre || '-');
          row.push(opc.disponible ? `$${Number(opc.precio_unitario).toFixed(2)}` : 'No cotiza');
          row.push(`${opc.tipo}${esGanador ? ' *' : ''}`);
        } else {
          row.push('-', '-', '-');
        }
      }
      return row;
    });

    // Total row
    tableData.push(['TOTAL GANADORES', '', '', `$${Number(total).toFixed(2)}`, '', '', '', '', '', '', '']);

    doc.autoTable({
      startY: 46,
      head: [['Repuesto', 'Cant', 'Proveedor 1', 'Precio 1', 'Tipo 1', 'Proveedor 2', 'Precio 2', 'Tipo 2', 'Proveedor 3', 'Precio 3', 'Tipo 3']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [43, 122, 158], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      styles: { cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 40 } }
    });

    doc.save(`Cotizacion_${sol.placa}_${sol.id}.pdf`);
  }

  // =====================================================
  // EXPOSE GLOBAL (para onclick en HTML)
  // =====================================================
  window.COT = {
    verDetalle,
    eliminarSolicitud,
    anularSolicitud,
    abrirWorkspace,
    removeItem,
    quickAddProveedor,
    marcarRecibida
  };

})();
