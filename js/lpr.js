document.addEventListener("DOMContentLoaded", () => {

  const API_BASE_URL = "https://globalmotriz-backend.onrender.com";
  const TOKEN = localStorage.getItem("token");

  let pausaLPR = false;
  let placaSeleccionada = null;

  // =====================================================
  // UTILIDAD: cerrar todos los modales
  // =====================================================
  function cerrarTodosLosModales() {
    document.querySelectorAll(".modal-vehiculo").forEach(m => {
      m.style.display = "none";
    });
  }

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
    if (pausaLPR) return;

    try {
      const res = await fetch(`${API_BASE_URL}/lpr/estado`, {
        headers: { Authorization: "Bearer " + TOKEN }
      });

      if (!res.ok) return;

      const data = await res.json();
      renderKanban(data);

    } catch (err) {
      console.error("❌ Error cargando LPR", err);
    }
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
        ${est.vehiculos.length === 0
          ? "<p style='text-align:center;opacity:.5'>Sin vehículos</p>"
          : ""}
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
  const modalVehiculo = document.getElementById("modal-vehiculo");
  const modalPlaca = document.getElementById("modal-placa");
  const modalEstacion = document.getElementById("modal-estacion");
  const modalTiempoEst = document.getElementById("modal-tiempo-estacion");
  const modalTiempoTotal = document.getElementById("modal-tiempo-total");
  const modalHistorial = document.getElementById("modal-historial");

  document.getElementById("modal-close").onclick = () => {
    cerrarTodosLosModales();
    pausaLPR = false;
  };

  async function abrirModalVehiculo(est, veh) {
    cerrarTodosLosModales();
    pausaLPR = true;
    placaSeleccionada = veh.placa;

    modalPlaca.textContent = veh.placa;
    modalEstacion.textContent = est.estacion;
    modalTiempoEst.textContent = formatTime(veh.segundos_estacion);
    modalTiempoTotal.textContent = formatTime(veh.segundos_total);

    try {
      const res = await fetch(`${API_BASE_URL}/lpr/historial/${veh.placa}`, {
        headers: { Authorization: "Bearer " + TOKEN }
      });

      if (!res.ok) return;

      const data = await res.json();
      modalHistorial.innerHTML = "";

      data.historial.slice(0, 5).forEach(h => {
        const li = document.createElement("li");
        li.textContent =
          `${h.estacion} - ${new Date(h.inicio).toLocaleString("es-EC")}
           (${formatTime(h.segundos_estacion)})`;
        modalHistorial.appendChild(li);
      });

    } catch (err) {
      console.error("❌ Error historial", err);
    }

    modalVehiculo.style.display = "flex";
  }

  document.getElementById("btn-historial-completo").onclick = () => {
    if (placaSeleccionada) abrirModalHistorialCompleto(placaSeleccionada);
  };

  // =====================================================
  // MODAL HISTORIAL COMPLETO
  // =====================================================
  const modalHistComp = document.getElementById("modal-historial-completo");
  const tablaHistComp = document.getElementById("tabla-historial-completo");

  document.getElementById("modal-historial-close").onclick = () => {
    cerrarTodosLosModales();
    pausaLPR = false;
  };

  async function abrirModalHistorialCompleto(placa) {
    cerrarTodosLosModales();
    pausaLPR = true;

    try {
      const res = await fetch(`${API_BASE_URL}/lpr/historial/${placa}`, {
        headers: { Authorization: "Bearer " + TOKEN }
      });

      if (!res.ok) return;

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

    } catch (err) {
      console.error("❌ Error historial completo", err);
    }
  }

  // =====================================================
  // MODAL SALIDAS
  // =====================================================
  const modalSalidas = document.getElementById("modal-salidas");
  const tablaSalidas = document.getElementById("tabla-salidas");
  const pageInfo = document.getElementById("salidas-page-info");

  let paginaSalidas = 1;
  const limiteSalidas = 10;
  let ultimoTotal = 0;

  document.getElementById("btn-ver-salidas").onclick = () => {
    cerrarTodosLosModales();
    paginaSalidas = 1;
    pausaLPR = true;
    modalSalidas.style.display = "flex";
    cargarSalidas();
  };

  document.getElementById("modal-salidas-close").onclick = () => {
    cerrarTodosLosModales();
    pausaLPR = false;
  };

  document.getElementById("btn-filtrar-salidas").onclick = () => {
    paginaSalidas = 1;
    cargarSalidas();
  };

  document.getElementById("salidas-prev").onclick = () => {
    if (paginaSalidas > 1) {
      paginaSalidas--;
      cargarSalidas();
    }
  };

  document.getElementById("salidas-next").onclick = () => {
    if (paginaSalidas < Math.ceil(ultimoTotal / limiteSalidas)) {
      paginaSalidas++;
      cargarSalidas();
    }
  };

  async function cargarSalidas() {
    const desde = document.getElementById("salidas-desde").value;
    const hasta = document.getElementById("salidas-hasta").value;
    const placa = document.getElementById("salidas-placa").value;

    const params = new URLSearchParams({
      page: paginaSalidas,
      limit: limiteSalidas
    });

    if (desde) params.append("desde", desde);
    if (hasta) params.append("hasta", hasta);
    if (placa) params.append("placa", placa);

    try {
      const res = await fetch(`${API_BASE_URL}/lpr/salidas?${params}`, {
        headers: { Authorization: "Bearer " + TOKEN }
      });

      if (!res.ok) return;

      const data = await res.json();
      renderSalidas(data);

    } catch (err) {
      console.error("❌ Error salidas", err);
    }
  }

  function renderSalidas(data) {
    tablaSalidas.innerHTML = "";
    ultimoTotal = data.total;

    if (!data.data.length) {
      tablaSalidas.innerHTML =
        `<tr><td colspan="4">Sin resultados</td></tr>`;
      pageInfo.textContent = "";
      return;
    }

    data.data.forEach(v => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="placa-link" data-placa="${v.placa}">${v.placa}</td>
        <td>${new Date(v.fecha_entrada).toLocaleString("es-EC")}</td>
        <td>${new Date(v.fecha_salida).toLocaleString("es-EC")}</td>
        <td>${formatTime(v.segundos_total)}</td>
      `;
      tablaSalidas.appendChild(tr);
    });

    document.querySelectorAll(".placa-link").forEach(td => {
      td.onclick = () => abrirModalHistorialCompleto(td.dataset.placa);
    });

    pageInfo.textContent =
      `Página ${data.page} de ${Math.ceil(data.total / data.limit)}`;
  }

});
