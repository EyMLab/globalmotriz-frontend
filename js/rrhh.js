document.addEventListener('DOMContentLoaded', () => {

  const tablaInfo        = document.getElementById('tabla-info-empleados');
  const buscador         = document.getElementById('buscar-empleado');
  const selLocalidad     = document.getElementById('filtro-localidad-rrhh');
  const selCargo         = document.getElementById('filtro-cargo-rrhh');
  const selEstado        = document.getElementById('filtro-estado-rrhh');

  let empleados = [];
  let rolUsuario = '';

  function formatFecha(f) {
    if (!f) return '-';
    const s = f.substring(0, 10);
    const [y, m, d] = s.split('-');
    return `${parseInt(d)}/${parseInt(m)}/${y}`;
  }

  if (!getToken()) { redirectLogin(); return; }

  apiFetch('/auth/me')
    .then(async res => {
      if (!res || !res.ok) { redirectLogin(); return; }
      const data = await safeJson(res);
      if (!['admin', 'control', 'asistente_contable'].includes(data.rol)) {
        Swal.fire('Acceso denegado', 'No tienes permisos para este modulo', 'error');
        return window.location.href = 'dashboard.html';
      }
      rolUsuario = data.rol;
      if (rolUsuario !== 'admin') {
        document.querySelectorAll('.col-acciones-rrhh').forEach(el => el.style.display = 'none');
      }
      cargarEmpleados();
    });

  // ===============================
  // Info Empleados
  // ===============================
  function cargarEmpleados() {
    const cols = rolUsuario === 'admin' ? 10 : 9;
    tablaInfo.innerHTML = `<tr><td colspan="${cols}">Cargando...</td></tr>`;
    apiFetch('/empleados')
      .then(res => {
        if (!res.ok) throw new Error('Status ' + res.status);
        return res.json();
      })
      .then(data => {
        empleados = data;
        poblarFiltroCargo();
        renderInfoEmpleados();
        // Si el dashboard ya estaba abierto, re-renderizarlo con los nuevos datos
        if (_dashboardRenderizado) renderDashboard();
      })
      .catch(err => {
        console.error('Error cargando empleados:', err);
        const colsErr = rolUsuario === 'admin' ? 10 : 9;
        tablaInfo.innerHTML = `<tr><td colspan="${colsErr}">Error al cargar empleados: ${err.message}</td></tr>`;
      });
  }

  // Poblar el select de cargos con los valores únicos de los empleados
  function poblarFiltroCargo() {
    if (!selCargo) return;
    const cargos = [...new Set(empleados.map(e => e.cargo).filter(Boolean))].sort();
    selCargo.innerHTML = '<option value="">Todos los cargos</option>';
    cargos.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      selCargo.appendChild(opt);
    });
  }

  function renderInfoEmpleados() {
    tablaInfo.innerHTML = '';

    const textoBusqueda = buscador ? buscador.value.trim().toLowerCase() : '';
    const localidadFiltro = selLocalidad ? selLocalidad.value : '';
    const cargoFiltro     = selCargo    ? selCargo.value    : '';
    const estadoFiltro    = selEstado   ? selEstado.value   : 'activo';

    let lista = empleados.filter(e => {
      // Filtro estado
      if (estadoFiltro === 'activo'   && !e.activo)  return false;
      if (estadoFiltro === 'inactivo' &&  e.activo)  return false;

      // Filtro localidad
      if (localidadFiltro && e.localidad !== localidadFiltro) return false;

      // Filtro cargo
      if (cargoFiltro && e.cargo !== cargoFiltro) return false;

      // Búsqueda texto
      if (textoBusqueda) {
        const nombre = `${e.nombre} ${e.apellido}`.toLowerCase();
        const cedula = (e.cedula || '').toLowerCase();
        if (!nombre.includes(textoBusqueda) && !cedula.includes(textoBusqueda)) return false;
      }

      return true;
    });

    // Contador de empleados filtrados
    const contadorEl = document.getElementById('contador-empleados');
    if (contadorEl) {
      contadorEl.textContent = `Total: ${lista.length} empleado${lista.length !== 1 ? 's' : ''}`;
    }

    // Mostrar u ocultar botón resumen según si hay datos
    const btnResumen = document.getElementById('btn-resumen-tallas');
    if (btnResumen) btnResumen.style.display = lista.length ? 'inline-block' : 'none';

    const cols = rolUsuario === 'admin' ? 10 : 9;
    if (!lista.length) {
      tablaInfo.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;">No se encontraron empleados</td></tr>`;
      return;
    }

    lista.forEach((e, idx) => {
      const tr = document.createElement('tr');
      const fechaNac = formatFecha(e.fecha_nacimiento);
      const fechaIng = formatFecha(e.fecha_ingreso);

      // Resumen compacto de tallas con etiquetas
      const [tz, tp, tc, tch] = [e.talla_zapatos, e.talla_pantalon, e.talla_camiseta, e.talla_chompa].map(t => t || '—');
      const tallas = `
        <div style="display:grid;grid-template-columns:repeat(4,auto);gap:0 10px;font-size:11px;line-height:1.4;text-align:center;">
          <span style="color:#9ca3af;font-weight:600;">Z</span>
          <span style="color:#9ca3af;font-weight:600;">P</span>
          <span style="color:#9ca3af;font-weight:600;">C</span>
          <span style="color:#9ca3af;font-weight:600;">CH</span>
          <span>${tz}</span><span>${tp}</span><span>${tc}</span><span>${tch}</span>
        </div>`;

      const btnEditar = rolUsuario === 'admin'
        ? `<td class="user-actions"><button class="btn-obs" onclick="editarInfoEmpleado(${e.id})">Editar</button></td>`
        : '';

      tr.innerHTML = `
        <td style="text-align:center;color:#6b7280;font-weight:500;">${idx + 1}</td>
        <td>${e.nombre} ${e.apellido}</td>
        <td>${e.cedula || '-'}</td>
        <td>${fechaNac}</td>
        <td>${fechaIng}</td>
        <td><span class="badge-localidad badge-${(e.localidad || 'MATRIZ').toLowerCase()}">${e.localidad || 'MATRIZ'}</span></td>
        <td>${e.cargo}</td>
        <td style="white-space:nowrap;">${tallas}</td>
        <td><span class="badge ${e.activo ? 'badge-ok' : 'badge-off'}">${e.activo ? 'Activo' : 'Inactivo'}</span></td>
        ${btnEditar}
      `;
      tablaInfo.appendChild(tr);
    });
  }

  // ===============================
  // Event listeners de filtros
  // ===============================
  if (buscador) {
    let timer;
    buscador.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => renderInfoEmpleados(), 300);
    });
  }

  [selLocalidad, selCargo, selEstado].forEach(sel => {
    if (sel) sel.addEventListener('change', () => renderInfoEmpleados());
  });

  // ===============================
  // Resumen de tallas para compras
  // ===============================
  function contarTallas(campo) {
    const mapa = {};
    empleados.filter(e => e.activo).forEach(e => {
      const t = e[campo] || null;
      if (!t) return; // omitir sin talla
      mapa[t] = (mapa[t] || 0) + 1;
    });
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  }

  function filasTallas(lista) {
    if (!lista.length) return '<tr><td colspan="2" style="color:#9ca3af;font-size:12px;">Sin datos</td></tr>';
    return lista.map(([t, n]) =>
      `<tr><td style="padding:2px 8px;font-weight:600;">${t}</td><td style="padding:2px 8px;">× ${n}</td></tr>`
    ).join('');
  }

  function mostrarResumenTallas() {
    const activos = empleados.filter(e => e.activo).length;
    const zapatos  = contarTallas('talla_zapatos');
    const pantalon = contarTallas('talla_pantalon');
    const camiseta = contarTallas('talla_camiseta');
    const chompa   = contarTallas('talla_chompa');

    Swal.fire({
      title: 'Resumen de tallas',
      width: 700,
      html: `
        <p style="color:#6b7280;font-size:13px;margin-bottom:14px;">Empleados activos: <strong>${activos}</strong></p>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;text-align:left;">
          <div>
            <p style="font-weight:700;font-size:13px;margin:0 0 6px;color:#4f46e5;border-bottom:2px solid #4f46e5;padding-bottom:4px;">Calzado</p>
            <table style="width:100%;font-size:13px;">${filasTallas(zapatos)}</table>
          </div>
          <div>
            <p style="font-weight:700;font-size:13px;margin:0 0 6px;color:#0891b2;border-bottom:2px solid #0891b2;padding-bottom:4px;">Pantalón</p>
            <table style="width:100%;font-size:13px;">${filasTallas(pantalon)}</table>
          </div>
          <div>
            <p style="font-weight:700;font-size:13px;margin:0 0 6px;color:#16a34a;border-bottom:2px solid #16a34a;padding-bottom:4px;">Camisa</p>
            <table style="width:100%;font-size:13px;">${filasTallas(camiseta)}</table>
          </div>
          <div>
            <p style="font-weight:700;font-size:13px;margin:0 0 6px;color:#dc2626;border-bottom:2px solid #dc2626;padding-bottom:4px;">Chompa</p>
            <table style="width:100%;font-size:13px;">${filasTallas(chompa)}</table>
          </div>
        </div>
      `,
      confirmButtonText: 'Cerrar',
      showCancelButton: false,
    });
  }

  // Bind botón resumen
  const btnResumen = document.getElementById('btn-resumen-tallas');
  if (btnResumen) btnResumen.addEventListener('click', mostrarResumenTallas);

  // ===============================
  // TABS (Empleados / Dashboard)
  // ===============================
  let _dashboardRenderizado = false;
  document.querySelectorAll('.subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.subtab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-' + tab)?.classList.add('active');
      if (tab === 'dashboard') {
        renderDashboard();
        _dashboardRenderizado = true;
      }
    });
  });

  // ===============================
  // DASHBOARD - cálculo de antigüedad y renderizado
  // ===============================

  // Calcula diferencia entre dos fechas en años, meses, días
  function diffAniosMesesDias(desde, hasta) {
    let d1 = new Date(desde + 'T00:00:00');
    let d2 = new Date(hasta);
    if (isNaN(d1) || isNaN(d2)) return { anios: 0, meses: 0, dias: 0, totalDias: 0 };

    let anios = d2.getFullYear() - d1.getFullYear();
    let meses = d2.getMonth() - d1.getMonth();
    let dias  = d2.getDate() - d1.getDate();

    if (dias < 0) {
      meses -= 1;
      // días del mes anterior
      const mesAnterior = new Date(d2.getFullYear(), d2.getMonth(), 0).getDate();
      dias += mesAnterior;
    }
    if (meses < 0) {
      anios -= 1;
      meses += 12;
    }

    const totalDias = Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
    return { anios, meses, dias, totalDias };
  }

  function formatAntiguedad(a, m, d) {
    if (a <= 0 && m <= 0) return `${d} día${d !== 1 ? 's' : ''}`;
    if (a <= 0) return `${m}m ${d}d`;
    return `${a}a ${m}m ${d}d`;
  }

  function rangoAntiguedad(anios) {
    if (anios < 1)   return '< 1 año';
    if (anios <= 3)  return '1 - 3 años';
    if (anios <= 5)  return '3 - 5 años';
    if (anios <= 10) return '5 - 10 años';
    return '10+ años';
  }

  // Referencias a charts para destruir/recrear
  const _charts = { cargos: null, localidad: null, cargoLoc: null, antiguedad: null };

  function renderDashboard() {
    const activos = empleados.filter(e => e.activo);
    const hoy = new Date();
    const anioActual = hoy.getFullYear();

    // ---- KPIs ----
    const totalActivos = activos.length;
    const enMatriz     = activos.filter(e => (e.localidad || 'MATRIZ') === 'MATRIZ').length;
    const enSucursal   = activos.filter(e => e.localidad === 'SUCURSAL').length;
    const nuevosAnio   = activos.filter(e => {
      if (!e.fecha_ingreso) return false;
      return parseInt(e.fecha_ingreso.substring(0, 4)) === anioActual;
    }).length;

    // Antigüedad promedio (en días → años)
    const conIngreso = activos.filter(e => e.fecha_ingreso);
    let totalDiasSum = 0;
    conIngreso.forEach(e => {
      totalDiasSum += diffAniosMesesDias(e.fecha_ingreso.substring(0, 10), hoy).totalDias;
    });
    const promedioDias = conIngreso.length ? totalDiasSum / conIngreso.length : 0;
    const promedioAnios = Math.floor(promedioDias / 365.25);
    const promedioMeses = Math.floor((promedioDias - promedioAnios * 365.25) / 30.44);

    document.getElementById('kpi-total').textContent      = totalActivos;
    document.getElementById('kpi-matriz').textContent     = enMatriz;
    document.getElementById('kpi-sucursal').textContent   = enSucursal;
    document.getElementById('kpi-nuevos').textContent     = nuevosAnio;
    document.getElementById('kpi-anio-actual').textContent= anioActual;
    document.getElementById('kpi-antiguedad').textContent =
      conIngreso.length ? `${promedioAnios}a ${promedioMeses}m` : '—';

    // ---- Datos para gráficos ----
    const porCargo = {};
    activos.forEach(e => {
      const c = e.cargo || 'SIN CARGO';
      porCargo[c] = (porCargo[c] || 0) + 1;
    });
    const cargosSorted = Object.entries(porCargo).sort((a, b) => b[1] - a[1]);

    const porLocalidad = { MATRIZ: enMatriz, SUCURSAL: enSucursal };

    // Cargo × Localidad: por cada cargo, cuántos en MATRIZ y cuántos en SUCURSAL
    const cargosLista = cargosSorted.map(c => c[0]);
    const matrizPorCargo = cargosLista.map(c => activos.filter(e => e.cargo === c && (e.localidad || 'MATRIZ') === 'MATRIZ').length);
    const sucursalPorCargo = cargosLista.map(c => activos.filter(e => e.cargo === c && e.localidad === 'SUCURSAL').length);

    // Antigüedad por rangos
    const rangos = { '< 1 año': 0, '1 - 3 años': 0, '3 - 5 años': 0, '5 - 10 años': 0, '10+ años': 0 };
    conIngreso.forEach(e => {
      const { anios } = diffAniosMesesDias(e.fecha_ingreso.substring(0, 10), hoy);
      rangos[rangoAntiguedad(anios)]++;
    });

    // ---- Renderizar charts ----
    renderChartCargos(cargosSorted);
    renderChartLocalidad(porLocalidad);
    renderChartCargoLoc(cargosLista, matrizPorCargo, sucursalPorCargo);
    renderChartAntiguedad(rangos);

    // ---- Tabla de antigüedad (más antiguo → más nuevo) ----
    renderTablaAntiguedad(conIngreso, hoy);
  }

  function destruirChart(key) {
    if (_charts[key]) { _charts[key].destroy(); _charts[key] = null; }
  }

  function renderChartCargos(cargosSorted) {
    const ctx = document.getElementById('chart-cargos')?.getContext('2d');
    if (!ctx) return;
    destruirChart('cargos');
    _charts.cargos = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: cargosSorted.map(c => c[0]),
        datasets: [{
          label: 'Empleados',
          data: cargosSorted.map(c => c[1]),
          backgroundColor: '#2B7A9E',
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } }
        }
      }
    });
  }

  function renderChartLocalidad(porLoc) {
    const ctx = document.getElementById('chart-localidad')?.getContext('2d');
    if (!ctx) return;
    destruirChart('localidad');
    _charts.localidad = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(porLoc),
        datasets: [{
          data: Object.values(porLoc),
          backgroundColor: ['#2B7A9E', '#5BC0BE'],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 12 } } }
        }
      }
    });
  }

  function renderChartCargoLoc(cargos, matriz, sucursal) {
    const ctx = document.getElementById('chart-cargo-loc')?.getContext('2d');
    if (!ctx) return;
    destruirChart('cargoLoc');
    _charts.cargoLoc = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: cargos,
        datasets: [
          { label: 'MATRIZ',   data: matriz,   backgroundColor: '#2B7A9E', borderRadius: 3 },
          { label: 'SUCURSAL', data: sucursal, backgroundColor: '#5BC0BE', borderRadius: 3 }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { stacked: false, beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
          y: { stacked: false }
        }
      }
    });
  }

  function renderChartAntiguedad(rangos) {
    const ctx = document.getElementById('chart-antiguedad')?.getContext('2d');
    if (!ctx) return;
    destruirChart('antiguedad');
    const colores = ['#94a3b8', '#60a5fa', '#0891b2', '#16a34a', '#1e3a5f'];
    _charts.antiguedad = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: Object.keys(rangos),
        datasets: [{
          data: Object.values(rangos),
          backgroundColor: colores,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } }
        }
      }
    });
  }

  function renderTablaAntiguedad(conIngreso, hoy) {
    const tbody = document.getElementById('tabla-antiguedad');
    if (!tbody) return;
    if (!conIngreso.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#9ca3af;">Sin empleados activos con fecha de ingreso</td></tr>';
      return;
    }
    // Ordenar de más antiguo a más nuevo
    const ordenados = [...conIngreso].sort((a, b) => {
      return new Date(a.fecha_ingreso) - new Date(b.fecha_ingreso);
    });
    tbody.innerHTML = ordenados.map((e, idx) => {
      const d = diffAniosMesesDias(e.fecha_ingreso.substring(0, 10), hoy);
      return `<tr>
        <td style="text-align:center;color:#6b7280;font-weight:500;">${idx + 1}</td>
        <td>${e.nombre} ${e.apellido}</td>
        <td>${e.cargo || '—'}</td>
        <td><span class="badge-localidad badge-${(e.localidad || 'MATRIZ').toLowerCase()}">${e.localidad || 'MATRIZ'}</span></td>
        <td>${formatFecha(e.fecha_ingreso)}</td>
        <td style="font-weight:600;color:#1e3a5f;">${formatAntiguedad(d.anios, d.meses, d.dias)}</td>
      </tr>`;
    }).join('');
  }

  // ===============================
  // Editar info empleado
  // ===============================
  window.editarInfoEmpleado = function (id) {
    const emp = empleados.find(e => e.id === id);
    if (!emp) return;

    const fechaNacVal = emp.fecha_nacimiento ? emp.fecha_nacimiento.substring(0, 10) : '';
    const fechaIngVal = emp.fecha_ingreso ? emp.fecha_ingreso.substring(0, 10) : '';

    Swal.fire({
      title: `Editar - ${emp.nombre} ${emp.apellido}`,
      html: `
        <input id="rrhh-cedula" class="swal2-input" value="${emp.cedula || ''}" placeholder="Cedula">
        <label style="display:block;text-align:left;margin:8px 0 4px 18px;font-size:13px;color:#666;">Fecha de nacimiento</label>
        <input id="rrhh-fechanac" type="date" class="swal2-input" value="${fechaNacVal}">
        <label style="display:block;text-align:left;margin:8px 0 4px 18px;font-size:13px;color:#666;">Fecha de ingreso</label>
        <input id="rrhh-fechaing" type="date" class="swal2-input" value="${fechaIngVal}">
        <select id="rrhh-localidad" class="swal2-select" style="margin-top:8px;">
          <option value="MATRIZ" ${emp.localidad === 'MATRIZ' ? 'selected' : ''}>MATRIZ</option>
          <option value="SUCURSAL" ${emp.localidad === 'SUCURSAL' ? 'selected' : ''}>SUCURSAL</option>
        </select>

        <div style="margin-top:14px;border-top:1px solid #e5e7eb;padding-top:10px;">
          <p style="font-size:13px;font-weight:600;text-align:left;margin:0 0 6px 18px;color:#374151;">Tallas de uniforme</p>
          <input id="rrhh-zapatos"  class="swal2-input" placeholder="Zapatos (ej: 42)"  value="${emp.talla_zapatos  || ''}">
          <input id="rrhh-pantalon" class="swal2-input" placeholder="Pantalón (ej: 32)" value="${emp.talla_pantalon || ''}">
          <select id="rrhh-camiseta" class="swal2-select" style="margin-top:6px;">
            <option value="">Camiseta...</option>
            <option value="S"   ${emp.talla_camiseta === 'S'   ? 'selected' : ''}>S</option>
            <option value="M"   ${emp.talla_camiseta === 'M'   ? 'selected' : ''}>M</option>
            <option value="L"   ${emp.talla_camiseta === 'L'   ? 'selected' : ''}>L</option>
            <option value="XL"  ${emp.talla_camiseta === 'XL'  ? 'selected' : ''}>XL</option>
            <option value="XXL" ${emp.talla_camiseta === 'XXL' ? 'selected' : ''}>XXL</option>
          </select>
          <select id="rrhh-chompa" class="swal2-select" style="margin-top:6px;">
            <option value="">Chompa...</option>
            <option value="S"   ${emp.talla_chompa === 'S'   ? 'selected' : ''}>S</option>
            <option value="M"   ${emp.talla_chompa === 'M'   ? 'selected' : ''}>M</option>
            <option value="L"   ${emp.talla_chompa === 'L'   ? 'selected' : ''}>L</option>
            <option value="XL"  ${emp.talla_chompa === 'XL'  ? 'selected' : ''}>XL</option>
            <option value="XXL" ${emp.talla_chompa === 'XXL' ? 'selected' : ''}>XXL</option>
          </select>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      preConfirm: () => {
        return {
          cedula:          document.getElementById('rrhh-cedula').value.trim()   || null,
          fecha_nacimiento:document.getElementById('rrhh-fechanac').value        || null,
          fecha_ingreso:   document.getElementById('rrhh-fechaing').value        || null,
          localidad:       document.getElementById('rrhh-localidad').value,
          talla_zapatos:   document.getElementById('rrhh-zapatos').value.trim()  || null,
          talla_pantalon:  document.getElementById('rrhh-pantalon').value.trim() || null,
          talla_camiseta:  document.getElementById('rrhh-camiseta').value        || null,
          talla_chompa:    document.getElementById('rrhh-chompa').value          || null,
        };
      }
    }).then(r => {
      if (!r.isConfirmed) return;

      apiFetch(`/empleados/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r.value)
      })
        .then(res => {
          if (!res.ok) throw new Error();
          Swal.fire('Actualizado', '', 'success');
          cargarEmpleados();
        })
        .catch(() => Swal.fire('Error', 'No se pudo actualizar', 'error'));
    });
  };

});
