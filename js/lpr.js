document.addEventListener("DOMContentLoaded", () => {

  const API_BASE_URL = "https://globalmotriz-backend.onrender.com";
  const TOKEN = localStorage.getItem("token");

  if (!TOKEN) {
    localStorage.clear();
    window.location.href = "index.html";
    return;
  }

  /* ======================================================
      ESTADO GLOBAL
  ====================================================== */
  let pausaLPR = false;
  let placaSeleccionada = null;

  let paginaSalidas = 1;
  const limiteSalidas = 10;
  let ultimoTotal = 0;

  /* ======================================================
      HELPERS
  ====================================================== */
  function redirectLogin() {
    localStorage.clear();
    window.location.href = "index.html";
  }

  async function apiFetch(path) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: "Bearer " + TOKEN }
    });

    if (res.status === 401 || res.status === 403) {
      redirectLogin();
      return null;
    }

    return res;
  }

  async function safeJson(res) {
    try { return await res.json(); } catch { return null; }
  }

  function cerrarTodosLosModales() {
    document.querySelectorAll(".modal-vehiculo").forEach(m => {
      m.style.display = "none";
    });
  }

  function formatTime(seconds) {
    if (!seconds && seconds !== 0) return "--";
    const dias = Math.floor(seconds / 86400);
    const horas = Math.floor((seconds % 86400) / 3600);
    const minutos = Math.floor((seconds % 3600) / 60);

    let out = [];
    if (dias > 0) out.push(`${dias}d`);
    if (horas > 0 || dias > 0) out.push(`${horas}h`);
    out.push(`${String(minutos).padStart(2, "0")}m`);

    return out.join(" ");
  }

  // ✅ Nueva función para formatear fechas que vienen del backend
  function formatFecha(fechaStr) {
    if (!fechaStr) return "-";
    
    // Convertir a objeto Date
    const fecha = new Date(fechaStr);
    
    // Formatear de manera amigable
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const año = fecha.getFullYear();
    
    const horas = String(fecha.getHours()).padStart(2, '0');
    const minutos = String(fecha.getMinutes()).padStart(2, '0');
    
    // Formato: 21/01/2026 5:01 PM
    const ampm = fecha.getHours() >= 12 ? 'PM' : 'AM';
    const horas12 = fecha.getHours() % 12 || 12;
    
    return `${dia}/${mes}/${año} ${horas12}:${minutos} ${ampm}`;
  }

  /* ======================================================
      KANBAN PRINCIPAL
  ====================================================== */
  async function cargarLPR() {
    if (pausaLPR) return;

    try {
      const res = await apiFetch("/lpr/estado");
      if (!res || !res.ok) return;

      const data = await safeJson(res);
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

    // Última actualización
    if (data.ultima_actualizacion) {
      document.getElementById("ultimaActualizacion").textContent =
        `Última actualización: ${new Date(data.ultima_actualizacion).toLocaleTimeString("es-EC")}`;
    }
  }

  setInterval(cargarLPR, 3000);
  cargarLPR();

  /* ======================================================
      MODAL VEHÍCULO
  ====================================================== */
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
      const res = await apiFetch(`/lpr/historial/${veh.placa}`);
      if (!res || !res.ok) return;

      const data = await safeJson(res);
      modalHistorial.innerHTML = "";

      // ✅ Las fechas ya vienen en hora Ecuador del backend
      data.historial.slice(0, 5).forEach(h => {
        const li = document.createElement("li");
        const fechaLocal = formatFecha(h.inicio);
        li.textContent = `${h.estacion} - ${fechaLocal} (${formatTime(h.segundos_estacion)})`;
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

  /* ======================================================
      MODAL HISTORIAL COMPLETO
  ====================================================== */
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
      // Primero obtenemos todas las sesiones
      const resSesiones = await apiFetch(`/lpr/sesiones/${placa}`);
      if (!resSesiones || !resSesiones.ok) return;

      const dataSesiones = await safeJson(resSesiones);
      tablaHistComp.innerHTML = "";

      if (!dataSesiones.sesiones || dataSesiones.sesiones.length === 0) {
        tablaHistComp.innerHTML = `<tr><td colspan="4">Sin historial</td></tr>`;
        modalHistComp.style.display = "flex";
        return;
      }

      // Por cada sesión, mostramos un encabezado y luego sus tramos
      for (const sesion of dataSesiones.sesiones) {
        
        // Fila de encabezado de sesión
        const trSesion = document.createElement("tr");
        trSesion.style.backgroundColor = sesion.estado === 'ACTIVA' ? '#e3f2fd' : '#f5f5f5';
        trSesion.style.fontWeight = 'bold';
        
        const estadoBadge = sesion.estado === 'ACTIVA' 
          ? '<span style="color: green;">🟢 ACTIVA</span>' 
          : '<span style="color: gray;">⚫ FINALIZADA</span>';
        
        const entrada = formatFecha(sesion.fecha_entrada);
        const salida = sesion.fecha_salida ? formatFecha(sesion.fecha_salida) : 'En proceso';
        const tiempoTotal = sesion.segundos_total ? formatTime(sesion.segundos_total) : '-';
        
        trSesion.innerHTML = `
          <td colspan="4" style="padding: 12px 8px;">
            ${estadoBadge} | 
            Entrada: ${entrada} | 
            Salida: ${salida} | 
            Tiempo: ${tiempoTotal}
          </td>
        `;
        tablaHistComp.appendChild(trSesion);

        // Obtenemos los tramos de esta sesión
        const resTramos = await apiFetch(`/lpr/historial/${placa}?sesion_id=${sesion.sesion_id}`);
        if (resTramos && resTramos.ok) {
          const dataTramos = await safeJson(resTramos);
          
          if (dataTramos.historial && dataTramos.historial.length > 0) {
            dataTramos.historial.forEach(h => {
              const tr = document.createElement("tr");
              tr.style.backgroundColor = sesion.estado === 'ACTIVA' ? '#f1f8ff' : '#fafafa';
              
              const inicioLocal = formatFecha(h.inicio);
              const finLocal = h.fin ? formatFecha(h.fin) : "-";

              tr.innerHTML = `
                <td style="padding-left: 20px;">↳ ${h.estacion}</td>
                <td>${inicioLocal}</td>
                <td>${finLocal}</td>
                <td>${formatTime(h.segundos_estacion)}</td>
              `;
              tablaHistComp.appendChild(tr);
            });
          }
        }

        // Línea separadora entre sesiones
        const trSeparador = document.createElement("tr");
        trSeparador.innerHTML = `<td colspan="4" style="height: 5px; background: white;"></td>`;
        tablaHistComp.appendChild(trSeparador);
      }

      modalHistComp.style.display = "flex";

    } catch (err) {
      console.error("❌ Error historial completo", err);
    }
  }

  /* ======================================================
      MODAL SALIDAS
  ====================================================== */
  const modalSalidas = document.getElementById("modal-salidas");
  const tablaSalidas = document.getElementById("tabla-salidas");
  const pageInfo = document.getElementById("salidas-page-info");

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
      const res = await apiFetch(`/lpr/salidas?${params}`);
      if (!res || !res.ok) return;

      const data = await safeJson(res);
      renderSalidas(data);

    } catch (err) {
      console.error("❌ Error salidas", err);
    }
  }

  function renderSalidas(data) {
    tablaSalidas.innerHTML = "";
    ultimoTotal = data.total;

    if (!data.data.length) {
      tablaSalidas.innerHTML = `<tr><td colspan="4">Sin resultados</td></tr>`;
      pageInfo.textContent = "";
      return;
    }

    data.data.forEach(v => {
      const tr = document.createElement("tr");
      
      // ✅ Las fechas ya vienen en hora Ecuador del backend
      const entradaLocal = formatFecha(v.fecha_entrada);
      const salidaLocal = formatFecha(v.fecha_salida);

      tr.innerHTML = `
        <td class="placa-link" data-placa="${v.placa}">${v.placa}</td>
        <td>${entradaLocal}</td>
        <td>${salidaLocal}</td>
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