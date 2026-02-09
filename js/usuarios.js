document.addEventListener('DOMContentLoaded', () => {

  const tablaUsuarios = document.getElementById('tabla-usuarios');
  const btnNuevoUsuario = document.getElementById('btn-nuevo-usuario');

  let usuarios = [];

  if (!getToken()) {
    redirectLogin();
    return;
  }

  // ===============================
  // Verificar admin
  // ===============================
  apiFetch('/auth/me')
    .then(async res => {
      if (!res || !res.ok) {
        redirectLogin();
        return;
      }

      const data = await safeJson(res);
      if (data.rol !== 'admin') {
        Swal.fire('Acceso denegado', 'Solo admin puede acceder a Usuarios', 'error');
        return window.location.href = 'dashboard.html';
      }

      cargarUsuarios();
    });

  // ===============================
  // Cargar usuarios
  // ===============================
  function cargarUsuarios() {
    tablaUsuarios.innerHTML = `<tr><td colspan="4">Cargando...</td></tr>`;

    apiFetch('/usuarios')
      .then(res => res.json())
      .then(data => {
        usuarios = data;
        renderUsuarios();
      })
      .catch(() => {
        tablaUsuarios.innerHTML = `<tr><td colspan="4">Error al cargar usuarios</td></tr>`;
      });
  }

  // ===============================
  // Render tabla
  // ===============================
  function renderUsuarios() {
    tablaUsuarios.innerHTML = "";

    if (!usuarios.length) {
      tablaUsuarios.innerHTML = `<tr><td colspan="4">No hay usuarios</td></tr>`;
      return;
    }

    usuarios.forEach(u => {
      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td>${u.usuario}</td>
        <td>${u.rol.toUpperCase()}</td>
        <td>${u.localidad}</td>
        <td class="user-actions">
          <button class="btn-obs" onclick="editarUsuario(${u.id}, '${u.usuario}', '${u.rol}', '${u.localidad}')">Editar</button>
          <button class="btn-obs" onclick="cambiarClaveUsuario(${u.id}, '${u.usuario}')">Clave</button>
          <button class="btn-eliminar" onclick="eliminarUsuario(${u.id})">Eliminar</button>
        </td>
      `;

      tablaUsuarios.appendChild(tr);
    });
  }

  // ===============================
  // Nuevo usuario
  // ===============================
  btnNuevoUsuario.onclick = () => {
    Swal.fire({
      title: 'Nuevo usuario',
      html: `
        <div class="form-group">
          <label>Nombre de usuario</label>
          <input id="nuevo-usuario" class="swal2-input" placeholder="Ej: jperez">
        </div>
        
        <div class="form-group">
          <label>Contraseña</label>
          <input id="nueva-clave" type="password" class="swal2-input" placeholder="Ingresa la contraseña">
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Rol</label>
            <select id="nuevo-rol" class="swal2-select">
              <option value="admin">Admin</option>
              <option value="bodega">Bodega</option>
              <option value="asesor">Asesor</option>
            </select>
          </div>

          <div class="form-group">
            <label>Localidad</label>
            <select id="nueva-localidad" class="swal2-select">
              <option value="MATRIZ">MATRIZ</option>
              <option value="SUCURSAL">SUCURSAL</option>
            </select>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Crear',
      cancelButtonText: 'Cancelar',
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
    }).then(r => {
      if (!r.isConfirmed) return;

      apiFetch('/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r.value)
      })
        .then(() => {
          Swal.fire('✅ Usuario creado', '', 'success');
          cargarUsuarios();
        })
        .catch(() => {
          Swal.fire('Error', 'No se pudo crear el usuario', 'error');
        });
    });
  };

  // ===============================
  // Editar usuario
  // ===============================
  window.editarUsuario = function (id, usuario, rol, localidad) {
    Swal.fire({
      title: 'Editar usuario',
      html: `
        <div class="form-group">
          <label>Nombre de usuario</label>
          <input id="usuario-edit" class="swal2-input" value="${usuario}" placeholder="Nombre de usuario">
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label>Rol</label>
            <select id="rol-edit" class="swal2-select">
              <option value="admin" ${rol === 'admin' ? 'selected' : ''}>Admin</option>
              <option value="bodega" ${rol === 'bodega' ? 'selected' : ''}>Bodega</option>
              <option value="asesor" ${rol === 'asesor' ? 'selected' : ''}>Asesor</option>
            </select>
          </div>

          <div class="form-group">
            <label>Localidad</label>
            <select id="localidad-edit" class="swal2-select">
              <option value="MATRIZ" ${localidad === 'MATRIZ' ? 'selected' : ''}>MATRIZ</option>
              <option value="SUCURSAL" ${localidad === 'SUCURSAL' ? 'selected' : ''}>SUCURSAL</option>
            </select>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const usuarioEdit = document.getElementById('usuario-edit').value.trim();
        
        if (!usuarioEdit) {
          Swal.showValidationMessage('El nombre de usuario es obligatorio');
          return false;
        }

        return {
          usuario: usuarioEdit,
          rol: document.getElementById('rol-edit').value,
          localidad: document.getElementById('localidad-edit').value
        };
      }
    }).then(r => {
      if (!r.isConfirmed) return;

      apiFetch(`/usuarios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r.value)
      })
        .then(() => {
          Swal.fire('✅ Usuario actualizado', '', 'success');
          cargarUsuarios();
        })
        .catch(() => {
          Swal.fire('Error', 'No se pudo actualizar el usuario', 'error');
        });
    });
  };

  // ===============================
  // Cambiar clave
  // ===============================
  window.cambiarClaveUsuario = function (id, usuario) {
    Swal.fire({
      title: `Cambiar clave de ${usuario}`,
      html: `
        <div class="form-group">
          <label>Nueva contraseña</label>
          <input id="nueva-password" type="password" class="swal2-input" placeholder="Ingresa la nueva contraseña">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Cambiar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const password = document.getElementById('nueva-password').value.trim();
        
        if (!password) {
          Swal.showValidationMessage('La contraseña es obligatoria');
          return false;
        }

        return password;
      }
    }).then(r => {
      if (!r.isConfirmed) return;

      apiFetch(`/usuarios/${id}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nueva: r.value })
      })
        .then(() => {
          Swal.fire('✅ Contraseña actualizada', '', 'success');
        })
        .catch(() => {
          Swal.fire('Error', 'No se pudo actualizar la contraseña', 'error');
        });
    });
  };

  // ===============================
  // Eliminar usuario
  // ===============================
  window.eliminarUsuario = function (id) {
    Swal.fire({
      title: '¿Eliminar usuario?',
      text: 'Esta acción no se puede deshacer',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then(r => {
      if (!r.isConfirmed) return;

      apiFetch(`/usuarios/${id}`, {
        method: 'DELETE'
      })
        .then(() => {
          Swal.fire('✅ Usuario eliminado', '', 'success');
          cargarUsuarios();
        })
        .catch(() => {
          Swal.fire('Error', 'No se pudo eliminar el usuario', 'error');
        });
    });
  };

});