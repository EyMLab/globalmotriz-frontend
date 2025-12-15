document.addEventListener("DOMContentLoaded", () => {

  const API_BASE_URL = "https://globalmotriz-backend.onrender.com";
  const TOKEN = localStorage.getItem("token");

  /* ================= UTILIDADES ================= */

  function formatearTiempo(segundos) {
    const dias = Math.floor(segundos / 86400);
    const horas = Math.floor((segundos % 86400) / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);

    let out = [];
    if (dias > 0) out.push(`${dias}d`);
    if (horas > 0 || dias > 0) out.push(`${horas}h`);
    out.push(`${String(minutos).padStart(2,'0')}m`);
    return out.join(" ");
  }

  /* ================= KANBAN ================= */

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
        ${est.vehiculos.length === 0 ? "<p style='text-align:center;opacity:.6'>Sin vehículos</p>" : ""}
      `;

      est.vehiculos.forEach(v => {
        const card = document.createElement("div");
        card.className = "vehicle-card";
        card.innerHTML = `
          <div class="placa">${v.placa}</div>
          <div class="time">En estación: ${formatearTiempo(v.segundos_estacion)}</div>
          <div class="time">En taller: ${formatearTiempo(v.segundos_total)}</div>
        `;
        card.onclick = () => abrirModalVehiculo(est, v);
        col.appendChild(card);
      });

      cont.appendChild(col);
    });

    document.getElementById("totalEnTaller").innerText =
      `Vehículos en taller: ${data.total_en_taller}`;

    document.getElementById("ultimaActualizacion").innerText =
      `Última actualización: ${new Date(data.ultima_actualizacion).toLocaleTimeString("es-EC")}`;
  }

  setInterval(cargarLPR, 3000);
  cargarLPR();

  /* ================= MODAL VEHÍCULO ================= */

  const modalVeh = document.getElementById("modal-vehiculo");
  const modalPlaca = document.getElementById("modal-placa");
  const modalEst = document.getElementById("modal-estacion");
  const modalTE = document.getElementById("modal-tiempo-estacion");
  const modalTT = document.getElementById("modal-tiempo-total");
  const modalHist = document.getElementById("modal-historial");

  document.getElementById("modal-close").onclick = () => modalVeh.style.display = "none";

  async function abrirModalVehiculo(est, veh) {
    modalPlaca.textContent = veh.placa;
    modalEst.textContent = est.estacion;
    modalTE.textContent = formatearTiempo(veh.segundos_estacion);
    modalTT.textContent = formatearTiempo(veh.segundos_total);

    const res = await fetch(`${API_BASE_URL}/lpr/historial/${veh.placa}`, {
      headers: { Authorization: "Bearer " + TOKEN }
    });
    const data = await res.json();

    modalHist.innerHTML = "";
    data.historial.slice(0,5).forEach(h => {
      const li = document.createElement("li");
      li.textContent = `${h.estacion} - ${new Date(h.inicio).toLocaleString("es-EC")} (${formatearTiempo(h.segundos_estacion)})`;
      modalHist.appendChild(li);
    });

    document.getElementById("btn-historial-completo").onclick =
      () => abrirModalHistorialCompleto(veh.placa);

    modalVeh.style.display = "flex";
  }

  /* ================= MODAL HISTORIAL COMPLETO ================= */

  const modalHC = document.getElementById("modal-historial-completo");
  const tablaHC = document.getElementById("tabla-historial-completo");

  document.getElementById("modal-historial-close").onclick =
    () => modalHC.style.display = "none";

  async function abrirModalHistorialCompleto(placa) {
    const res = await fetch(`${API_BASE_URL}/lpr/historial/${placa}`, {
      headers: { Authorization: "Bearer " + TOKEN }
    });
    const data = await res.json();

    tablaHC.innerHTML = "";
    data.historial.forEach(h => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${h.estacion}</td>
        <td>${new Date(h.inicio).toLocaleString("es-EC")}</td>
        <td>${h.fin ? new Date(h.fin).toLocaleString("es-EC") : "-"}</td>
        <td>${formatearTiempo(h.segundos_estacion)}</td>
      `;
      tablaHC.appendChild(tr);
    });

    modalHC.style.display = "flex";
  }

  /* ================= MODAL SALIDAS ================= */

  const modalSal = document.getElementById("modal-salidas");
  const tablaSal = document.getElementById("tabla-salidas");
  let pagina = 1;
  const porPagina = 10;

  document.getElementById("btn-ver-salidas").onclick = () => {
    modalSal.style.display = "flex";
    cargarSalidas();
  };
  document.getElementById("modal-salidas-close").onclick =
    () => modalSal.style.display = "none";

  document.getElementById("btn-filtrar-salidas").onclick = () => {
    pagina = 1;
    cargarSalidas();
  };

  async function cargarSalidas() {
    const params = new URLSearchParams({
      desde: salidas-desde.value,
      hasta: salidas-hasta.value,
      placa: salidas-placa.value,
      page: pagina,
      limit: porPagina
    });

    const res = await fetch(`${API_BASE_URL}/lpr/salidas?${params}`, {
      headers: { Authorization: "Bearer " + TOKEN }
    });
    const data = await res.json();

    tablaSal.innerHTML = "";
    data.data.forEach(v => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${v.placa}</td>
        <td>${new Date(v.fecha_entrada).toLocaleString("es-EC")}</td>
        <td>${new Date(v.fecha_salida).toLocaleString("es-EC")}</td>
        <td>${formatearTiempo(v.segundos_total)}</td>
      `;
      tablaSal.appendChild(tr);
    });

    document.getElementById("pagina-salidas").innerText = `Página ${pagina}`;
  }

  document.getElementById("prev-salidas").onclick = () => {
    if (pagina > 1) { pagina--; cargarSalidas(); }
  };
  document.getElementById("next-salidas").onclick = () => {
    pagina++; cargarSalidas();
  };

});
