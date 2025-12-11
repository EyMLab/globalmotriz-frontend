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
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
  }

  setInterval(cargarLPR, 3000);
  cargarLPR();

}); // FIN DOMContentLoaded
