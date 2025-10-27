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

  // === Verificar rol ===
  fetch(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: 'Bearer ' + token }
  })
    .then(async res => {
      if (res.status === 401) {
        localStorage.clear();
        window.location.href = 'index.html';
        return;
      }
      if (res.status === 403) {
        Swal.fire('Acceso denegado', 'Tu rol no tiene permiso para acceder.', 'error');
        window.location.href = 'dashboard.html';
        return;
      }
      const data = await res.json();
      if (data.rol !== 'admin') {
        Swal.fire('Acceso denegado', 'Solo los administradores pueden acceder.', 'error');
        window.location.href = 'dashboard.html';
      } else {
        cargarUsuarios();
      }
    })
    .catch(err => {
      console.error('❌ Error al verificar usuario:', err);
      Swal.fire('Error', 'No se pudo conectar con el servidor.', 'error');
    });

  // === Cargar usuarios ===
  function cargarUsuarios() {
    if (tablaUsuarios) tablaUsuarios.innerHTML = `<tr><td colspan="4">Cargando...</td></tr>`;

    fetch(`${API_BASE_URL}/usuarios`, {
      headers: { Authorization: 'Bearer ' + token }
    })
      .then(res => res.json())
      .then(data => {
        usuarios = data;
        renderUsuarios();
      })
      .catch(err => {
        console.error('❌ Error al cargar usuarios:', err);
        if (tablaUsuarios)
          tablaUsuarios.innerHTML = `<tr><td colspan="4">Error al cargar usuarios</td></tr>`;
      });
  }

  // === Mostrar tabla ===
  function renderUsuarios() {
    if (!tablaUsuarios) return;
    tablaUsuarios.innerHTML = '';

    if (usuarios.length === 0) {
      tablaUsuarios.innerHTML = `<tr><td colspan="4">No hay usuarios registrados</td></tr>`;
      return;
    }

    usuarios.forEach(u => {
      const fila = document.createElement('tr');
      fila.innerHTML = `
        <td>${u.id}</td>
        <td>${u.usuario}</td>
        <td>${u.rol}</td>
        <td>
          <button class="btn-accion" onclick="editarUsuario(${u.id}, '${u.usuario}', '${u.rol}')">✏️ Editar</button>
          <button class="btn-accion" onclick="cambiarClaveUsuario(${u.id}, '${u.usuario}')">🔑 Clave</button>
          <button class="btn-eliminar" onclick="eliminarUsuario(${u.id})">🗑 Eliminar</button>
        </td>
      `;
      tablaUsuarios.appendChild(fila);
    });
  }

  // === Crear nuevo usuario ===
  if (btnNuevoUsuario) {
    btnNuevoUsuario.addEventListener('click', () => {
      Swal.fire({
        title: 'Nuevo Usuario',
        html: `
          <input type="text" id="nuevo-usuario" class="swal2-input" placeholder="Usuario">
          <input type="password" id="nueva-clave" class="swal2-input" placeholder="Contraseña">
          <select id="nuevo-rol" class="swal2-input">
            <option value="admin">Admin</option>
            <option value="bodega">Bodega</option>
            <option value="asesor">Asesor</option>
          </select>
        `,
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
          const usuario = document.getElementById('nuevo-usuario').value.trim();
          const clave = document.getElementById('nueva-clave').value.trim();
          const rol = document.getElementById('nuevo-rol').value;
          if (!usuario || !clave) {
            Swal.showValidationMessage('Todos los campos son obligatorios');
            return false;
          }
          return { usuario, clave, rol };
        }
      }).then(result => {
        if (result.isConfirmed) crearUsuario(result.value.usuario, result.value.clave, result.value.rol);
      });
    });
  }

  function crearUsuario(usuario, clave, rol) {
    fetch(`${API_BASE_URL}/usuarios`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ usuario, clave, rol })
    })
      .then(res => res.json())
      .then(() => {
        Swal.fire('✅ Usuario creado', '', 'success');
        cargarUsuarios();
      })
      .catch(err => {
        console.error('❌ Error al crear usuario:', err);
        Swal.fire('❌ Error', 'No se pudo crear el usuario.', 'error');
      });
  }

  // === Editar usuario ===
  window.editarUsuario = function (id, usuario, rolActual) {
    Swal.fire({
      title: `Editar ${usuario}`,
      html: `
        <input type="text" id="usuario-edit" class="swal2-input" value="${usuario}">
        <select id="rol-edit" class="swal2-input">
          <option value="admin" ${rolActual === 'admin' ? 'selected' : ''}>Admin</option>
          <option value="bodega" ${rolActual === 'bodega' ? 'selected' : ''}>Bodega</option>
          <option value="asesor" ${rolActual === 'asesor' ? 'selected' : ''}>Asesor</option>
        </select>
      `,
      showCancelButton: true,
      confirmButtonText: 'Actualizar',
      preConfirm: () => {
        const nuevoUsuario = document.getElementById('usuario-edit').value.trim();
        const nuevoRol = document.getElementById('rol-edit').value;
        if (!nuevoUsuario) {
          Swal.showValidationMessage('El nombre de usuario no puede estar vacío');
          return false;
        }
        return { usuario: nuevoUsuario, rol: nuevoRol };
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
          .then(res => res.json())
          .then(() => {
            Swal.fire('✅ Usuario actualizado', '', 'success');
            cargarUsuarios();
          })
          .catch(err => {
            console.error('❌ Error al actualizar usuario:', err);
            Swal.fire('❌ Error', 'No se pudo actualizar el usuario.', 'error');
          });
      }
    });
  };

  // === Cambiar clave de usuario ===
  window.cambiarClaveUsuario = function (id, usuario) {
    Swal.fire({
      title: `Cambiar clave de ${usuario}`,
      input: 'password',
      inputPlaceholder: 'Nueva contraseña',
      showCancelButton: true,
      confirmButtonText: 'Actualizar'
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
          .then(res => res.json())
          .then(() => Swal.fire('✅ Contraseña actualizada', '', 'success'))
          .catch(err => {
            console.error('❌ Error al cambiar contraseña:', err);
            Swal.fire('❌ Error', 'No se pudo cambiar la contraseña.', 'error');
          });
      }
    });
  };

  // === Eliminar usuario ===
  window.eliminarUsuario = function (id) {
    Swal.fire({
      title: '¿Eliminar usuario?',
      text: 'Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      confirmButtonColor: '#d33'
    }).then(result => {
      if (result.isConfirmed) {
        fetch(`${API_BASE_URL}/usuarios/${id}`, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + token }
        })
          .then(res => res.json())
          .then(() => {
            Swal.fire('✅ Usuario eliminado', '', 'success');
            cargarUsuarios();
          })
          .catch(err => {
            console.error('❌ Error al eliminar usuario:', err);
            Swal.fire('❌ Error', 'No se pudo eliminar', 'error');
          });
      }
    });
  };
});
