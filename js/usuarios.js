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

  // ===============================
  // Verificar admin
  // ===============================
  fetch(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: 'Bearer ' + token }
  })
    .then(async res => {
      if (res.status === 401) {
        localStorage.clear();
        return window.location.href = 'index.html';
      }

      const data = await res.json();
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

    fetch(`${API_BASE_URL}/usuarios`, {
      headers: { Authorization: 'Bearer ' + token }
    })
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
        <td>${u.rol}</td>
        <td>${u.localidad}</td>
        <td>
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
        <input id="nuevo-usuario" class="swal2-input" placeholder="Usuario">
        <input id="nueva-clave" type="password" class="swal2-input" placeholder="Contraseña">

        <label>Rol</label>
        <select id="nuevo-rol" class="swal2-input">
          <option value="admin">Admin</option>
          <option value="bodega">Bodega</option>
          <option value="asesor">Asesor</option>
        </select>

        <label>Localidad</label>
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
    }).then(r => {
      if (!r.isConfirmed) return;

      fetch(`${API_BASE_URL}/usuarios`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(r.value)
      })
        .then(() => {
          Swal.fire('✅ Usuario creado', '', 'success');
          cargarUsuarios();
        });
    });
  };

  // ===============================
  // Acciones
  // ===============================
  window.editarUsuario = function (id, usuario, rol, localidad) {
    Swal.fire({
      title: 'Editar usuario',
      html: `
        <input id="usuario-edit" class="swal2-input" value="${usuario}">
        <select id="rol-edit" class="swal2-input">
          <option value="admin" ${rol === 'admin' ? 'selected' : ''}>Admin</option>
          <option value="bodega" ${rol === 'bodega' ? 'selected' : ''}>Bodega</option>
          <option value="asesor" ${rol === 'asesor' ? 'selected' : ''}>Asesor</option>
        </select>
        <select id="localidad-edit" class="swal2-input">
          <option value="MATRIZ" ${localidad === 'MATRIZ' ? 'selected' : ''}>MATRIZ</option>
          <option value="SUCURSAL" ${localidad === 'SUCURSAL' ? 'selected' : ''}>SUCURSAL</option>
        </select>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      preConfirm: () => ({
        usuario: document.getElementById('usuario-edit').value.trim(),
        rol: document.getElementById('rol-edit').value,
        localidad: document.getElementById('localidad-edit').value
      })
    }).then(r => {
      if (!r.isConfirmed) return;

      fetch(`${API_BASE_URL}/usuarios/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(r.value)
      }).then(() => {
        Swal.fire('✅ Usuario actualizado', '', 'success');
        cargarUsuarios();
      });
    });
  };

  window.cambiarClaveUsuario = function (id, usuario) {
    Swal.fire({
      title: `Cambiar clave de ${usuario}`,
      input: 'password',
      showCancelButton: true
    }).then(r => {
      if (!r.isConfirmed || !r.value.trim()) return;

      fetch(`${API_BASE_URL}/usuarios/${id}/password`, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ nueva: r.value.trim() })
      }).then(() =>
        Swal.fire('✅ Contraseña actualizada', '', 'success')
      );
    });
  };

  window.eliminarUsuario = function (id) {
    Swal.fire({
      title: '¿Eliminar usuario?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33'
    }).then(r => {
      if (!r.isConfirmed) return;

      fetch(`${API_BASE_URL}/usuarios/${id}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token }
      }).then(() => {
        Swal.fire('✅ Usuario eliminado', '', 'success');
        cargarUsuarios();
      });
    });
  };

});
