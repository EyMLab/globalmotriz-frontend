document.addEventListener('DOMContentLoaded', () => {

  const tablaInfo = document.getElementById('tabla-info-empleados');
  const calendar = document.getElementById('cumpleanos-calendar');
  const filtroAnio = document.getElementById('filtro-anio');
  const buscador = document.getElementById('buscar-empleado');

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
      inicializarAnios();
    });

  // ===============================
  // Info Empleados
  // ===============================
  function cargarEmpleados() {
    const cols = rolUsuario === 'admin' ? 9 : 8;
    tablaInfo.innerHTML = `<tr><td colspan="${cols}">Cargando...</td></tr>`;
    apiFetch('/empleados')
      .then(res => {
        if (!res.ok) throw new Error('Status ' + res.status);
        return res.json();
      })
      .then(data => {
        empleados = data;
        renderInfoEmpleados();
      })
      .catch(err => {
        console.error('Error cargando empleados:', err);
        tablaInfo.innerHTML = `<tr><td colspan="${cols}">Error al cargar empleados: ${err.message}</td></tr>`;
      });
  }

  function renderInfoEmpleados(filtro) {
    tablaInfo.innerHTML = '';
    let lista = empleados.filter(e => e.activo);

    if (filtro) {
      const f = filtro.toLowerCase();
      lista = lista.filter(e =>
        `${e.nombre} ${e.apellido}`.toLowerCase().includes(f) ||
        (e.cedula && e.cedula.toLowerCase().includes(f))
      );
    }

    const cols = rolUsuario === 'admin' ? 9 : 8;
    if (!lista.length) {
      tablaInfo.innerHTML = `<tr><td colspan="${cols}">No se encontraron empleados</td></tr>`;
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

  if (buscador) {
    let timer;
    buscador.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => renderInfoEmpleados(buscador.value.trim()), 300);
    });
  }

  // ===============================
  // Calendario Cumpleaños
  // ===============================
  function inicializarAnios() {
    const anioActual = new Date().getFullYear();
    for (let a = anioActual - 1; a <= anioActual + 1; a++) {
      const opt = document.createElement('option');
      opt.value = a;
      opt.textContent = a;
      if (a === anioActual) opt.selected = true;
      filtroAnio.appendChild(opt);
    }
    filtroAnio.addEventListener('change', () => cargarCumpleanos(parseInt(filtroAnio.value)));
    cargarCumpleanos(anioActual);
  }

  function cargarCumpleanos(anio) {
    calendar.innerHTML = '<p style="text-align:center;color:#999;">Cargando calendario...</p>';
    apiFetch(`/rrhh/cumpleanos/${anio}`)
      .then(res => res.json())
      .then(data => renderCalendario(data, anio))
      .catch(() => {
        calendar.innerHTML = '<p style="text-align:center;color:#ef4444;">Error al cargar calendario</p>';
      });
  }

  function renderCalendario(meses, anio) {
    calendar.innerHTML = '';

    meses.forEach(m => {
      const card = document.createElement('div');
      card.className = 'mes-card';

      const hayEmpleados = m.empleados.length > 0;

      let empleadosHtml = '';
      if (hayEmpleados) {
        empleadosHtml = m.empleados.map(e => {
          const badgeClass = e.localidad === 'SUCURSAL' ? 'badge-sucursal' : 'badge-matriz';
          return `<div class="cumple-empleado">
            <span class="cumple-nombre">${e.nombre} ${e.apellido}</span>
            <span class="cumple-dia">${e.dia}/${m.mes}</span>
            <span class="badge-localidad ${badgeClass}">${e.localidad}</span>
          </div>`;
        }).join('');
      } else {
        empleadosHtml = '<p class="sin-cumpleanos">Sin cumpleanos este mes</p>';
      }

      const celFecha = m.celebracion
        ? formatFecha(m.celebracion.fecha_celebracion)
        : 'No definida';
      const celNotas = m.celebracion && m.celebracion.notas ? m.celebracion.notas : '';

      const btnEditar = rolUsuario === 'admin'
        ? `<button class="btn-cel-edit" onclick="editarCelebracion(${m.mes}, ${anio}, ${m.celebracion ? m.celebracion.id : 'null'}, '${m.celebracion ? m.celebracion.fecha_celebracion.substring(0, 10) : ''}', '${celNotas.replace(/'/g, "\\'")}')">
            ${m.celebracion ? 'Editar' : 'Definir'}
          </button>`
        : '';

      let pastelesHtml = '';
      if (hayEmpleados) {
        const pastelesTexto = m.cantidad_pasteles === 1
          ? '1 pastel'
          : `${m.cantidad_pasteles} pasteles`;
        const ubicaciones = m.localidades_con_cumpleanos.join(' + ');
        pastelesHtml = `<div class="pasteles-info">
          <span class="pasteles-count">${pastelesTexto}</span>
          <span class="pasteles-ubicacion">(${ubicaciones})</span>
        </div>`;
      }

      card.innerHTML = `
        <div class="mes-card-header">${m.nombre_mes}</div>
        <div class="mes-card-body">
          ${empleadosHtml}
        </div>
        <div class="mes-card-footer">
          ${pastelesHtml}
          <div class="celebracion-row">
            <span class="celebracion-label">Celebracion:</span>
            <span class="celebracion-fecha">${celFecha}</span>
            ${btnEditar}
          </div>
        </div>
      `;

      calendar.appendChild(card);
    });
  }

  // ===============================
  // Editar info empleado (cédula, fecha nac, localidad)
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
          cargarCumpleanos(parseInt(filtroAnio.value));
        })
        .catch(() => Swal.fire('Error', 'No se pudo actualizar', 'error'));
    });
  };

  // ===============================
  // Editar/Crear celebración
  // ===============================
  window.editarCelebracion = function (mes, anio, idExistente, fechaActual, notasActual) {
    const meses = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    Swal.fire({
      title: `Celebracion - ${meses[mes]} ${anio}`,
      html: `
        <label style="display:block;text-align:left;margin:8px 0 4px 18px;font-size:13px;color:#666;">Fecha de celebracion</label>
        <input id="cel-fecha" type="date" class="swal2-input" value="${fechaActual}">
        <input id="cel-notas" class="swal2-input" placeholder="Notas (opcional)" value="${notasActual}">
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      showDenyButton: idExistente ? true : false,
      denyButtonText: 'Eliminar',
      preConfirm: () => {
        const fecha = document.getElementById('cel-fecha').value;
        if (!fecha) {
          Swal.showValidationMessage('La fecha es obligatoria');
          return false;
        }
        return {
          fecha_celebracion: fecha,
          notas: document.getElementById('cel-notas').value.trim()
        };
      }
    }).then(r => {
      if (r.isDenied && idExistente) {
        apiFetch(`/rrhh/celebraciones/${idExistente}`, { method: 'DELETE' })
          .then(() => {
            Swal.fire('Eliminada', '', 'success');
            cargarCumpleanos(anio);
          })
          .catch(() => Swal.fire('Error', 'No se pudo eliminar', 'error'));
        return;
      }

      if (!r.isConfirmed) return;

      const body = { mes, anio, ...r.value };

      apiFetch('/rrhh/celebraciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
        .then(res => {
          if (!res.ok) throw new Error();
          Swal.fire('Guardado', '', 'success');
          cargarCumpleanos(anio);
        })
        .catch(() => Swal.fire('Error', 'No se pudo guardar', 'error'));
    });
  };

});
