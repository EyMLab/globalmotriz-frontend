document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("token");
  if (!token) return (window.location.href = "index.html");

  const tabla = document.querySelector("#tabla-inventario tbody");

  const res = await fetch(`${API_BASE_URL}/inventario/list`, {
    headers: { "Authorization": "Bearer " + token }
  });

  const data = await res.json();

  tabla.innerHTML = "";

  data.forEach(item => {
    const tr = document.createElement("tr");

    const color = item.estado === "green" ? "🟢"
                : item.estado === "yellow" ? "🟡"
                : "🔴";

    tr.innerHTML = `
      <td>${item.codigo}</td>
      <td>${item.nombre}</td>
      <td>${item.tipo}</td>
      <td>${item.unidad ?? "-"}</td>
      <td>${item.stock}</td>
      <td>${item.min_stock}</td>
      <td>${color}</td>
      <td>
        <button onclick="aumentar('${item.codigo}')">➕ Stock</button>
        <button onclick="editar('${item.codigo}')">✏️ Editar</button>
        <button onclick="eliminar('${item.codigo}')">🗑️</button>
      </td>
    `;

    tabla.appendChild(tr);
  });
});

// Se crearán en pasos posteriores
function aumentar(cod){ alert("Aumentar stock: " + cod); }
function editar(cod){ alert("Editar: " + cod); }
function eliminar(cod){ alert("Eliminar: " + cod); }
