document.addEventListener("DOMContentLoaded", () => {

  const API_BASE_URL = "https://globalmotriz-backend.onrender.com";
  const TOKEN = localStorage.getItem("token");

  async function cargarLPR() {
    try {
      const res = await fetch(`${API_BASE_URL}/lpr/estado`, {
        headers: {
          "Authorization": "Bearer " + TOKEN,
          "Content-Type": "application/json"
        }
      });

      if (!res.ok) {
        console.error("❌ Error HTTP:", res.status);
        return;
      }

      const data = await res.json();
      console.log("DATA LPR:", data);
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
      col.style.background = est.color + "20"; // agrega transparencia

      col.innerHTML = `
        <div class="kanban-title">${est.estacion}</div>
        ${est.vehiculos.length === 0 ? "<p style='opacity:0.5;text-align:center;'>Sin vehículos</p>" : ""}
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

  function formatTime(seconds) {
    const totalMinutes = Math.floor(seconds / 60);

    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    let parts = [];

    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || days > 0) parts.push(`${hours}h`);
    parts.push(`${String(minutes).padStart(2, '0')}m`);

    return parts.join(" ");
  }


  setInterval(cargarLPR, 3000);
  cargarLPR();

// Modal elements
const modal = document.getElementById("modal-vehiculo");
const modalPlaca = document.getElementById("modal-placa");
const modalEstacion = document.getElementById("modal-estacion");
const modalTiempoEst = document.getElementById("modal-tiempo-estacion");
const modalTiempoTotal = document.getElementById("modal-tiempo-total");
const modalHistorial = document.getElementById("modal-historial");
document.getElementById("modal-close").onclick = () => modal.style.display = "none";

// FUNCION PARA ABRIR MODAL
async function abrirModalVehiculo(estacion, veh) {
  modalPlaca.textContent = veh.placa;
  modalEstacion.textContent = estacion.estacion;
  modalTiempoEst.textContent = formatTime(veh.segundos_estacion);
  modalTiempoTotal.textContent = formatTime(veh.segundos_total);

  // Cargar historial desde backend
  const res = await fetch(`${API_BASE_URL}/lpr/historial/${veh.placa}`, {
    headers: { Authorization: "Bearer " + TOKEN }
  });
  const data = await res.json();

  modalHistorial.innerHTML = "";

  data.historial.forEach(h => {
    const li = document.createElement("li");
    li.textContent = `${h.estacion} - ${new Date(h.inicio).toLocaleString("es-EC")}`;
    modalHistorial.appendChild(li);
  });

  modal.style.display = "flex";
}



}); // FIN DOMContentLoaded
