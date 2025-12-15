document.addEventListener("DOMContentLoaded", () => {

  const API_BASE_URL = "https://globalmotriz-backend.onrender.com";
  const TOKEN = localStorage.getItem("token");

  if (!TOKEN) {
    window.location.href = "index.html";
    return;
  }

  // ===============================
  // CARGAR KANBAN
  // ===============================
  async function cargarLPR() {
    try {
      const res = await fetch(`${API_BASE_URL}/lpr/estado`, {
        headers: {
          Authorization: "Bearer " + TOKEN
        }
      });

      if (!res.ok) {
        console.error("❌ Error HTTP:", res.status);
        return;
      }

      const data = await res.json();
      renderKanban(data);

    } catch (err) {
      console.error("❌ Error cargando estado LPR:", err);
    }
  }

  function renderKanban(data) {
    const container = document.getElementById("kanban-container");
    container.innerHTML = "";

    data.estaciones.forEach(est => {
      const col = document.createElement("div");
      col.className = "kanban-column";
      col.style.borderTop = `6px solid ${est.color}`;
      col.style.background = est.color + "20";

      col.innerHTML = `
        <div class="kanban-title">${est.estacion}</div>
        ${est.vehiculos.length === 0
          ? "<p style='opacity:0.5;text-align:center;'>Sin vehículos</p>"
          : ""
        }
      `;

      est.vehiculos.forEach(v => {
        const card = document.createElement("div");
        card.className = "vehicle-card";

        card.innerHTML = `
          <div class="placa">${v.placa}</div>
          <div class="time">En estación: ${formatTime(v.segundos_estacion)}</div>
          <div class="time">En taller: ${formatTime(v.segundos_total)}</div>
        `;

        card.addEventListener("click", () => abrirModalVehiculo(est, v));
        col.appendChild(card);
      });

      container.appendChild(col);
    });

    document.getElementById("totalEnTaller").innerText =
      "Vehículos en taller: " + data.total_en_taller;

    document.getElementById("ultimaActualizacion").innerText =
      "Última actualización: " +
      new Date(data.ultima_actualizacion).toLocaleTimeString("es-EC");
  }

  // ===============================
  // FORMATEAR TIEMPO (ÚNICO)
  // ===============================
  function formatTime(seconds) {
    const totalMinutes = Math.floor(seconds / 60);

    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    let parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || days > 0) parts.push(`${hours}h`);
    parts.push(`${String(minutes).padStart(2, "0")}m`);

    return parts.join(" ");
  }

  setInterval(cargarLPR, 3000);
  cargarLPR();

  // ===============================
  // MODAL VEHÍCULO
  // ===============================
  const modal = document.getElementById("modal-vehiculo");
  const modalPlaca = document.getElementById("modal-placa");
  const modalEstacion = document.getElementById("modal-estacion");
  const modalTiempoEst = document.getElementById("modal-tiempo-estacion");
  const modalTiempoTotal = document.getElementById("modal-tiempo-total");
  const modalHistorial = document.getElementById("modal-historial");

  document.getElementById("modal-close").onclick = () => {
    modal.style.display = "none";
  };

  async function abrirModalVehiculo(estacion, veh) {
    modalPlaca.textContent = veh.placa;
    modalEstacion.textContent = estacion.estacion;
    modalTiempoEst.textContent = formatTime(veh.segundos_estacion);
    modalTiempoTotal.textContent = formatTime(veh.segundos_total);

    const res = await fetch(
      `${API_BASE_URL}/lpr/historial/${veh.placa}`,
      { headers: { Authorization: "Bearer " + TOKEN } }
    );

    const data = await res.json();
    modalHistorial.innerHTML = "";

    data.historial.forEach(h => {
      const li = document.createElement("li");
      li.textContent =
        `${h.estacion} - ${new Date(h.inicio).toLocaleString("es-EC")}`;
      modalHistorial.appendChild(li);
    });

    modal.style.display = "flex";
  }

// ===============================
// MODAL SALIDAS
// ===============================
const modalSalidas = document.getElementById("modal-salidas");
const tablaSalidas = document.getElementById("tabla-salidas");
const pageInfo = document.getElementById("salidas-page-info");

let salidasData = [];
let paginaSalidas = 1;
const filasPorPagina = 10;

document.getElementById("btn-ver-salidas").onclick = () => {
  modalSalidas.style.display = "flex";
  paginaSalidas = 1;
  cargarSalidas();
};

document.getElementById("modal-salidas-close").onclick = () => {
  modalSalidas.style.display = "none";
};

document.getElementById("btn-filtrar-salidas").onclick = () => {
  paginaSalidas = 1;
  cargarSalidas();
};

document.getElementById("salidas-prev").onclick = () => {
  if (paginaSalidas > 1) {
    paginaSalidas--;
    renderSalidas();
  }
};

document.getElementById("salidas-next").onclick = () => {
  if (paginaSalidas * filasPorPagina < salidasData.length) {
    paginaSalidas++;
    renderSalidas();
  }
};

// ===============================
// Cargar salidas
// ===============================
async function cargarSalidas() {
  const desde = document.getElementById("salidas-desde").value;
  const hasta = document.getElementById("salidas-hasta").value;
  const placa = document.getElementById("salidas-placa").value.trim();

  const params = new URLSearchParams();
  if (desde) params.append("desde", desde);
  if (hasta) params.append("hasta", hasta);
  if (placa) params.append("placa", placa);

  const res = await fetch(`${API_BASE_URL}/lpr/salidas?${params}`, {
    headers: { Authorization: "Bearer " + TOKEN }
  });

  const data = await res.json();
  salidasData = data.data || [];
  renderSalidas();
}

// ===============================
// Render tabla con paginación
// ===============================
function renderSalidas() {
  tablaSalidas.innerHTML = "";

  if (!salidasData.length) {
    tablaSalidas.innerHTML =
      `<tr><td colspan="4">Sin resultados</td></tr>`;
    pageInfo.textContent = "";
    return;
  }

  const start = (paginaSalidas - 1) * filasPorPagina;
  const end = start + filasPorPagina;
  const pageData = salidasData.slice(start, end);

  pageData.forEach(v => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${v.placa}</td>
      <td>${new Date(v.fecha_entrada).toLocaleString("es-EC")}</td>
      <td>${new Date(v.fecha_salida).toLocaleString("es-EC")}</td>
      <td>${formatearDuracion(v.segundos_total)}</td>
    `;

    tablaSalidas.appendChild(tr);
  });

  const totalPages = Math.ceil(salidasData.length / filasPorPagina);
  pageInfo.textContent = `Página ${paginaSalidas} de ${totalPages}`;
}

function formatearDuracion(segundos) {
  const dias = Math.floor(segundos / 86400);
  const horas = Math.floor((segundos % 86400) / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);

  let txt = "";
  if (dias > 0) txt += `${dias}d `;
  if (horas > 0 || dias > 0) txt += `${horas}h `;
  txt += `${minutos}m`;

  return txt;
}


});
