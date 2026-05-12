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
    const cols = rolUsuario === 'admin' ? 8 : 7;
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
        tablaInfo.innerHTML = `<tr><td colspan="${cols}">Error al cargar empleados: ${err.message}</td></tr>`;
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

    const cols = rolUsuario === 'admin' ? 8 : 7;
    if (!lista.length) {
      tablaInfo.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;">No se encontraron empleados</td></tr>`;
      return;
    }

    lista.forEach(e => {
      const tr = document.createElement('tr');
      const fechaNac = formatFecha(e.fecha_nacimiento);
      const fechaIng = formatFecha(e.fecha_ingreso);

      const btnEditar = rolUsuario === 'admin'
        ? `<td class="user-actions"><button class="btn-obs" onclick="editarInfoEmpleado(${e.id})">Editar</button></td>`
        : '';

      tr.innerHTML = `
        <td>${e.nombre} ${e.apellido}</td>
        <td>${e.cedula || '-'}</td>
        <td>${fechaNac}</td>
        <td>${fechaIng}</td>
        <td><span class="badge-localidad badge-${(e.localidad || 'MATRIZ').toLowerCase()}">${e.localidad || 'MATRIZ'}</span></td>
        <td>${e.cargo}</td>
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
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      preConfirm: () => {
        return {
          cedula: document.getElementById('rrhh-cedula').value.trim() || null,
          fecha_nacimiento: document.getElementById('rrhh-fechanac').value || null,
          fecha_ingreso: document.getElementById('rrhh-fechaing').value || null,
          localidad: document.getElementById('rrhh-localidad').value
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
