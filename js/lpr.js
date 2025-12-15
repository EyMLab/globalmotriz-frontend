document.addEventListener("DOMContentLoaded", () => {

  const API_BASE_URL = "https://globalmotriz-backend.onrender.com";
  const TOKEN = localStorage.getItem("token");

  // =====================================================
  // FORMATEO TIEMPO
  // =====================================================
  function formatTime(seconds) {
    const dias = Math.floor(seconds / 86400);
    const horas = Math.floor((seconds % 86400) / 3600);
    const minutos = Math.floor((seconds % 3600) / 60);

    let out = [];
    if (dias > 0) out.push(`${dias}d`);
    if (horas > 0 || dias > 0) out.push(`${horas}h`);
    out.push(`${String(minutos).padStart(2, "0")}m`);

    return out.join(" ");
  }

  // =====================================================
  // CARGAR KANBAN
  // =====================================================
  async function cargarLPR() {
    const res = await fetch(`${API_BASE_URL}/lpr/estado`, {
      headers: { Authorization: "Bearer " + TOKEN }
    });

    const data = await res.json();
    renderKanban(data);
  }

  function renderKanban(data) {
    const cont = document.getElementById("kanban-container");
    cont.innerHTML = "";

    data.estaciones.forEach(est => {
      const col = document.createElement("div");
      col.className = "kanban-column";
      col.style.borderTop = `6px solid ${est.color}`;
      col.style.background = est.color + "20";

      col.innerHTML = `
        <div class="kanban-title">${est.estacion}</div>
        ${est.vehiculos.length === 0 ? "<p style='text-align:center;opacity:.5'>Sin vehículos</p>" : ""}
      `;

      est.vehiculos.forEach(v => {
        const card = document.createElement("div");
        card.className = "vehicle-card";

        card.innerHTML = `
          <div class="placa">${v.placa}</div>
          <div class="time">En estación: ${formatTime(v.segundos_estacion)}</div>
          <div class="time">En taller: ${formatTime(v.segundos_total)}</div>
        `;

        card.onclick = () => abrirModalVehiculo(est, v);
        col.appendChild(card);
      });

      cont.appendChild(col);
    });

    document.getElementById("totalEnTaller").textContent =
      `Vehículos en taller: ${data.total_en_taller}`;

    document.getElementById("ultimaActualizacion").textContent =
      `Última actualización: ${new Date(data.ultima_actualizacion).toLocaleTimeString("es-EC")}`;
  }

  setInterval(cargarLPR, 3000);
  cargarLPR();

  // =====================================================
  // MODAL VEHÍCULO
  // =====================================================
  const modal = document.getElementById("modal-vehiculo");
  const modalPlaca = document.getElementById("modal-placa");
  const modalEstacion = document.getElementById("modal-estacion");
  const modalTiempoEst = document.getElementById("modal-tiempo-estacion");
  const modalTiempoTotal = document.getElementById("modal-tiempo-total");
  const modalHistorial = document.getElementById("modal-historial");

  document.getElementById("modal-close").onclick = () => modal.style.display = "none";

  async function abrirModalVehiculo(est, veh) {
    modalPlaca.textContent = veh.placa;
    modalEstacion.textContent = est.estacion;
    modalTiempoEst.textContent = formatTime(veh.segundos_estacion);
    modalTiempoTotal.textContent = formatTime(veh.segundos_total);

    const res = await fetch(`${API_BASE_URL}/lpr/historial/${veh.placa}`, {
      headers: { Authorization: "Bearer " + TOKEN }
    });
    const data = await res.json();

    modalHistorial.innerHTML = "";
    data.historial.slice(0, 5).forEach(h => {
      const li = document.createElement("li");
      li.textContent =
        `${h.estacion} - ${new Date(h.inicio).toLocaleString("es-EC")} (${formatTime(h.segundos_estacion)})`;
      modalHistorial.appendChild(li);
    });

    document.getElementById("btn-historial-completo").onclick =
      () => abrirModalHistorialCompleto(veh.placa);

    modal.style.display = "flex";
  }

  // =====================================================
  // MODAL HISTORIAL COMPLETO
  // =====================================================
  const modalHistComp = document.getElementById("modal-historial-completo");
  const tablaHistComp = document.getElementById("tabla-historial-completo");

  document.getElementById("modal-historial-close").onclick =
    () => modalHistComp.style.display = "none";

  async function abrirModalHistorialCompleto(placa) {
    const res = await fetch(`${API_BASE_URL}/lpr/historial/${placa}`, {
      headers: { Authorization: "Bearer " + TOKEN }
    });
    const data = await res.json();

    tablaHistComp.innerHTML = "";
    data.historial.forEach(h => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${h.estacion}</td>
        <td>${new Date(h.inicio).toLocaleString("es-EC")}</td>
        <td>${h.fin ? new Date(h.fin).toLocaleString("es-EC") : "-"}</td>
        <td>${formatTime(h.segundos_estacion)}</td>
      `;
      tablaHistComp.appendChild(tr);
    });

    modalHistComp.style.display = "flex";
  }

});
