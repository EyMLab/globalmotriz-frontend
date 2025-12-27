document.addEventListener('DOMContentLoaded', () => {

  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';
  const token = localStorage.getItem('token');

  const tablaUsuarios = document.getElementById('tabla-usuarios');
  const btnNuevoUsuario = document.getElementById('btn-nuevo-usuario');

  let usuarios = [];

  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  /* ======================================================
     VERIFICAR SESIÓN (solo admin)
  ====================================================== */
  fetch(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: 'Bearer ' + token }
  })
    .then(async res => {
      if (!res.ok) {
        localStorage.clear();
        window.location.href = 'index.html';
        return;
      }

      const data = await res.json();

      if (data.rol !== 'admin') {
        Swal.fire('Acceso denegado', 'Solo admin puede acceder a Usuarios', 'error');
        window.location.href = 'dashboard.html';
        return;
      }

      cargarUsuarios();
    })
    .catch(() => {
      Swal.fire('Error', 'No se pudo verificar sesión', 'error');
    });

  /* ======================================================
     CARGAR USUARIOS
  ====================================================== */
  function cargarUsuarios() {
    tablaUsuarios.innerHTML = `<tr><td colspan="5">Cargando...</td></tr>`;

    fetch(`${API_BASE_URL}/usuarios`, {
      headers: { Authorization: 'Bearer ' + token }
    })
      .then(res => res.json())
      .then(data => {
        usuarios = data;
        renderUsuarios();
      })
      .catch(() => {
        tablaUsuarios.innerHTML = `<tr><td colspan="5">Error cargando usuarios</td></tr>`;
      });
  }

  /* ======================================================
     RENDER TABLA
  ====================================================== */
  function renderUsuarios() {
    tablaUsuarios.innerHTML = '';

    if (!usuarios.length) {
      tablaUsuarios.innerHTML = `<tr><td colspan="5">No hay usuarios</td></tr>`;
      return;
    }

    usuarios.forEach(u => {

      const badgeRol =
        u.rol === 'admin'
          ? 'badge badge-admin'
          : u.rol === 'bodega'
            ? 'badge badge-bodega'
            : 'badge badge-asesor';

      const badgeLocalidad =
        u.localidad === 'MATRIZ'
          ? 'badge badge-matriz'
          : 'badge badge-sucursal';

      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td>${u.id}</td>
        <td>${u.usuario}</td>
        <td><span class="${badgeRol}">${u.rol}</span></td>
        <td><span class="${badgeLocalidad}">${u.localidad}</span></td>
        <td class="user-actions">
          <button class="btn-obs" onclick="editarUsuario(${u.id}, '${u.usuario}', '${u.rol}', '${u.localidad}')">Editar</button>
          <button class="btn-obs" onclick="cambiarClaveUsuario(${u.id}, '${u.usuario}')">Clave</button>
          <button class="btn-eliminar" onclick="eliminarUsuario(${u.id})">Eliminar</button>
        </td>
      `;

      tablaUsuarios.appendChild(tr);
    });
  }

  /* ======================================================
     NUEVO USUARIO
  ====================================================== */
  btnNuevoUsuario.addEventListener('click', () => {
    Swal.fire({
      title: 'Nuevo usuario',
      html: `
        <input id="nuevo-usuario" class="swal2-input" placeholder="Usuario">
        <input id="nueva-clave" type="password" class="swal2-input" placeholder="Contraseña">

        <label>Rol:</label>
        <select id="nuevo-rol" class="swal2-input">
          <option value="admin">Admin</option>
          <option value="bodega">Bodega</option>
          <option value="asesor">Asesor</option>
        </select>

        <label>Localidad:</label>
        <select id="nueva-localidad" class="swal2-input">
          <option value="MATRIZ">MATRIZ</option>
          <option value="SUCURSAL">SUCURSAL</option>
        </select>
      `,
      showCancelButton: true,
      confirmButtonText: 'Crear',
      preConfirm: () => {
        const usuario = document.getElementById('nuevo-usuario').value.trim();
        const clave = document.getElementById('nueva-clave').value.trim();
        const rol = document.getElementById('nuevo-rol').value;
        const localidad = document.getElementById('nueva-localidad').value;

        if (!usuario || !clave) {
          Swal.showValidationMessage('Todos los campos son obligatorios');
          return false;
        }

        return { usuario, clave, rol, localidad };
      }
    }).then(result => {
      if (result.isConfirmed) {
        fetch(`${API_BASE_URL}/usuarios`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(result.value)
        })
          .then(() => {
            Swal.fire('✅ Usuario creado', '', 'success');
            cargarUsuarios();
          });
      }
    });
  });

  /* ======================================================
     EDITAR USUARIO
  ====================================================== */
  window.editarUsuario = (id, usuario, rolActual, localidadActual) => {
    Swal.fire({
      title: 'Editar usuario',
      html: `
        <input id="usuario-edit" class="swal2-input" value="${usuario}">

        <label>Rol:</label>
        <select id="rol-edit" class="swal2-input">
          <option value="admin" ${rolActual === 'admin' ? 'selected' : ''}>Admin</option>
          <option value="bodega" ${rolActual === 'bodega' ? 'selected' : ''}>Bodega</option>
          <option value="asesor" ${rolActual === 'asesor' ? 'selected' : ''}>Asesor</option>
        </select>

        <label>Localidad:</label>
        <select id="localidad-edit" class="swal2-input">
          <option value="MATRIZ" ${localidadActual === 'MATRIZ' ? 'selected' : ''}>MATRIZ</option>
          <option value="SUCURSAL" ${localidadActual === 'SUCURSAL' ? 'selected' : ''}>SUCURSAL</option>
        </select>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      preConfirm: () => {
        const nuevoUsuario = document.getElementById('usuario-edit').value.trim();
        const rol = document.getElementById('rol-edit').value;
        const localidad = document.getElementById('localidad-edit').value;

        if (!nuevoUsuario) {
          Swal.showValidationMessage('Usuario inválido');
          return false;
        }

        return { usuario: nuevoUsuario, rol, localidad };
      }
    }).then(result => {
      if (result.isConfirmed) {
        fetch(`${API_BASE_URL}/usuarios/${id}`, {
          method: 'PATCH',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(result.value)
        })
          .then(() => {
            Swal.fire('✅ Usuario actualizado', '', 'success');
            cargarUsuarios();
          });
      }
    });
  };

  /* ======================================================
     CAMBIAR CLAVE
  ====================================================== */
  window.cambiarClaveUsuario = (id, usuario) => {
    Swal.fire({
      title: `Cambiar clave de ${usuario}`,
      input: 'password',
      inputPlaceholder: 'Nueva contraseña',
      showCancelButton: true
    }).then(result => {
      if (result.isConfirmed && result.value.trim()) {
        fetch(`${API_BASE_URL}/usuarios/${id}/password`, {
          method: 'PATCH',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ nueva: result.value.trim() })
        })
          .then(() => Swal.fire('✅ Contraseña actualizada', '', 'success'));
      }
    });
  };

  /* ======================================================
     ELIMINAR USUARIO
  ====================================================== */
  window.eliminarUsuario = id => {
    Swal.fire({
      title: '¿Eliminar usuario?',
      text: 'Esta acción no se puede deshacer',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Eliminar'
    }).then(result => {
      if (result.isConfirmed) {
        fetch(`${API_BASE_URL}/usuarios/${id}`, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + token }
        })
          .then(() => {
            Swal.fire('✅ Usuario eliminado', '', 'success');
            cargarUsuarios();
          });
      }
    });
  };

});
