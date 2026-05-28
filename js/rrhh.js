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
