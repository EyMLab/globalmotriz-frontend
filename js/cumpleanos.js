document.addEventListener('DOMContentLoaded', () => {

  const calendar = document.getElementById('cumpleanos-calendar');
  const filtroAnio = document.getElementById('filtro-anio');

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
      inicializarAnios();
    });

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
