document.addEventListener('DOMContentLoaded', () => {

  // === DOM refs ===
  const tablaPrestamos  = document.getElementById('tabla-prestamos');
  const tablaResumen    = document.getElementById('tabla-resumen');
  const buscador        = document.getElementById('buscar-prestamo');
  const selTipo         = document.getElementById('filtro-tipo');
  const selEstado       = document.getElementById('filtro-estado');
  const filtroMes       = document.getElementById('filtro-mes');
  const paginacionDiv   = document.getElementById('paginacion-prestamos');

  // KPIs
  const kpiEmpleados    = document.getElementById('kpi-empleados');
  const kpiMonto        = document.getElementById('kpi-monto');
  const kpiPendientes   = document.getElementById('kpi-pendientes');
  const resumenTotal    = document.getElementById('resumen-total');

  // Nuevo prestamo
  const selEmpleado     = document.getElementById('nuevo-empleado');
  const inpFecha        = document.getElementById('nuevo-fecha');
  const selNuevoTipo    = document.getElementById('nuevo-tipo');
  const inpValor        = document.getElementById('nuevo-valor');
  const inpCuotas       = document.getElementById('nuevo-cuotas');
  const inpObservacion  = document.getElementById('nuevo-observacion');
  const previewCuotas   = document.getElementById('preview-cuotas');
  const btnGuardar      = document.getElementById('btn-guardar-prestamo');

  // Botones
  const btnExportar     = document.getElementById('btn-exportar');
  const btnProcesarMes  = document.getElementById('btn-procesar-mes');
  const btnGuardarCorte = document.getElementById('btn-guardar-corte');
  const inpDiaCorte     = document.getElementById('dia-corte');

  let paginaActual = 1;
  let diaCorte = 25;
  const PAGE_SIZE = 20;

  // === Helpers ===
  function formatFecha(f) {
    if (!f) return '-';
    const s = f.substring(0, 10);
    const [y, m, d] = s.split('-');
    return `${parseInt(d)}/${parseInt(m)}/${y}`;
  }

  function formatMoney(v) {
    return '$' + parseFloat(v || 0).toFixed(2);
  }

  const TIPO_LABELS = {
    PRESTAMO: 'Prestamo',
    PRESTAMO_TALLER: 'Prestamo Taller',
    ANTICIPO: 'Anticipo',
    QUINCENA: 'Quincena',
    REPROCESO: 'Reproceso',
    FALTA_INJUSTIFICADA: 'Falta Injust.',
    RIFA_SOLIDARIO: 'Rifa Solidario',
    USO_PERSONAL: 'Uso Personal'
  };

  function tipoLabel(t) { return TIPO_LABELS[t] || t; }

  function estadoBadge(e) {
    const colors = {
      EN_PROCESO: '#f59e0b',
      FINALIZADO: '#10b981',
      ANULADO: '#ef4444'
    };
    const labels = { EN_PROCESO: 'En Proceso', FINALIZADO: 'Finalizado', ANULADO: 'Anulado' };
    const c = colors[e] || '#6b7280';
    return `<span style="background:${c};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">${labels[e] || e}</span>`;
  }

  function mesActual() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  // === Auth ===
  if (!getToken()) { redirectLogin(); return; }

  apiFetch('/auth/me')
    .then(async res => {
      if (!res || !res.ok) { redirectLogin(); return; }
      const data = await safeJson(res);
      if (!['admin', 'asistente_contable'].includes(data.rol)) {
        Swal.fire('Acceso denegado', 'No tienes permisos para este modulo', 'error');
        return window.location.href = 'inventario.html';
      }
      init();
    });

  function init() {
    // Default mes
    filtroMes.value = mesActual();
    inpFecha.value = new Date().toISOString().slice(0, 10);

    // Subtabs
    document.querySelectorAll('.subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.subtab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('panel-' + btn.dataset.tab).classList.add('active');

        if (btn.dataset.tab === 'resumen') cargarResumen();
        if (btn.dataset.tab === 'anual') cargarResumenAnual();
        if (btn.dataset.tab === 'nuevo') cargarEmpleados();
      });
    });

    // Filtros prestamos
    buscador.addEventListener('input', debounce(() => { paginaActual = 1; cargarPrestamos(); }, 400));
    selTipo.addEventListener('change', () => { paginaActual = 1; cargarPrestamos(); });
    selEstado.addEventListener('change', () => { paginaActual = 1; cargarPrestamos(); });

    // Filtro mes resumen
    filtroMes.addEventListener('change', cargarResumen);

    // Preview cuotas
    inpValor.addEventListener('input', actualizarPreview);
    inpCuotas.addEventListener('input', actualizarPreview);
    inpFecha.addEventListener('change', actualizarPreview);

    // Guardar prestamo
    btnGuardar.addEventListener('click', guardarPrestamo);

    // Exportar
    btnExportar.addEventListener('click', exportarExcel);

    // Procesar mes
    btnProcesarMes.addEventListener('click', procesarMes);

    // Config dia corte
    btnGuardarCorte.addEventListener('click', guardarDiaCorte);
    cargarConfiguracion();

    // Resumen anual
    const filtroAnio = document.getElementById('filtro-anio');
    const anioActual = new Date().getFullYear();
    for (let y = anioActual; y >= anioActual - 5; y--) {
      filtroAnio.appendChild(Object.assign(document.createElement('option'), { value: y, textContent: y }));
    }
    filtroAnio.addEventListener('change', cargarResumenAnual);
    document.getElementById('btn-exportar-anual').addEventListener('click', exportarAnual);

    // Cargar datos iniciales
    cargarPrestamos();
  }

  // ==========================================================
  // PANEL 1: PRESTAMOS
  // ==========================================================
  function cargarPrestamos() {
    tablaPrestamos.innerHTML = '<tr><td colspan="10">Cargando...</td></tr>';

    const params = new URLSearchParams();
    params.set('page', paginaActual);
    params.set('pageSize', PAGE_SIZE);
    if (buscador.value.trim()) params.set('q', buscador.value.trim());
    if (selTipo.value) params.set('tipo', selTipo.value);
    if (selEstado.value) params.set('estado', selEstado.value);

    apiFetch('/descuentos/prestamos?' + params.toString())
      .then(res => {
        if (!res.ok) throw new Error('Status ' + res.status);
        return res.json();
      })
      .then(resp => {
        renderPrestamos(resp.data, resp.total, resp.page, resp.pageSize);
      })
      .catch(err => {
        console.error(err);
        tablaPrestamos.innerHTML = `<tr><td colspan="11">Error: ${err.message}</td></tr>`;
      });
  }

  function renderPrestamos(data, total, page, pageSize) {
    document.getElementById('contador-prestamos').textContent = `${total} prestamo(s) encontrado(s)`;

    if (!data.length) {
      tablaPrestamos.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#94a3b8;">No hay prestamos</td></tr>';
      paginacionDiv.innerHTML = '';
      return;
    }

    tablaPrestamos.innerHTML = data.map((p, i) => {
      const cuotasRestantes = p.cuotas_mes - (p.cuotas_pagadas || 0);
      const montoRestante = +(p.valor - (p.monto_pagado || 0)).toFixed(2);
      return `
      <tr>
        <td style="text-align:center;">${(page - 1) * pageSize + i + 1}</td>
        <td>${formatFecha(p.fecha)}</td>
        <td>${p.nombre} ${p.apellido}</td>
        <td>${p.cargo || '-'}</td>
        <td>${tipoLabel(p.tipo)}</td>
        <td style="text-align:right;">${formatMoney(p.valor)}</td>
        <td style="text-align:right;">${formatMoney(montoRestante)}</td>
        <td style="text-align:center;">${p.cuotas_pagadas || 0}/${p.cuotas_mes}</td>
        <td style="text-align:center;">${cuotasRestantes}</td>
        <td>${estadoBadge(p.estado)}</td>
        <td style="text-align:center;">
          <button onclick="verDetalle(${p.id})" class="btn-obs" style="font-size:12px;padding:3px 10px;">Ver</button>
        </td>
      </tr>`;
    }).join('');

    // Paginación
    const totalPages = Math.ceil(total / pageSize);
    if (totalPages <= 1) { paginacionDiv.innerHTML = ''; return; }

    let html = '';
    for (let pg = 1; pg <= totalPages; pg++) {
      const active = pg === page ? 'background:var(--primary);color:#fff;' : 'background:#e2e8f0;color:#374151;';
      html += `<button onclick="irPagina(${pg})" style="${active}border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:13px;font-weight:600;">${pg}</button>`;
    }
    paginacionDiv.innerHTML = html;
  }

  window.irPagina = function(pg) {
    paginaActual = pg;
    cargarPrestamos();
  };

  window.verDetalle = function(id) {
    apiFetch('/descuentos/prestamos/' + id)
      .then(res => res.json())
      .then(p => {
        const cuotasHtml = p.cuotas.map(c => `
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 10px;text-align:center;">${c.numero_cuota}</td>
            <td style="padding:6px 10px;">${c.mes}</td>
            <td style="padding:6px 10px;text-align:right;">${formatMoney(c.monto)}</td>
            <td style="padding:6px 10px;text-align:center;">
              ${c.pagada
                ? '<span style="color:#10b981;font-weight:600;">Pagada</span>'
                : '<span style="color:#f59e0b;font-weight:600;">Pendiente</span>'}
            </td>
            <td style="padding:6px 10px;text-align:center;">
              ${!c.pagada && p.estado !== 'ANULADO'
                ? `<button onclick="marcarPagada(${c.id}, ${id})" style="background:#10b981;color:#fff;border:none;border-radius:4px;padding:4px 12px;font-size:12px;cursor:pointer;font-weight:600;">Pagar</button>`
                : (c.pagada_por ? `<span style="font-size:11px;color:#94a3b8;">${c.pagada_por}</span>` : '')}
            </td>
          </tr>
        `).join('');

        const cuotasPagadas = p.cuotas.filter(c => c.pagada).length;
        const montoPagado = p.cuotas.filter(c => c.pagada).reduce((s, c) => s + parseFloat(c.monto), 0);

        Swal.fire({
          title: `${p.nombre} ${p.apellido}`,
          html: `
            <div style="text-align:left;font-size:13px;line-height:1.6;">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;margin-bottom:12px;">
                <div><span style="color:#64748b;">Tipo:</span> <strong>${tipoLabel(p.tipo)}</strong></div>
                <div><span style="color:#64748b;">Estado:</span> <strong>${p.estado.replace('_', ' ')}</strong></div>
                <div><span style="color:#64748b;">Valor total:</span> <strong>${formatMoney(p.valor)}</strong></div>
                <div><span style="color:#64748b;">Cuotas:</span> <strong>${cuotasPagadas}/${p.cuotas_mes}</strong> (${formatMoney(p.valor_cuota)} c/u)</div>
                <div><span style="color:#64748b;">Fecha:</span> <strong>${formatFecha(p.fecha)}</strong></div>
                <div><span style="color:#64748b;">Restante:</span> <strong style="color:#dc2626;">${formatMoney(p.valor - montoPagado)}</strong></div>
              </div>
              ${p.observacion ? `<div style="background:#f8fafc;padding:6px 10px;border-radius:4px;margin-bottom:10px;font-size:12px;color:#64748b;"><strong>Obs:</strong> ${p.observacion}</div>` : ''}
              <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                  <tr style="background:#0f4c81;color:#fff;">
                    <th style="padding:6px 8px;text-align:center;font-weight:600;">#</th>
                    <th style="padding:6px 8px;font-weight:600;">Mes</th>
                    <th style="padding:6px 8px;text-align:right;font-weight:600;">Monto</th>
                    <th style="padding:6px 8px;text-align:center;font-weight:600;">Estado</th>
                    <th style="padding:6px 8px;text-align:center;font-weight:600;">Accion</th>
                  </tr>
                </thead>
                <tbody>${cuotasHtml}</tbody>
              </table>
            </div>
          `,
          customClass: { popup: 'swal-wide' },
          showCancelButton: true,
          confirmButtonText: 'Imprimir solicitud',
          confirmButtonColor: '#6366f1',
          cancelButtonText: 'Cerrar',
          cancelButtonColor: '#64748b'
        }).then(r => {
          if (r.isConfirmed) imprimirSolicitud(p);
        });
      })
      .catch(err => Swal.fire('Error', err.message, 'error'));
  };

  window.marcarPagada = function(cuotaId, prestamoId) {
    apiFetch('/descuentos/cuotas/' + cuotaId + '/pagar', { method: 'PATCH' })
      .then(res => res.json())
      .then(data => {
        if (data.error) return Swal.fire('Error', data.error, 'error');
        Swal.close();
        verDetalle(prestamoId);
        cargarPrestamos();
      })
      .catch(err => Swal.fire('Error', err.message, 'error'));
  };

  // ==========================================================
  // PANEL 2: RESUMEN MENSUAL
  // ==========================================================
  function cargarResumen() {
    const mes = filtroMes.value;
    if (!mes) return;

    tablaResumen.innerHTML = '<tr><td colspan="8">Cargando...</td></tr>';

    apiFetch('/descuentos/resumen-mensual?mes=' + mes)
      .then(res => res.json())
      .then(data => {
        kpiEmpleados.textContent = data.total_empleados;
        kpiMonto.textContent = formatMoney(data.total_general);
        kpiPendientes.textContent = data.pendientes;
        resumenTotal.textContent = formatMoney(data.total_general);

        if (!data.empleados.length) {
          tablaResumen.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#94a3b8;">Sin descuentos para este mes</td></tr>';
          return;
        }

        tablaResumen.innerHTML = data.empleados.map((e, i) => {
          const cuotaInfo = (e.detalle || []).map(d => `${d.numero_cuota}/${d.cuotas_mes}`).join(', ');
          return `
          <tr>
            <td style="text-align:center;">${i + 1}</td>
            <td>${e.cedula || '-'}</td>
            <td>${e.nombre} ${e.apellido}</td>
            <td>${e.cargo || '-'}</td>
            <td style="text-align:right;font-weight:600;">${formatMoney(e.total_descuento)}</td>
            <td style="text-align:center;">${cuotaInfo}</td>
            <td style="text-align:center;">
              ${e.todas_pagadas
                ? '<span style="color:#10b981;font-weight:600;">Procesado</span>'
                : '<span style="color:#f59e0b;font-weight:600;">Pendiente</span>'}
            </td>
            <td style="text-align:center;">
              <button onclick="verDetalleResumen(${e.empleado_id}, '${mes}')" class="btn-obs" style="font-size:11px;padding:2px 8px;">Ver</button>
            </td>
          </tr>`;
        }).join('');
      })
      .catch(err => {
        console.error(err);
        tablaResumen.innerHTML = `<tr><td colspan="8">Error: ${err.message}</td></tr>`;
      });
  }

  window.verDetalleResumen = function(empleadoId, mes) {
    apiFetch('/descuentos/resumen-mensual?mes=' + mes)
      .then(res => res.json())
      .then(data => {
        const emp = data.empleados.find(e => e.empleado_id === empleadoId);
        if (!emp) return;

        const detalleHtml = emp.detalle.map(d => `
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 10px;">${tipoLabel(d.tipo)}</td>
            <td style="padding:6px 10px;text-align:center;">${d.numero_cuota}/${d.cuotas_mes}</td>
            <td style="padding:6px 10px;text-align:right;">${formatMoney(d.valor_total)}</td>
            <td style="padding:6px 10px;text-align:right;font-weight:600;">${formatMoney(d.monto)}</td>
            <td style="padding:6px 10px;text-align:center;">
              ${d.pagada
                ? '<span style="color:#10b981;font-weight:600;">Pagada</span>'
                : '<span style="color:#f59e0b;font-weight:600;">Pendiente</span>'}
            </td>
          </tr>
        `).join('');

        Swal.fire({
          title: `${emp.nombre} ${emp.apellido}`,
          html: `
            <div style="text-align:left;font-size:13px;line-height:1.6;">
              <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
                <div><span style="color:#64748b;">Mes:</span> <strong>${mes}</strong></div>
                <div><span style="color:#64748b;">Total descuento:</span> <strong style="color:#0f4c81;">${formatMoney(emp.total_descuento)}</strong></div>
              </div>
              <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                  <tr style="background:#0f4c81;color:#fff;">
                    <th style="padding:6px 8px;font-weight:600;">Tipo</th>
                    <th style="padding:6px 8px;text-align:center;font-weight:600;">Cuota</th>
                    <th style="padding:6px 8px;text-align:right;font-weight:600;">Prest.</th>
                    <th style="padding:6px 8px;text-align:right;font-weight:600;">Monto</th>
                    <th style="padding:6px 8px;text-align:center;font-weight:600;">Estado</th>
                  </tr>
                </thead>
                <tbody>${detalleHtml}</tbody>
              </table>
            </div>
          `,
          customClass: { popup: 'swal-wide' },
          confirmButtonText: 'Cerrar',
          confirmButtonColor: '#64748b'
        });
      });
  };

  function exportarExcel() {
    const mes = filtroMes.value;
    if (!mes) return;
    const url = API_BASE_URL + '/descuentos/resumen-mensual/exportar?mes=' + mes;
    const token = getToken();
    fetch(url, { headers: { Authorization: 'Bearer ' + token } })
      .then(res => {
        if (!res.ok) throw new Error('Error al exportar');
        return res.blob();
      })
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `descuentos-${mes}.xlsx`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(err => Swal.fire('Error', err.message, 'error'));
  }

  function procesarMes() {
    const mes = filtroMes.value;
    if (!mes) return;

    Swal.fire({
      title: 'Procesar mes?',
      text: `Se marcaran todas las cuotas de ${mes} como pagadas. Esta accion no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Si, procesar',
      cancelButtonText: 'Cancelar'
    }).then(result => {
      if (!result.isConfirmed) return;

      apiFetch('/descuentos/resumen-mensual/procesar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes })
      })
        .then(res => res.json())
        .then(data => {
          if (data.error) return Swal.fire('Error', data.error, 'error');
          Swal.fire('Procesado', data.message, 'success');
          cargarResumen();
        })
        .catch(err => Swal.fire('Error', err.message, 'error'));
    });
  }

  // ==========================================================
  // PANEL 3: NUEVO PRESTAMO
  // ==========================================================
  let empleadosCargados = false;

  function cargarEmpleados() {
    if (empleadosCargados) return;
    apiFetch('/empleados')
      .then(res => res.json())
      .then(data => {
        const activos = data.filter(e => e.activo !== false);
        selEmpleado.innerHTML = '<option value="">Seleccionar empleado...</option>' +
          activos.map(e => `<option value="${e.id}">${e.nombre} ${e.apellido} - ${e.cargo || ''}</option>`).join('');
        empleadosCargados = true;
      })
      .catch(err => console.error('Error cargando empleados:', err));
  }

  function actualizarPreview() {
    const valor = parseFloat(inpValor.value);
    const cuotas = parseInt(inpCuotas.value);
    const fecha = inpFecha.value;

    if (!valor || valor <= 0 || !cuotas || cuotas < 1 || !fecha) {
      previewCuotas.style.display = 'none';
      return;
    }

    const valorCuota = Math.floor((valor / cuotas) * 100) / 100;
    const ultima = +(valor - valorCuota * (cuotas - 1)).toFixed(2);

    let html = `<strong>Preview:</strong> ${cuotas} cuota(s) de ${formatMoney(valorCuota)}`;
    if (ultima !== valorCuota) html += ` (ultima: ${formatMoney(ultima)})`;
    html += '<br><span style="font-size:12px;color:#64748b;">Meses: ';

    const meses = [];
    const [anio, mesNum, dia] = fecha.split('-').map(Number);
    const mesOffset = dia > diaCorte ? 1 : 0;
    for (let i = 0; i < Math.min(cuotas, 12); i++) {
      const totalMes = (anio * 12 + (mesNum - 1)) + i + mesOffset;
      meses.push(`${Math.floor(totalMes / 12)}-${String((totalMes % 12) + 1).padStart(2, '0')}`);
    }
    html += meses.join(', ');
    if (cuotas > 12) html += '...';
    html += '</span>';

    previewCuotas.innerHTML = html;
    previewCuotas.style.display = 'block';
  }

  function guardarPrestamo() {
    const empleado_id = selEmpleado.value;
    const fecha = inpFecha.value;
    const tipo = selNuevoTipo.value;
    const valor = inpValor.value;
    const cuotas_mes = inpCuotas.value;
    const observacion = inpObservacion.value.trim();

    if (!empleado_id || !fecha || !tipo || !valor || !cuotas_mes) {
      return Swal.fire('Campos requeridos', 'Empleado, fecha, tipo, valor y cuotas son obligatorios', 'warning');
    }

    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando...';

    apiFetch('/descuentos/prestamos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empleado_id: parseInt(empleado_id),
        fecha,
        tipo,
        valor: parseFloat(valor),
        cuotas_mes: parseInt(cuotas_mes),
        observacion: observacion || null
      })
    })
      .then(res => res.json())
      .then(data => {
        btnGuardar.disabled = false;
        btnGuardar.textContent = 'Guardar Prestamo';

        if (data.error) return Swal.fire('Error', data.error, 'error');

        Swal.fire({
          title: 'Guardado',
          text: `Prestamo #${data.id} creado con ${data.cuotas.length} cuota(s)`,
          icon: 'success',
          showCancelButton: true,
          confirmButtonText: 'Imprimir solicitud',
          cancelButtonText: 'Cerrar'
        }).then(r => {
          if (r.isConfirmed) imprimirSolicitud(data);
        });

        // Limpiar form
        selEmpleado.value = '';
        inpFecha.value = new Date().toISOString().slice(0, 10);
        selNuevoTipo.value = '';
        inpValor.value = '';
        inpCuotas.value = '1';
        inpObservacion.value = '';
        previewCuotas.style.display = 'none';

        // Ir a panel prestamos
        document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.subtab-panel').forEach(p => p.classList.remove('active'));
        document.querySelector('[data-tab="prestamos"]').classList.add('active');
        document.getElementById('panel-prestamos').classList.add('active');
        paginaActual = 1;
        selEstado.value = '';
        cargarPrestamos();
      })
      .catch(err => {
        btnGuardar.disabled = false;
        btnGuardar.textContent = 'Guardar Prestamo';
        Swal.fire('Error', err.message, 'error');
      });
  }

  // ==========================================================
  // PANEL: RESUMEN ANUAL
  // ==========================================================
  const MESES_NOMBRE = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  function cargarResumenAnual() {
    const anio = document.getElementById('filtro-anio').value;
    const tEmpleados = document.getElementById('tabla-anual-empleados');
    const tMeses = document.getElementById('tabla-anual-meses');
    const tTipos = document.getElementById('tabla-anual-tipos');

    tEmpleados.innerHTML = '<tr><td colspan="7">Cargando...</td></tr>';
    tMeses.innerHTML = '';
    tTipos.innerHTML = '';

    apiFetch('/descuentos/resumen-anual?anio=' + anio)
      .then(res => res.json())
      .then(data => {
        document.getElementById('kpi-anual-total').textContent = formatMoney(data.total_cobrado + data.total_pendiente);
        document.getElementById('kpi-anual-prestamos').textContent = data.total_prestamos;
        document.getElementById('kpi-anual-empleados').textContent = data.total_empleados;
        document.getElementById('kpi-anual-pendiente').textContent = formatMoney(data.total_pendiente);

        if (!data.por_empleado.length) {
          tEmpleados.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;">Sin datos para este anio</td></tr>';
          document.getElementById('anual-total-cobrado').textContent = '$0.00';
          document.getElementById('anual-total-pendiente').textContent = '$0.00';
          return;
        }

        tEmpleados.innerHTML = data.por_empleado.map((e, i) => `
          <tr>
            <td style="text-align:center;">${i + 1}</td>
            <td>${e.cedula || '-'}</td>
            <td>${e.nombre} ${e.apellido}</td>
            <td>${e.cargo || '-'}</td>
            <td style="text-align:right;">${formatMoney(e.total_cobrado)}</td>
            <td style="text-align:right;">${formatMoney(e.total_pendiente)}</td>
            <td style="text-align:center;">${e.num_prestamos}</td>
          </tr>
        `).join('');

        document.getElementById('anual-total-cobrado').textContent = formatMoney(data.total_cobrado);
        document.getElementById('anual-total-pendiente').textContent = formatMoney(data.total_pendiente);

        tMeses.innerHTML = data.por_mes.map(m => {
          const [, mn] = m.mes.split('-').map(Number);
          return `
          <tr>
            <td>${MESES_NOMBRE[mn - 1]}</td>
            <td style="text-align:center;">${m.empleados}</td>
            <td style="text-align:center;">${m.num_cuotas}</td>
            <td style="text-align:right;">${formatMoney(m.monto)}</td>
            <td style="text-align:center;">
              ${m.todas_pagadas
                ? '<span style="color:#10b981;font-weight:600;">Procesado</span>'
                : '<span style="color:#f59e0b;font-weight:600;">Pendiente</span>'}
            </td>
          </tr>`;
        }).join('');

        tTipos.innerHTML = data.por_tipo.map(t => `
          <tr>
            <td>${tipoLabel(t.tipo)}</td>
            <td style="text-align:center;">${t.cantidad}</td>
            <td style="text-align:right;">${formatMoney(t.monto_total)}</td>
            <td style="text-align:right;">${formatMoney(t.cobrado)}</td>
            <td style="text-align:right;">${formatMoney(t.pendiente)}</td>
          </tr>
        `).join('');
      })
      .catch(err => {
        tEmpleados.innerHTML = `<tr><td colspan="7">Error: ${err.message}</td></tr>`;
      });
  }

  function exportarAnual() {
    const anio = document.getElementById('filtro-anio').value;
    const url = API_BASE_URL + '/descuentos/resumen-anual/exportar?anio=' + anio;
    const token = getToken();
    fetch(url, { headers: { Authorization: 'Bearer ' + token } })
      .then(res => {
        if (!res.ok) throw new Error('Error al exportar');
        return res.blob();
      })
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `descuentos-anual-${anio}.xlsx`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(err => Swal.fire('Error', err.message, 'error'));
  }

  // ==========================================================
  // CONFIGURACION
  // ==========================================================
  function cargarConfiguracion() {
    apiFetch('/descuentos/configuracion')
      .then(res => res.json())
      .then(config => {
        if (config.dia_corte) {
          inpDiaCorte.value = config.dia_corte;
          diaCorte = parseInt(config.dia_corte);
        }
      })
      .catch(() => {});
  }

  function guardarDiaCorte() {
    const dia = inpDiaCorte.value;
    if (!dia) return;

    apiFetch('/descuentos/configuracion', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dia_corte: parseInt(dia) })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) return Swal.fire('Error', data.error, 'error');
        diaCorte = parseInt(dia);
        actualizarPreview();
        Swal.fire({ title: 'Guardado', text: 'Dia de corte actualizado', icon: 'success', timer: 1500, showConfirmButton: false });
      })
      .catch(err => Swal.fire('Error', err.message, 'error'));
  }

  // ==========================================================
  // IMPRIMIR SOLICITUD
  // ==========================================================
  const MOTIVO_LABELS = {
    PRESTAMO: 'Prestamo personal',
    PRESTAMO_TALLER: 'Prestamo por servicio de taller',
    ANTICIPO: 'Anticipo de sueldo',
    QUINCENA: 'Quincena',
    REPROCESO: 'Descuento por reproceso',
    FALTA_INJUSTIFICADA: 'Falta injustificada',
    RIFA_SOLIDARIO: 'Apoyo rifa solidario',
    USO_PERSONAL: 'Uso personal'
  };

  function imprimirSolicitud(p) {
    const nombreCompleto = `${p.nombre || ''} ${p.apellido || ''}`.trim().toUpperCase();
    const cedula = p.cedula || '';
    const fechaSol = formatFecha(p.fecha);
    const valorNum = parseFloat(p.valor);
    const valor = formatMoney(valorNum);
    const cuotas = p.cuotas_mes || (p.cuotas ? p.cuotas.length : 1);
    const motivo = MOTIVO_LABELS[p.tipo] || tipoLabel(p.tipo);

    const mesesNombre = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    let primerMes = '';
    if (p.cuotas && p.cuotas.length) {
      const [a, m] = p.cuotas[0].mes.split('-').map(Number);
      primerMes = `${mesesNombre[m - 1]} ${a}`;
    }

    const logoUrl = window.location.origin + '/img/logo.png';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Solicitud - ${nombreCompleto}</title>
<style>
  @page { size: letter; margin: 1.8cm 2cm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1e293b; line-height: 1.5; }

  .page { max-width: 720px; margin: 0 auto; padding: 20px 0; }

  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #0f4c81; padding-bottom: 14px; margin-bottom: 20px; }
  .header-logo img { height: 55px; }
  .header-title { text-align: right; }
  .header-title h1 { font-size: 15pt; color: #0f4c81; margin: 0; letter-spacing: 0.5px; }
  .header-title p { font-size: 9pt; color: #64748b; margin-top: 2px; }

  .datos-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 20px; padding: 12px 16px; background: #f8fafc; border-radius: 6px; border-left: 4px solid #0f4c81; }
  .dato { display: flex; gap: 8px; }
  .dato-label { font-weight: 700; font-size: 9pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; min-width: 55px; }
  .dato-valor { font-weight: 600; color: #1e293b; }

  .cuerpo { margin-bottom: 20px; text-align: justify; font-size: 11pt; }
  .cuerpo p { margin-bottom: 10px; }
  .valor-dest { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 4px; padding: 1px 10px; font-weight: 700; color: #0f4c81; }

  .motivo-box { border: 1.5px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; margin-top: 6px; min-height: 40px; font-weight: 600; color: #334155; background: #fff; }

  .firma-center { text-align: center; margin-top: 55px; }
  .firma-line { width: 260px; border-top: 1.5px solid #334155; margin: 0 auto; padding-top: 6px; font-weight: 700; font-size: 10pt; color: #334155; }
  .firma-ci { font-size: 9pt; color: #64748b; margin-top: 2px; }

  .autorizacion { margin-top: 30px; border: 1.5px solid #0f4c81; border-radius: 8px; overflow: hidden; }
  .auto-header { background: #0f4c81; color: #fff; text-align: center; padding: 6px; font-weight: 700; font-size: 11pt; letter-spacing: 1px; }
  .auto-body { padding: 16px 20px; }
  .auto-body p { margin-bottom: 10px; }
  .check-row { display: flex; gap: 40px; margin: 10px 0; }
  .check-opt { display: flex; align-items: center; gap: 6px; font-weight: 700; }
  .check-box { width: 16px; height: 16px; border: 1.5px solid #334155; border-radius: 3px; }

  .firmas-row { display: flex; justify-content: space-between; margin-top: 50px; }
  .firma-col { text-align: center; width: 44%; }
  .firma-col .firma-line { width: 100%; }
  .firma-nombre { font-size: 10pt; color: #64748b; margin-top: 3px; }

  .footer { margin-top: 20px; text-align: center; font-size: 8pt; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }

  @media print {
    body { margin: 0; }
    .page { padding: 0; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="header-logo"><img src="${logoUrl}" alt="Global Motriz"></div>
    <div class="header-title">
      <h1>SOLICITUD DE ANTICIPO / PRESTAMO</h1>
      <p>Global Motriz S.A. &mdash; Recursos Humanos</p>
    </div>
  </div>

  <div class="datos-grid">
    <div class="dato"><span class="dato-label">Fecha:</span><span class="dato-valor">${fechaSol}</span></div>
    <div class="dato"><span class="dato-label">C.I.:</span><span class="dato-valor">${cedula}</span></div>
    <div class="dato" style="grid-column:1/-1;"><span class="dato-label">Nombre:</span><span class="dato-valor">${nombreCompleto}</span></div>
  </div>

  <div class="cuerpo">
    <p>Por medio del presente solicito su autorizaci&oacute;n para que me otorgue un anticipo / pr&eacute;stamo de USD <span class="valor-dest">${valor}</span>, el cual lo cancelar&eacute; en <span class="valor-dest">${cuotas}</span> cuotas. Autorizo para que el valor correspondiente sea descontado de mi rol de pagos.</p>
    <p>El anticipo o pr&eacute;stamo lo solicito por el siguiente motivo:</p>
    <div class="motivo-box">${motivo}</div>
  </div>

  <div class="firma-center">
    <div class="firma-line">FIRMA DEL SOLICITANTE</div>
    <div class="firma-ci">C.I. ${cedula}</div>
  </div>

  <div class="autorizacion">
    <div class="auto-header">AUTORIZACI&Oacute;N</div>
    <div class="auto-body">
      <p>Revisada su solicitud informo que:</p>
      <div class="check-row">
        <div class="check-opt"><div class="check-box"></div> SI SE AUTORIZA</div>
        <div class="check-opt"><div class="check-box"></div> NO SE AUTORIZA</div>
      </div>
      <p style="margin-top:14px;">El monto aprobado es de USD _____________, que ser&aacute; descontado en <span class="valor-dest">${cuotas}</span> cuotas, a partir del mes de <span class="valor-dest">${primerMes}</span>.</p>

      <div class="firmas-row">
        <div class="firma-col">
          <div class="firma-line">AUTORIZADO POR:</div>
          <div class="firma-nombre">SANTIAGO ALBAN</div>
        </div>
        <div class="firma-col">
          <div class="firma-line">REGISTRADO POR:</div>
          <div class="firma-nombre">RRHH / CONTABILIDAD</div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">Documento generado por Sistema Global Motriz &mdash; ${new Date().toLocaleDateString('es-EC')}</div>

</div>
</body>
</html>`;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;';
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();

    iframe.contentWindow.onafterprint = () => document.body.removeChild(iframe);
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }, 300);
  }

});
