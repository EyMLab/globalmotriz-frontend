document.addEventListener('DOMContentLoaded', async () => {
  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';
  const token = localStorage.getItem('token');

  if (!token) {
    window.location.href = "index.html";
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: 'Bearer ' + token }
    });

    const data = await res.json();
    const rol = data.rol;

    // Si no es admin ni bodega → redirigir
    if (!['admin', 'bodega'].includes(rol)) {
      Swal.fire("Acceso denegado", "No tienes permiso para Inventario", "error");
      window.location.href = "dashboard.html";
      return;
    }

    // ✅ CARGAR INVENTARIO
    cargarInventario();

  } catch (error) {
    console.error("Error:", error);
    Swal.fire("Error", "No se pudo verificar el usuario", "error");
  }
});

async function cargarInventario() {
  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';
  const token = localStorage.getItem('token');

  try {
    const res = await fetch(`${API_BASE_URL}/inventario/list`, {
      headers: { Authorization: 'Bearer ' + token }
    });

    const list = await res.json();

    const tableBody = document.querySelector("#tablaInventario tbody");
    tableBody.innerHTML = "";

    list.forEach(item => {
      const estadoColor =
        item.estado === "green" ? "green" :
        item.estado === "yellow" ? "orange" : "red";

      tableBody.innerHTML += `
        <tr>
          <td>${item.codigo}</td>
          <td>${item.nombre}</td>
          <td>${item.tipo}</td>
          <td>${item.unidad ?? '-'}</td>
          <td>${item.stock ?? 0}</td>
          <td>${item.min_stock ?? 0}</td>
          <td style="color:${estadoColor}; font-weight:bold">${item.estado}</td>
          <td>
            <button class="btn btn-sm btn-primary">Editar</button>
            <button class="btn btn-sm btn-warning">Stock +</button>
          </td>
        </tr>
      `;
    });

  } catch (err) {
    console.error("Error cargando inventario:", err);
    Swal.fire("Error", "No se pudo obtener inventario", "error");
  }
}
