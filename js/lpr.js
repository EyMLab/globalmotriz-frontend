document.addEventListener("DOMContentLoaded", () => {

  const Z_INDEX_ALERTA = 99999999;

  if (!getToken()) {
    redirectLogin();
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
  let terminoBusqueda = "";
  let rolUsuario = "";

  /* ======================================================
      HELPERS
  ====================================================== */
  function cerrarTodosLosModales() {
    document.querySelectorAll(".modal-vehiculo").forEach(m => {
      m.style.display = "none";
    });
    const inputPlaca = document.getElementById('input-placa-interna');
    const inputDesc = document.getElementById('input-desc-interna');
    if (inputPlaca) inputPlaca.value = '';
    if (inputDesc) inputDesc.value = '';
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

  function formatFecha(fechaStr) {
    if (!fechaStr) return "-";
    const fecha = new Date(fechaStr);

    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const año = fecha.getFullYear();

    const minutos = String(fecha.getMinutes()).padStart(2, '0');
    const ampm = fecha.getHours() >= 12 ? 'PM' : 'AM';
    const horas12 = fecha.getHours() % 12 || 12;

    return `${dia}/${mes}/${año} ${horas12}:${minutos} ${ampm}`;
  }

  function formatPuestoUI(puestoRaw) {
    if (!puestoRaw) return "";

    const p = String(puestoRaw).toUpperCase().trim();

    if (p === "UNICO") return "";

    // Formato con prefijo de cámara: E1_PUESTO_1, E2_PUESTO_2, etc.
    const matchConPrefijo = p.match(/^([A-Z]+\d*)_PUESTO_(\d+)$/);
    if (matchConPrefijo) return `${matchConPrefijo[1]} · P${matchConPrefijo[2]}`;

    // Formato simple: PUESTO_1, PUESTO_2
    const matchSimple = p.match(/^PUESTO_(\d+)$/);
    if (matchSimple) return `Puesto ${matchSimple[1]}`;

    // Formatos legacy
    if (p === "IZQUIERDA") return "Izq";
    if (p === "DERECHA") return "Der";

    return p;
  }

  /* ======================================================
      KANBAN PRINCIPAL (LÓGICA DE PUESTOS Y PATIO)
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

  // Estaciones temporalmente ocultas en el dashboard (quitar de aquí para reactivar)
  const ESTACIONES_OCULTAS = ["PREPARACIÓN"];

  // Distribución fija del taller (según plano físico)
  const COL_LEFT = ["PINTURA", "ENDEREZADA"];
  const COL_RIGHT = ["LAVADO", "ARMADO", "MECÁNICA"];

  function crearStripSection(est) {
    const section = document.createElement("div");
    section.className = "strip-section";
    section.style.borderLeft = `5px solid ${est.color}`;

    const count = est.vehiculos.length;
    const header = document.createElement("div");
    header.className = "strip-header";
    header.innerHTML = `<span class="strip-title">${est.estacion}</span><span class="kanban-count">${count}</span>`;
    section.appendChild(header);

    const cards = document.createElement("div");
    cards.className = "strip-cards";

    if (count === 0) {
      cards.innerHTML = `<span class="strip-empty">Vacío</span>`;
    } else {
      est.vehiculos.forEach(v => {
        const pill = document.createElement("div");
        pill.className = "strip-card";
        pill.innerHTML = `
          <span class="placa">${v.placa}</span>
          <span class="time">${formatTime(v.segundos_total)}</span>
        `;
        pill.onclick = () => abrirModalVehiculo(est, v);
        cards.appendChild(pill);
      });
    }

    section.appendChild(cards);
    return section;
  }

  function crearColumna(est) {
    const col = document.createElement("div");
    col.className = "kanban-column";
    col.style.borderTop = `5px solid ${est.color}`;
    col.style.background = est.color + "10";

    const count = est.vehiculos.length;
    col.innerHTML = `
      <div class="kanban-title">${est.estacion}<span class="kanban-count">${count}</span></div>
      ${count === 0
        ? "<p style='text-align:center;opacity:.5;margin-top:8px;font-size:12px;'>Vacío</p>"
        : ""}
    `;

    est.vehiculos.forEach(v => {
      const card = document.createElement("div");
      card.className = "vehicle-card";

      const puestoUI = formatPuestoUI(v.puesto);
      const puestoHtml = puestoUI
        ? `<span class="puesto-tag">${puestoUI}</span>`
        : "";

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="placa">${v.placa}</span>
          ${puestoHtml}
          <span class="time">${formatTime(v.segundos_total)}</span>
        </div>
      `;
      card.onclick = () => abrirModalVehiculo(est, v);
      col.appendChild(card);
    });

    return col;
  }

  function renderKanban(data) {
    const cont = document.getElementById("kanban-container");
    cont.innerHTML = "";

    const visibles = data.estaciones.filter(est =>
      !ESTACIONES_OCULTAS.includes(est.estacion.toUpperCase())
    );

    function findEst(name) {
      return visibles.find(e => e.estacion.toUpperCase() === name.toUpperCase());
    }

    // Grid principal: 3 columnas
    const grid = document.createElement("div");
    grid.className = "taller-grid";

    // Columna izquierda: PINTURA + ENDEREZADA
    const colLeft = document.createElement("div");
    colLeft.className = "col-left";
    COL_LEFT.forEach(name => {
      const est = findEst(name);
      if (est) colLeft.appendChild(crearColumna(est));
    });
    grid.appendChild(colLeft);

    // Columna central: PATIO (pills compactos)
    const colCenter = document.createElement("div");
    colCenter.className = "col-center";
    const patio = findEst("PATIO / ESPERA");
    if (patio) colCenter.appendChild(crearStripSection(patio));
    grid.appendChild(colCenter);

    // Columna derecha: LAVADO + ARMADO + MECÁNICA
    const colRight = document.createElement("div");
    colRight.className = "col-right";
    COL_RIGHT.forEach(name => {
      const est = findEst(name);
      if (est) colRight.appendChild(crearColumna(est));
    });
    grid.appendChild(colRight);

    cont.appendChild(grid);

    // Abajo: FUERA DEL TALLER (strip pills)
    const fuera = findEst("FUERA DEL TALLER");
    if (fuera) {
      cont.appendChild(crearStripSection(fuera));
    }

    document.getElementById("totalEnTaller").textContent =
      `Vehículos en taller: ${data.total_en_taller}`;

    if (data.ultima_actualizacion) {
      document.getElementById("ultimaActualizacion").textContent =
        `Sincronizado: ${new Date(data.ultima_actualizacion).toLocaleTimeString("es-EC")}`;
    }

    // Reaplicar filtro de búsqueda tras cada actualización del kanban
    filtrarKanban(terminoBusqueda);
  }

  function filtrarKanban(texto) {
    terminoBusqueda = texto.toUpperCase().trim();
    const cards = document.querySelectorAll(".vehicle-card, .strip-card");
    let encontrados = 0;

    cards.forEach(card => {
      const placa = card.querySelector(".placa")?.textContent?.toUpperCase() || "";
      if (!terminoBusqueda || placa.includes(terminoBusqueda)) {
        card.style.opacity = "1";
        card.style.outline = terminoBusqueda ? "2px solid #3b82f6" : "";
        card.style.boxShadow = terminoBusqueda ? "0 0 0 3px #bfdbfe" : "";
        encontrados++;
      } else {
        card.style.opacity = "0.15";
        card.style.outline = "";
        card.style.boxShadow = "";
      }
    });

    const btnLimpiar = document.getElementById("btn-limpiar-busqueda");
    const inputBuscar = document.getElementById("buscar-placa");
    if (btnLimpiar) btnLimpiar.style.display = terminoBusqueda ? "inline" : "none";
    if (inputBuscar) {
      inputBuscar.style.borderColor = terminoBusqueda
        ? (encontrados > 0 ? "#3b82f6" : "#ef4444")
        : "#cbd5e1";
    }
  }

  document.getElementById("buscar-placa").addEventListener("input", e => {
    filtrarKanban(e.target.value);
  });

  document.getElementById("btn-limpiar-busqueda").addEventListener("click", () => {
    const input = document.getElementById("buscar-placa");
    input.value = "";
    filtrarKanban("");
    input.focus();
  });

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

    const btnEditar = rolUsuario === 'admin'
      ? `<button onclick="editarPlaca('${veh.placa}')"
                style="background:none; border:1px solid #007bff; color:#007bff; cursor:pointer; font-size:0.8rem; padding: 4px 8px; border-radius: 4px; font-weight: bold;"
                title="Corregir Placa">
          EDITAR PLACA
        </button>`
      : "";

    modalPlaca.innerHTML = `
      <div style="display:flex; align-items:center; gap:15px;">
        <span>${veh.placa}</span>
        ${btnEditar}
      </div>
    `;

    // ✅ Mostrar puesto bonito en el modal
    const puestoUI = formatPuestoUI(veh.puesto);
    const infoEstacion = puestoUI ? `${est.estacion} (${puestoUI})` : est.estacion;
    modalEstacion.textContent = infoEstacion;

    modalTiempoEst.textContent = formatTime(veh.segundos_estacion);
    modalTiempoTotal.textContent = formatTime(veh.segundos_total);
    modalHistorial.innerHTML = '<li style="color:gray;">Cargando historial...</li>';

    modalVehiculo.style.display = "flex";

    try {
      const res = await apiFetch(`/lpr/historial/${veh.placa}`);
      if (!res || !res.ok) {
        modalHistorial.innerHTML = '<li style="color:red;">Error cargando historial</li>';
        return;
      }

      const data = await safeJson(res);
      modalHistorial.innerHTML = "";

      if (!data || !data.historial || data.historial.length === 0) {
        modalHistorial.innerHTML = "<li>Sin movimientos recientes</li>";
        return;
      }

      // Agrupar TODAS las visitas a la misma estación (sin importar el orden)
      // Acumular tiempo total por estación y guardar la visita más reciente
      const mapaEstaciones = new Map();
      for (const t of data.historial) {
        const key = t.estacion;
        const seg = Number(t.segundos_estacion || 0);
        if (mapaEstaciones.has(key)) {
          const e = mapaEstaciones.get(key);
          e.total_segundos += seg;
          e.ultima_inicio = t.inicio; // historial viene ordenado asc, el último es el más reciente
          e.puesto = t.puesto;
          if (!e.foto_url && t.foto_url) e.foto_url = t.foto_url;
        } else {
          mapaEstaciones.set(key, {
            estacion: t.estacion,
            total_segundos: seg,
            ultima_inicio: t.inicio,
            foto_url: t.foto_url,
            puesto: t.puesto
          });
        }
      }

      // Ordenar por última visita (más reciente primero) y mostrar las 5 estaciones únicas
      Array.from(mapaEstaciones.values())
        .sort((a, b) => new Date(b.ultima_inicio) - new Date(a.ultima_inicio))
        .slice(0, 5)
        .forEach(h => {
          const li = document.createElement("li");
          const fechaLocal = formatFecha(h.ultima_inicio);

          const puestoHistUI = formatPuestoUI(h.puesto);
          const txtPuesto = puestoHistUI ? ` [${puestoHistUI}]` : "";

          li.innerHTML = `<strong>${h.estacion}${txtPuesto}</strong> - ${fechaLocal} <br><small>(${formatTime(h.total_segundos)})</small>`;

          if (h.foto_url) {
            const btnCamara = document.createElement("button");
            btnCamara.innerHTML = "VER FOTO";
            btnCamara.style.marginLeft = "10px";
            btnCamara.style.cursor = "pointer";
            btnCamara.style.border = "1px solid #28a745";
            btnCamara.style.color = "#28a745";
            btnCamara.style.fontWeight = "bold";
            btnCamara.style.borderRadius = "4px";
            btnCamara.style.padding = "2px 8px";
            btnCamara.style.backgroundColor = "white";

            btnCamara.onclick = () => verFotoGrande(h.foto_url, h.estacion, fechaLocal);
            li.appendChild(btnCamara);
          }
          modalHistorial.appendChild(li);
        });

    } catch (err) {
      console.error("❌ Error historial", err);
      modalHistorial.innerHTML = '<li style="color:red;">Error de conexión</li>';
    }
  }

  document.getElementById("btn-historial-completo").onclick = () => {
    if (placaSeleccionada) abrirModalHistorialCompleto(placaSeleccionada);
  };

  /* ======================================================
      FUNCIONES AUXILIARES (FOTOS, EDICIÓN)
  ====================================================== */

  window.verFotoGrande = (url, estacion, fecha) => {
    Swal.fire({
      imageUrl: url,
      imageAlt: `Foto en ${estacion}`,
      title: `Ingreso a ${estacion}`,
      text: fecha,
      width: 800,
      padding: '1em',
      background: '#fff',
      backdrop: `rgba(0,0,0,0.8)`,
      zIndex: Z_INDEX_ALERTA
    });
  };

  window.editarPlaca = async (placaActual) => {
    const { value: nuevaPlaca } = await Swal.fire({
      title: 'Corregir Placa',
      input: 'text',
      inputValue: placaActual,
      text: 'Escribe la placa real:',
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      zIndex: Z_INDEX_ALERTA,
      inputValidator: (val) => {
        if (!val) return 'Debes escribir una placa';
      }
    });

    if (nuevaPlaca && nuevaPlaca.toUpperCase() !== placaActual) {
      const placaFinal = nuevaPlaca.toUpperCase().trim();
      try {
        const res = await apiFetch('/lpr/corregir', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ placaOriginal: placaActual, placaNueva: placaFinal })
        });

        if (res && res.ok) {
          const data = await safeJson(res);
          let titulo = 'Corregido';
          let texto = `La placa ahora es ${placaFinal}`;

          if (data && data.status === 'FUSION_EXITOSA') {
            titulo = '¡Fusionado!';
            texto = `Se han unido los datos de ${placaActual} con ${placaFinal}.`;
          }

          await Swal.fire({ title: titulo, text: texto, icon: 'success', zIndex: Z_INDEX_ALERTA });

          cerrarTodosLosModales();
          pausaLPR = false;
          cargarLPR();

        } else {
          Swal.fire({ title: 'Error', text: 'No se pudo corregir la placa', icon: 'error', zIndex: Z_INDEX_ALERTA });
        }
      } catch (err) {
        Swal.fire({ title: 'Error', text: 'Fallo de conexión', icon: 'error', zIndex: Z_INDEX_ALERTA });
      }
    }
  };

  /* ======================================================
      MODAL HISTORIAL COMPLETO (SOPORTE 5 COLUMNAS)
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
      const resSesiones = await apiFetch(`/lpr/sesiones/${placa}`);
      if (!resSesiones || !resSesiones.ok) return;

      const dataSesiones = await safeJson(resSesiones);
      tablaHistComp.innerHTML = "";

      if (!dataSesiones || !dataSesiones.sesiones || dataSesiones.sesiones.length === 0) {
        tablaHistComp.innerHTML = `<tr><td colspan="5">Sin historial</td></tr>`;
        modalHistComp.style.display = "flex";
        return;
      }

      for (const sesion of dataSesiones.sesiones) {

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
          <td colspan="5" style="padding: 12px 8px;">
            ${estadoBadge} | Entrada: ${entrada} | Salida: ${salida} | Tiempo: ${tiempoTotal}
          </td>
        `;
        tablaHistComp.appendChild(trSesion);

        const resTramos = await apiFetch(`/lpr/historial/${placa}?sesion_id=${sesion.sesion_id}`);
        if (resTramos && resTramos.ok) {
          const dataTramos = await safeJson(resTramos);

          if (dataTramos && dataTramos.historial && dataTramos.historial.length > 0) {
            dataTramos.historial.forEach(h => {
              const tr = document.createElement("tr");
              tr.style.backgroundColor = sesion.estado === 'ACTIVA' ? '#f1f8ff' : '#fafafa';

              const inicioLocal = formatFecha(h.inicio);
              const finLocal = h.fin ? formatFecha(h.fin) : "Actual";

              // Enlace a foto
              let fotoLink = h.foto_url
                ? ` <span style="cursor:pointer; color:#28a745;" onclick="verFotoGrande('${h.foto_url}', '${h.estacion}', '${inicioLocal}')">🖼️</span>`
                : '';

              // ✅ Puesto bonito en tabla completa
              const puestoUI = formatPuestoUI(h.puesto) || "-";

              tr.innerHTML = `
                <td style="text-align:left; padding-left:20px;">↳ ${h.estacion} ${fotoLink}</td>
                <td style="text-align:center;">${puestoUI}</td>
                <td>${inicioLocal}</td>
                <td>${finLocal}</td>
                <td>${formatTime(h.segundos_estacion)}</td>
              `;
              tablaHistComp.appendChild(tr);
            });
          }
        }

        const trSeparador = document.createElement("tr");
        trSeparador.innerHTML = `<td colspan="5" style="height: 5px; background: white;"></td>`;
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

    if (!data || !data.data || !data.data.length) {
      tablaSalidas.innerHTML = `<tr><td colspan="4">Sin resultados</td></tr>`;
      pageInfo.textContent = "";
      return;
    }

    data.data.forEach(v => {
      const tr = document.createElement("tr");
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

    pageInfo.textContent = `Página ${data.page} de ${Math.ceil(data.total / data.limit)}`;
  }

  /* ======================================================
      🚀 GESTIÓN DE VEHÍCULOS INTERNOS (SOLO ADMIN)
  ====================================================== */
  configurarPermisos();

  async function configurarPermisos() {
    try {
      const res = await apiFetch('/auth/me');
      if (res && res.ok) {
        const data = await safeJson(res);
        rolUsuario = data?.rol || '';

        if (rolUsuario === 'admin') {
          const btn = document.getElementById('btn-gestionar-internos');
          if (btn) {
            btn.style.display = 'inline-block';
            btn.onclick = abrirModalInternos;
          }
        }

        if (rolUsuario === 'seguro') {
          // Ocultar botones de acción
          const btnInternos = document.getElementById('btn-gestionar-internos');
          const btnSalidas = document.getElementById('btn-ver-salidas');
          if (btnInternos) btnInternos.style.display = 'none';
          if (btnSalidas) btnSalidas.style.display = 'none';
        }
      }
    } catch (err) {
      console.error("Error verificando rol", err);
    }
  }

  const modalInternos = document.getElementById('modal-internos');
  const tablaInternos = document.getElementById('tabla-internos-body');
  const inputPlacaInt = document.getElementById('input-placa-interna');
  const inputDescInt = document.getElementById('input-desc-interna');

  if (document.getElementById('close-internos')) {
    document.getElementById('close-internos').onclick = () => {
      modalInternos.style.display = 'none';
      pausaLPR = false;
    };
  }

  async function abrirModalInternos() {
    cerrarTodosLosModales();
    pausaLPR = true;
    modalInternos.style.display = 'flex';
    cargarInternos();
  }

  async function cargarInternos() {
    try {
      const res = await apiFetch('/lpr/internos');
      if (res && res.ok) {
        const lista = await safeJson(res);
        renderInternos(lista);
      }
    } catch (err) { console.error(err); }
  }

  function renderInternos(lista) {
    tablaInternos.innerHTML = '';
    if (!lista || lista.length === 0) {
      tablaInternos.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:10px;">No hay vehículos excluidos</td></tr>';
      return;
    }

    lista.forEach(v => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #ddd';
      tr.innerHTML = `
        <td style="font-weight:bold; padding:8px;">${v.placa}</td>
        <td style="padding:8px;">${v.descripcion || '-'}</td>
        <td style="text-align:center; padding:8px;">
            <button class="btn-eliminar-interno" data-placa="${v.placa}" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Eliminar</button>
        </td>
      `;
      tablaInternos.appendChild(tr);
    });

    document.querySelectorAll('.btn-eliminar-interno').forEach(btn => {
      btn.onclick = () => eliminarInterno(btn.dataset.placa);
    });
  }

  const btnAddInterno = document.getElementById('btn-agregar-interno');
  if (btnAddInterno) {
    btnAddInterno.onclick = async () => {
      const placa = inputPlacaInt.value.trim().toUpperCase();
      const descripcion = inputDescInt.value.trim();
      if (!placa) return Swal.fire({ title: 'Error', text: 'Escribe una placa', icon: 'warning', zIndex: Z_INDEX_ALERTA });

      try {
        const res = await apiFetch('/lpr/internos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ placa, descripcion })
        });

        if (res && res.ok) {
          inputPlacaInt.value = '';
          inputDescInt.value = '';
          modalInternos.style.display = 'none';
          pausaLPR = false;
          Swal.fire({ icon: 'success', title: '¡Vehículo Excluido!', text: `La placa ${placa} ha sido agregada.`, zIndex: Z_INDEX_ALERTA });
          cargarInternos();
        } else {
          const errData = await safeJson(res);
          Swal.fire({ title: 'Error', text: (errData && errData.error) || 'No se pudo guardar', icon: 'error', zIndex: Z_INDEX_ALERTA });
        }
      } catch (err) { console.error(err); }
    };
  }

  async function eliminarInterno(placa) {
    const confirm = await Swal.fire({
      title: `¿Eliminar ${placa}?`,
      text: "Este vehículo volverá a ser registrado por las cámaras.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      zIndex: Z_INDEX_ALERTA
    });

    if (confirm.isConfirmed) {
      try {
        const res = await apiFetch(`/lpr/internos/${placa}`, { method: 'DELETE' });
        if (res && res.ok) {
          cargarInternos();
          Swal.fire({ icon: 'success', title: 'Eliminado', timer: 1500, showConfirmButton: false, zIndex: Z_INDEX_ALERTA });
        }
      } catch (err) {
        Swal.fire({ title: 'Error', text: 'No se pudo eliminar', icon: 'error', zIndex: Z_INDEX_ALERTA });
      }
    }
  }

});