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
          <tr>
            <td style="text-align:center;">${c.numero_cuota}</td>
            <td>${c.mes}</td>
            <td style="text-align:right;">${formatMoney(c.monto)}</td>
            <td style="text-align:center;">
              ${c.pagada
                ? '<span style="color:#10b981;font-weight:600;">Pagada</span>'
                : '<span style="color:#f59e0b;font-weight:600;">Pendiente</span>'}
            </td>
            <td style="text-align:center;">
              ${!c.pagada && p.estado !== 'ANULADO'
                ? `<button onclick="marcarPagada(${c.id}, ${id})" style="background:#10b981;color:#fff;border:none;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">Pagar</button>`
                : (c.pagada_por ? `<span style="font-size:11px;color:#94a3b8;">${c.pagada_por}</span>` : '')}
            </td>
          </tr>
        `).join('');

        Swal.fire({
          title: `${p.nombre} ${p.apellido}`,
          html: `
            <div style="text-align:left;font-size:13px;">
              <p><strong>Tipo:</strong> ${tipoLabel(p.tipo)} | <strong>Estado:</strong> ${p.estado.replace('_', ' ')}</p>
              <p><strong>Valor total:</strong> ${formatMoney(p.valor)} | <strong>Cuotas:</strong> ${p.cuotas_mes} x ${formatMoney(p.valor_cuota)}</p>
              <p><strong>Fecha:</strong> ${formatFecha(p.fecha)}${p.observacion ? ' | <strong>Obs:</strong> ' + p.observacion : ''}</p>
              <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:12px;">
                <thead>
                  <tr style="background:#f1f5f9;">
                    <th style="padding:4px 8px;">#</th>
                    <th style="padding:4px 8px;">Mes</th>
                    <th style="padding:4px 8px;text-align:right;">Monto</th>
                    <th style="padding:4px 8px;">Estado</th>
                    <th style="padding:4px 8px;">Accion</th>
                  </tr>
                </thead>
                <tbody>${cuotasHtml}</tbody>
              </table>
            </div>
          `,
          width: 620,
          showCloseButton: true,
          showConfirmButton: false
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

        tablaResumen.innerHTML = data.empleados.map((e, i) => `
          <tr>
            <td style="text-align:center;">${i + 1}</td>
            <td>${e.cedula || '-'}</td>
            <td>${e.nombre} ${e.apellido}</td>
            <td>${e.cargo || '-'}</td>
            <td style="text-align:right;font-weight:600;">${formatMoney(e.total_descuento)}</td>
            <td style="text-align:center;">${e.num_cuotas}</td>
            <td style="text-align:center;">
              ${e.todas_pagadas
                ? '<span style="color:#10b981;font-weight:600;">Procesado</span>'
                : '<span style="color:#f59e0b;font-weight:600;">Pendiente</span>'}
            </td>
            <td style="text-align:center;">
              <button onclick="verDetalleResumen(${e.empleado_id}, '${mes}')" class="btn-obs" style="font-size:11px;padding:2px 8px;">Ver</button>
            </td>
          </tr>
        `).join('');
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
          <tr>
            <td>${tipoLabel(d.tipo)}</td>
            <td style="text-align:right;">${formatMoney(d.valor_total)}</td>
            <td style="text-align:right;font-weight:600;">${formatMoney(d.monto)}</td>
            <td style="text-align:center;">${d.pagada ? 'Pagada' : 'Pendiente'}</td>
          </tr>
        `).join('');

        Swal.fire({
          title: `${emp.nombre} ${emp.apellido} - ${mes}`,
          html: `
            <div style="text-align:left;font-size:13px;">
              <p><strong>Total descuento:</strong> ${formatMoney(emp.total_descuento)}</p>
              <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:12px;">
                <thead>
                  <tr style="background:#f1f5f9;">
                    <th style="padding:4px 8px;">Tipo</th>
                    <th style="padding:4px 8px;text-align:right;">Valor Prest.</th>
                    <th style="padding:4px 8px;text-align:right;">Cuota Mes</th>
                    <th style="padding:4px 8px;">Estado</th>
                  </tr>
                </thead>
                <tbody>${detalleHtml}</tbody>
              </table>
            </div>
          `,
          width: 500,
          showCloseButton: true,
          showConfirmButton: false
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
    const [anio, mesNum] = fecha.split('-').map(Number);
    for (let i = 0; i < Math.min(cuotas, 12); i++) {
      const totalMes = (anio * 12 + (mesNum - 1)) + i;
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

        Swal.fire('Guardado', `Prestamo #${data.id} creado con ${data.cuotas.length} cuota(s)`, 'success');

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
  // CONFIGURACION
  // ==========================================================
  function cargarConfiguracion() {
    apiFetch('/descuentos/configuracion')
      .then(res => res.json())
      .then(config => {
        if (config.dia_corte) inpDiaCorte.value = config.dia_corte;
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
        Swal.fire({ title: 'Guardado', text: 'Dia de corte actualizado', icon: 'success', timer: 1500, showConfirmButton: false });
      })
      .catch(err => Swal.fire('Error', err.message, 'error'));
  }

});
