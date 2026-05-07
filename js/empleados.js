document.addEventListener('DOMContentLoaded', () => {

  const tablaEmpleados = document.getElementById('tabla-empleados');
  const btnNuevoEmpleado = document.getElementById('btn-nuevo-empleado');

  let empleados = [];

  if (!getToken()) {
    redirectLogin();
    return;
  }

  // ===============================
  // Verificar que sea admin
  // ===============================
  apiFetch('/auth/me')
    .then(async res => {
      if (!res || !res.ok) {
        redirectLogin();
        return;
      }

      const data = await safeJson(res);
      if (data.rol !== 'admin' && data.rol !== 'control') {
        Swal.fire('Acceso denegado', 'Solo admin puede gestionar empleados', 'error');
        return window.location.href = 'dashboard.html';
      }
      window._rolEmpleados = data.rol;
      if (data.rol === 'control') {
        if (btnNuevoEmpleado) btnNuevoEmpleado.style.display = 'none';
        document.querySelectorAll('th').forEach(th => {
          if (th.textContent.trim() === 'Acciones') th.style.display = 'none';
        });
      }

      cargarEmpleados();
    });

  // ===============================
  // Cargar empleados
  // ===============================
  function cargarEmpleados() {
    tablaEmpleados.innerHTML = `<tr><td colspan="8">Cargando...</td></tr>`;

    apiFetch('/empleados')
      .then(res => res.json())
      .then(data => {
        empleados = data;
        renderEmpleados();
      })
      .catch(() => {
        tablaEmpleados.innerHTML = `<tr><td colspan="8">Error al cargar empleados</td></tr>`;
      });
  }

  // ===============================
  // Render tabla
  // ===============================
  function renderEmpleados() {
    tablaEmpleados.innerHTML = '';

    if (!empleados.length) {
      tablaEmpleados.innerHTML = `<tr><td colspan="8">No hay empleados</td></tr>`;
      return;
    }

    const esCtrl = window._rolEmpleados === 'control';
    empleados.forEach(e => {
      const tr = document.createElement('tr');

      const acciones = esCtrl ? '' : `
          <button class="btn-obs" onclick="editarEmpleado(${e.id})">Editar</button>
          <button class="btn-obs" onclick="toggleEmpleado(${e.id}, ${e.activo})">
            ${e.activo ? 'Desactivar' : 'Activar'}
          </button>
          <button class="btn-eliminar" onclick="eliminarEmpleado(${e.id})">Eliminar</button>`;

      const fechaNac = e.fecha_nacimiento
        ? new Date(e.fecha_nacimiento).toLocaleDateString('es-EC')
        : '-';

      tr.innerHTML = `
        <td>${e.id}</td>
        <td>${e.nombre} ${e.apellido}</td>
        <td>${e.cedula || '-'}</td>
        <td>${e.cargo}</td>
        <td>${e.localidad || 'MATRIZ'}</td>
        <td>${e.tag_uid}</td>
        <td>
          <span class="badge ${e.activo ? 'badge-ok' : 'badge-off'}">
            ${e.activo ? 'Activo' : 'Inactivo'}
          </span>
        </td>
        ${esCtrl ? '' : `<td class="user-actions">${acciones}</td>`}
      `;

      tablaEmpleados.appendChild(tr);
    });
  }

  // ===============================
  // Nuevo empleado
  // ===============================
  btnNuevoEmpleado.onclick = () => {
    Swal.fire({
      title: 'Nuevo empleado',
      html: `
        <input id="emp-nombre" class="swal2-input" placeholder="Nombre">
        <input id="emp-apellido" class="swal2-input" placeholder="Apellido">
        <input id="emp-cedula" class="swal2-input" placeholder="Cédula (opcional)">
        <input id="emp-cargo" class="swal2-input" placeholder="Cargo">
        <input id="emp-tag" class="swal2-input" placeholder="UID del TAG">
        <label style="display:block;text-align:left;margin:8px 0 4px 18px;font-size:13px;color:#666;">Fecha de nacimiento</label>
        <input id="emp-fechanac" type="date" class="swal2-input">
        <select id="emp-localidad" class="swal2-select" style="margin-top:8px;">
          <option value="MATRIZ">MATRIZ</option>
          <option value="SUCURSAL">SUCURSAL</option>
        </select>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      preConfirm: () => {
        const nombre = document.getElementById('emp-nombre').value.trim();
        const apellido = document.getElementById('emp-apellido').value.trim();
        const cargo = document.getElementById('emp-cargo').value.trim();
        const tag_uid = document.getElementById('emp-tag').value.trim();
        const cedula = document.getElementById('emp-cedula').value.trim();
        const fecha_nacimiento = document.getElementById('emp-fechanac').value;
        const localidad = document.getElementById('emp-localidad').value;

        if (!nombre || !apellido || !cargo || !tag_uid) {
          Swal.showValidationMessage('Nombre, apellido, cargo y TAG son obligatorios');
          return false;
        }

        return { nombre, apellido, cargo, tag_uid, cedula: cedula || null, fecha_nacimiento: fecha_nacimiento || null, localidad };
      }
    }).then(r => {
      if (!r.isConfirmed) return;

      apiFetch('/empleados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r.value)
      })
        .then(res => {
          if (!res.ok) throw new Error();
          Swal.fire('✅ Empleado creado', '', 'success');
          cargarEmpleados();
        })
        .catch(() => {
          Swal.fire('Error', 'No se pudo crear el empleado', 'error');
        });
    });
  };

  // ===============================
  // Editar empleado
  // ===============================
  window.editarEmpleado = function (id) {
    const emp = empleados.find(e => e.id === id);
    if (!emp) return;

    const fechaNacVal = emp.fecha_nacimiento ? emp.fecha_nacimiento.substring(0, 10) : '';
    Swal.fire({
      title: 'Editar empleado',
      html: `
        <input id="emp-nombre" class="swal2-input" value="${emp.nombre}">
        <input id="emp-apellido" class="swal2-input" value="${emp.apellido}">
        <input id="emp-cedula" class="swal2-input" value="${emp.cedula || ''}" placeholder="Cédula (opcional)">
        <input id="emp-cargo" class="swal2-input" value="${emp.cargo}">
        <input id="emp-tag" class="swal2-input" value="${emp.tag_uid}">
        <label style="display:block;text-align:left;margin:8px 0 4px 18px;font-size:13px;color:#666;">Fecha de nacimiento</label>
        <input id="emp-fechanac" type="date" class="swal2-input" value="${fechaNacVal}">
        <select id="emp-localidad" class="swal2-select" style="margin-top:8px;">
          <option value="MATRIZ" ${emp.localidad === 'MATRIZ' ? 'selected' : ''}>MATRIZ</option>
          <option value="SUCURSAL" ${emp.localidad === 'SUCURSAL' ? 'selected' : ''}>SUCURSAL</option>
        </select>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      preConfirm: () => {
        return {
          nombre: document.getElementById('emp-nombre').value.trim(),
          apellido: document.getElementById('emp-apellido').value.trim(),
          cedula: document.getElementById('emp-cedula').value.trim() || null,
          cargo: document.getElementById('emp-cargo').value.trim(),
          tag_uid: document.getElementById('emp-tag').value.trim(),
          fecha_nacimiento: document.getElementById('emp-fechanac').value || null,
          localidad: document.getElementById('emp-localidad').value
        };
      }
    }).then(r => {
      if (!r.isConfirmed) return;

      apiFetch(`/empleados/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r.value)
      })
        .then(() => {
          Swal.fire('✅ Empleado actualizado', '', 'success');
          cargarEmpleados();
        })
        .catch(() => {
          Swal.fire('Error', 'No se pudo actualizar', 'error');
        });
    });
  };

  // ===============================
  // Activar / Desactivar
  // ===============================
  window.toggleEmpleado = function (id, activo) {
    apiFetch(`/empleados/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !activo })
    })
      .then(() => cargarEmpleados())
      .catch(() => {
        Swal.fire('Error', 'No se pudo cambiar estado', 'error');
      });
  };

  // ===============================
  // Eliminar
  // ===============================
  window.eliminarEmpleado = function (id) {
    Swal.fire({
      title: '¿Eliminar empleado?',
      text: 'Esta acción no se puede deshacer',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33'
    }).then(r => {
      if (!r.isConfirmed) return;

      apiFetch(`/empleados/${id}`, {
        method: 'DELETE'
      })
        .then(() => {
          Swal.fire('✅ Empleado eliminado', '', 'success');
          cargarEmpleados();
        })
        .catch(() => {
          Swal.fire('Error', 'No se pudo eliminar', 'error');
        });
    });
  };

});
