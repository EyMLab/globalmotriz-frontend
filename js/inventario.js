document.addEventListener('DOMContentLoaded', async () => {
  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';
  const token = localStorage.getItem('token');

  if (!token) return window.location.href = "index.html";

  // Verificar rol
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const data = await res.json();
  const rol = data.rol;

  if (!['admin', 'bodega'].includes(rol)) {
    Swal.fire("Acceso denegado", "No tienes permiso para Inventario", "error");
    return window.location.href = "dashboard.html";
  }

  // Botones
  document.getElementById("btnNuevo").addEventListener("click", modalNuevoInsumo);
  document.getElementById("btnImportar").addEventListener("click", modalImportarExcel);
  document.getElementById("btnPlantilla").addEventListener("click", descargarPlantilla);

  cargarInventario();
});

async function cargarInventario() {
  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';
  const token = localStorage.getItem('token');

  const res = await fetch(`${API_BASE_URL}/inventario/list`, {
    headers: { Authorization: 'Bearer ' + token }
  });
  
  const list = await res.json();
  const tableBody = document.querySelector("#tablaInventario");
  tableBody.innerHTML = "";

  list.forEach(item => {
    const color =
      item.estado === "green" ? "green" :
      item.estado === "yellow" ? "orange" : "red";

    const row = `
      <tr>
        <td>${item.codigo}</td>
        <td>${item.nombre}</td>
        <td>${item.tipo}</td>
        <td>${item.unidad ?? "-"}</td>
        <td>${item.stock ?? 0}</td>
        <td>${item.min_stock ?? 0}</td>
        <td style="font-weight:bold;color:${color}">${item.estado.toUpperCase()}</td>
        <td>
          <button class="btn-obs" onclick="modalEditar('${item.codigo}')">✏️ Editar</button>
          <button class="btn-obs" onclick="modalStock('${item.codigo}')">➕ Stock</button>
        </td>
      </tr>
    `;
    tableBody.innerHTML += row;
  });
}

/* ✅ Nuevo insumo */
async function modalNuevoInsumo() {
  const { value: form } = await Swal.fire({
    title: "Nuevo Insumo",
    html: `
      <input id="codigo" class="swal2-input" placeholder="Código">
      <input id="nombre" class="swal2-input" placeholder="Nombre">
      <select id="tipo" class="swal2-input">
        <option value="STOCK">STOCK</option>
        <option value="DIRECTO">DIRECTO</option>
      </select>
      <input id="unidad" class="swal2-input" placeholder="Unidad (ej: Unidad, ML, LT)">
      <input id="stock" type="number" class="swal2-input" placeholder="Stock inicial">
      <input id="min_stock" type="number" class="swal2-input" placeholder="Stock mínimo">
    `,
    showCancelButton: true,
    confirmButtonText: "Guardar",
    preConfirm: () => ({
      codigo: codigo.value,
      nombre: nombre.value,
      tipo: tipo.value,
      unidad: unidad.value,
      stock: stock.value,
      min_stock: min_stock.value
    })
  });

  if (!form) return;

  await fetch(`https://globalmotriz-backend.onrender.com/inventario/new`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify(form)
  });

  Swal.fire("✅ Guardado", "Insumo creado", "success");
  cargarInventario();
}

/* ✅ Sumar stock */
async function modalStock(codigo) {
  const { value } = await Swal.fire({
    title: `Agregar stock a ${codigo}`,
    input: "number",
    inputPlaceholder: "Cantidad",
    showCancelButton: true,
    confirmButtonText: "Agregar"
  });

  if (!value) return;
  
  await fetch(`https://globalmotriz-backend.onrender.com/inventario/stock`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify({ codigo, cantidad: value })
  });

  Swal.fire("✅ Stock actualizado", "", "success");
  cargarInventario();
}

/* ✅ Editar insumo */
async function modalEditar(codigo) {
  const { value } = await Swal.fire({
    title: `Editar ${codigo}`,
    input: "text",
    inputPlaceholder: "Nuevo mínimo",
    showCancelButton: true,
    confirmButtonText: "Guardar"
  });

  if (!value) return;

  await fetch(`https://globalmotriz-backend.onrender.com/inventario/min`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify({ codigo, min_stock: value })
  });

  Swal.fire("✅ Actualizado", "", "success");
  cargarInventario();
}

/* ✅ Importar Excel */
async function modalImportarExcel() {
  const { value: file } = await Swal.fire({
    title: "Importar Excel",
    input: "file",
    inputAttributes: { accept: ".xlsx,.xls" },
    showCancelButton: true
  });

  if (!file) return;

  const form = new FormData();
  form.append("file", file);

  await fetch(`https://globalmotriz-backend.onrender.com/inventario/import`, {
    method: "POST",
    headers: { Authorization: "Bearer " + localStorage.getItem("token") },
    body: form
  });

  Swal.fire("✅ Inventario actualizado");
  cargarInventario();
}

/* ✅ Descargar plantilla */
function descargarPlantilla() {
  const csv = "codigo,nombre,cantidad\n";
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla_inventario.csv";
  a.click();
  URL.revokeObjectURL(url);
}
