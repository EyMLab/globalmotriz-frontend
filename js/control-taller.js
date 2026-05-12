// =====================================================
// control-taller.js — Módulo Control Taller (OT)
// =====================================================

const CT = (() => {

  // ── Estado interno ────────────────────────────────
  let paginaActual = 1;
  const LIMITE     = 100;
  let totalPaginas = 1;
  let filtrosActivos = {};

  // ── Helpers ───────────────────────────────────────
  function fmt(val) {
    if (val == null || val === "") return "—";
    return val;
  }
  function fmtFecha(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  function fmtMes(yyyymm) {
    if (!yyyymm) return "—";
    const [y, m] = yyyymm.split("-");
    const meses = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    return `${meses[parseInt(m)]} ${y}`;
  }
  function fmtMoney(val) {
    const n = parseFloat(val) || 0;
    return "$" + n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function claseEstado(estado) {
    switch ((estado || "").toUpperCase()) {
      case "ABIERTO":   return "tr-abierto";
      case "TERMINADO": return "tr-terminado";
      case "FACTURADO": return "tr-facturado";
      case "ANULADO":   return "tr-anulado";
      default:          return "";
    }
  }
  function claseProceso(proceso) {
    switch ((proceso || "").toUpperCase()) {
      case "ANULAR":    return "tr-anular";
      case "S.V.C.":   return "tr-svc";
      case "DEDUCIBLE": return "tr-deducible";
      default:          return "";
    }
  }

  // ── Tarjetas de estado rápido ─────────────────────
  function renderCards(porEstado, total) {
    const mapa = {};
    porEstado.forEach(r => { mapa[r.estado?.toUpperCase()] = parseInt(r.cantidad); });

    const items = [
      { lbl: "ABIERTO",   cls: "ec-abierto",   key: "ABIERTO"   },
      { lbl: "TERMINADO", cls: "ec-terminado",  key: "TERMINADO" },
      { lbl: "FACTURADO", cls: "ec-facturado",  key: "FACTURADO" },
      { lbl: "ANULADO",   cls: "ec-anulado",    key: "ANULADO"   },
      { lbl: "TOTAL",     cls: "ec-total",      key: "_total"    },
    ];
    document.getElementById("cards-estado").innerHTML = items.map(it => `
      <div class="estado-card ${it.cls}">
        <div class="ec-num">${it.key === "_total" ? total : (mapa[it.key] || 0)}</div>
        <div class="ec-lbl">${it.lbl}</div>
      </div>`).join("");
  }

  // ── Cargar filtros dinámicos ──────────────────────
  async function cargarFiltros(localidad = "") {
    const qs = localidad ? `?localidad=${localidad}` : "";
    const res = await apiFetch(`/taller/filtros${qs}`);
    if (!res || !res.ok) return;
    const data = await safeJson(res);

    const selEstado  = document.getElementById("f-estado");
    const selAseg    = document.getElementById("f-aseguradora");
    const selProceso = document.getElementById("f-proceso");

    const prev = {
      estado:   selEstado.value,
      aseg:     selAseg.value,
      proceso:  selProceso.value,
    };

    selEstado.innerHTML  = `<option value="">Todos los estados</option>`  + (data.estados  || []).map(e => `<option value="${e}">${e}</option>`).join("");
    selAseg.innerHTML    = `<option value="">Todas las aseguradoras</option>` + (data.aseguradoras || []).filter(a => a).map(a => `<option value="${a}">${a}</option>`).join("");
    selProceso.innerHTML = `<option value="">Todos los procesos</option>` + (data.procesos || []).filter(p => p).map(p => `<option value="${p}">${p}</option>`).join("");

    if (prev.estado)  selEstado.value  = prev.estado;
    if (prev.aseg)    selAseg.value    = prev.aseg;
    if (prev.proceso) selProceso.value = prev.proceso;
  }

  // ── Cargar órdenes ────────────────────────────────
  async function cargarOrdenes(page = 1) {
    const tbody = document.getElementById("tbody-ordenes");
    tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:30px;color:#888;">Cargando...</td></tr>`;

    const params = new URLSearchParams({
      page,
      limit: LIMITE,
      ...filtrosActivos,
    });

    const res = await apiFetch(`/taller/ordenes?${params}`);
    if (!res || !res.ok) {
      tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;color:red;">Error cargando órdenes</td></tr>`;
      return;
    }
    const data = await safeJson(res);
    paginaActual = data.pagina;
    totalPaginas = data.totalPaginas;

    // Actualizar cards rápidas con el resumen base actual
    cargarResumenCards();

    // Render tabla
    if (!data.ordenes.length) {
      tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:30px;color:#888;">Sin resultados</td></tr>`;
    } else {
      tbody.innerHTML = data.ordenes.map(o => {
        const ce = claseEstado(o.estado);
        const cp = claseProceso(o.proceso_ot);
        return `<tr class="${ce} ${cp}" data-orden="${o.numero_orden}" data-localidad="${o.localidad}">
          <td><strong>${o.numero_orden}</strong></td>
          <td>${o.localidad}</td>
          <td>${o.estado || "—"}</td>
          <td>${o.proceso_ot || "—"}</td>
          <td>${fmtFecha(o.fecha_ingreso)}</td>
          <td>${fmtFecha(o.fecha_salida)}</td>
          <td class="fecha-salida-env">${fmtFecha(o.fecha_salida_enviada)}</td>
          <td>${o.placa || "—"}</td>
          <td>${o.cliente || "—"}</td>
          <td>${o.aseguradora || "—"}</td>
          <td>${o.usuario_registro || "—"}</td>
          <td class="num-right">${fmtMoney(o.valor_total)}</td>
          <td class="obs-cell">${o.observacion || ""}</td>
          <td><button class="btn-editar" onclick="CT.editarOrden('${o.numero_orden}','${o.localidad}')">✏</button></td>
        </tr>`;
      }).join("");
    }

    // Paginación
    document.getElementById("pag-info").textContent =
      `Página ${paginaActual} de ${totalPaginas} (${data.total} órdenes)`;
    document.getElementById("btn-prev").disabled = paginaActual <= 1;
    document.getElementById("btn-next").disabled = paginaActual >= totalPaginas;
  }

  // ── Cards rápidas desde resumen ───────────────────
  async function cargarResumenCards() {
    const loc = filtrosActivos.localidad || "";
    const qs  = loc ? `?localidad=${loc}` : "";
    const res = await apiFetch(`/taller/resumen${qs}`);
    if (!res || !res.ok) return;
    const data = await safeJson(res);
    renderCards(data.por_estado, data.total);
  }

  // ── Importar reporte ──────────────────────────────
  async function importar() {
    const localidad = document.getElementById("sel-localidad").value;
    const file      = document.getElementById("inp-reporte").files[0];
    if (!file) { Swal.fire("Atención", "Selecciona el archivo Excel del reporte.", "warning"); return; }

    const btn = document.getElementById("btn-importar");
    btn.disabled = true;
    btn.textContent = "Importando...";

    const fd = new FormData();
    fd.append("localidad", localidad);
    fd.append("reporte", file);

    const res = await apiFetch("/taller/importar", { method: "POST", body: fd });
    btn.disabled = false;
    btn.textContent = "⬆ Importar";

    if (!res || !res.ok) {
      const err = await safeJson(res);
      Swal.fire("Error", err?.error || "No se pudo importar el reporte.", "error");
      return;
    }
    const data = await safeJson(res);
    document.getElementById("import-info").textContent =
      `Última importación: ${new Date().toLocaleString("es-EC")} · ${data.nuevas} nuevas · ${data.actualizadas} actualizadas`;

    // Refrescar filtros y tabla
    await cargarFiltros(localidad);
    filtrosActivos = { localidad };
    document.getElementById("f-localidad").value = localidad;
    await cargarOrdenes(1);

    Swal.fire({
      icon: "success",
      title: "Importación completada",
      html: `<b>${data.nuevas}</b> órdenes nuevas<br><b>${data.actualizadas}</b> actualizadas`,
      timer: 3000, showConfirmButton: false,
    });
  }

  // ── Editar campos manuales ────────────────────────
  async function editarOrden(numeroOrden, localidad) {
    const tr  = document.querySelector(`tr[data-orden="${numeroOrden}"][data-localidad="${localidad}"]`);
    const obs = tr?.querySelector(".obs-cell")?.textContent || "";
    const fseCell = tr?.querySelector(".fecha-salida-env")?.textContent || "";
    // convertir DD/MM/YYYY → YYYY-MM-DD para el input date
    let fseIso = "";
    const m = fseCell.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) fseIso = `${m[3]}-${m[2]}-${m[1]}`;

    const { value: vals } = await Swal.fire({
      title: `Editar OT ${numeroOrden}`,
      html: `
        <label style="display:block;text-align:left;margin-bottom:6px;font-weight:600;">Observación:</label>
        <textarea id="swal-obs" class="swal2-textarea" style="height:80px;">${obs}</textarea>
        <label style="display:block;text-align:left;margin:10px 0 6px;font-weight:600;">Fecha salida enviada:</label>
        <input id="swal-fse" type="date" class="swal2-input" value="${fseIso}">
      `,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText:  "Cancelar",
      preConfirm: () => ({
        observacion:          document.getElementById("swal-obs").value.trim(),
        fecha_salida_enviada: document.getElementById("swal-fse").value || null,
      }),
    });

    if (!vals) return;

    const res = await apiFetch(`/taller/ordenes/${encodeURIComponent(numeroOrden)}`, {
      method: "PATCH",
      body: JSON.stringify({ localidad, ...vals }),
    });

    if (!res || !res.ok) {
      const err = await safeJson(res);
      Swal.fire("Error", err?.error || "No se pudo guardar.", "error");
      return;
    }

    // Actualizar celda en la tabla sin recargar
    if (tr) {
      tr.querySelector(".obs-cell").textContent = vals.observacion;
      tr.querySelector(".fecha-salida-env").textContent = fmtFecha(vals.fecha_salida_enviada);
    }
  }

  // ── Cargar tab Resumen ────────────────────────────
  async function cargarResumen() {
    const localidad = document.getElementById("res-localidad").value;
    const qs = localidad ? `?localidad=${localidad}` : "";
    const res = await apiFetch(`/taller/resumen${qs}`);
    if (!res || !res.ok) { Swal.fire("Error", "No se pudo cargar el resumen.", "error"); return; }
    const d = await safeJson(res);

    // Financiero
    const fin = d.totales_financieros || {};
    document.getElementById("fin-grid").innerHTML = [
      { lbl: "Valor Total",     val: fin.valor_total              },
      { lbl: "Sub Total",       val: fin.sub_total                },
      { lbl: "Total Servicios", val: fin.total_servicios          },
      { lbl: "Serv. Terceros",  val: fin.total_servicios_terce    },
      { lbl: "Total Repuestos", val: fin.total_repuestos          },
    ].map(it => `
      <div class="fin-item">
        <div class="fin-num">${fmtMoney(it.val)}</div>
        <div class="fin-lbl">${it.lbl}</div>
      </div>`).join("");

    // Por estado
    document.getElementById("res-estado").innerHTML = (d.por_estado || []).map(r =>
      `<tr><td>${r.estado || "—"}</td><td class="num-right">${r.cantidad}</td><td class="num-right">${r.pct}%</td></tr>`
    ).join("") || `<tr><td colspan="3">Sin datos</td></tr>`;

    // Por proceso
    document.getElementById("res-proceso").innerHTML = (d.por_proceso || []).map(r =>
      `<tr><td>${r.proceso_ot || "—"}</td><td class="num-right">${r.cantidad}</td></tr>`
    ).join("") || `<tr><td colspan="2">Sin datos</td></tr>`;

    // Por aseguradora
    document.getElementById("res-aseg").innerHTML = (d.por_aseguradora || []).map(r =>
      `<tr><td>${r.aseguradora}</td>
           <td class="num-right">${r.abierto || 0}</td>
           <td class="num-right">${r.terminado || 0}</td>
           <td class="num-right">${r.facturado || 0}</td>
           <td class="num-right">${r.anulado || 0}</td>
           <td class="num-right"><strong>${r.total}</strong></td></tr>`
    ).join("") || `<tr><td colspan="6">Sin datos</td></tr>`;

    // Por usuario
    document.getElementById("res-usuario").innerHTML = (d.por_usuario || []).map(r =>
      `<tr><td>${r.usuario}</td>
           <td class="num-right">${r.abierto || 0}</td>
           <td class="num-right">${r.terminado || 0}</td>
           <td class="num-right">${r.facturado || 0}</td>
           <td class="num-right">${r.anulado || 0}</td>
           <td class="num-right"><strong>${r.total}</strong></td></tr>`
    ).join("") || `<tr><td colspan="6">Sin datos</td></tr>`;

    // Por mes
    document.getElementById("res-mes").innerHTML = (d.por_mes || []).map(r =>
      `<tr><td>${fmtMes(r.mes)}</td>
           <td class="num-right">${r.abierto || 0}</td>
           <td class="num-right">${r.terminado || 0}</td>
           <td class="num-right">${r.facturado || 0}</td>
           <td class="num-right">${r.anulado || 0}</td>
           <td class="num-right"><strong>${r.total}</strong></td></tr>`
    ).join("") || `<tr><td colspan="6">Sin datos</td></tr>`;
  }

  // ── Init ──────────────────────────────────────────
  function init() {
    // Tabs
    document.querySelectorAll(".taller-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".taller-tab").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".taller-tab-panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
        if (btn.dataset.tab === "resumen") cargarResumen();
      });
    });

    // Importar
    document.getElementById("btn-importar").addEventListener("click", importar);

    // Filtros
    document.getElementById("btn-filtrar").addEventListener("click", () => {
      filtrosActivos = {
        localidad:   document.getElementById("f-localidad").value,
        estado:      document.getElementById("f-estado").value,
        aseguradora: document.getElementById("f-aseguradora").value,
        proceso_ot:  document.getElementById("f-proceso").value,
        placa:       document.getElementById("f-placa").value.trim(),
        cliente:     document.getElementById("f-cliente").value.trim(),
        fecha_desde: document.getElementById("f-desde").value,
        fecha_hasta: document.getElementById("f-hasta").value,
      };
      // Quitar parámetros vacíos
      Object.keys(filtrosActivos).forEach(k => { if (!filtrosActivos[k]) delete filtrosActivos[k]; });
      cargarOrdenes(1);
    });

    document.getElementById("btn-limpiar").addEventListener("click", () => {
      filtrosActivos = {};
      ["f-localidad","f-estado","f-aseguradora","f-proceso"].forEach(id => {
        document.getElementById(id).value = "";
      });
      ["f-placa","f-cliente","f-desde","f-hasta"].forEach(id => {
        document.getElementById(id).value = "";
      });
      cargarOrdenes(1);
    });

    // Localidad filtro → actualizar selectores dinámicos
    document.getElementById("f-localidad").addEventListener("change", e => {
      cargarFiltros(e.target.value);
    });

    // Paginación
    document.getElementById("btn-prev").addEventListener("click", () => {
      if (paginaActual > 1) cargarOrdenes(paginaActual - 1);
    });
    document.getElementById("btn-next").addEventListener("click", () => {
      if (paginaActual < totalPaginas) cargarOrdenes(paginaActual + 1);
    });

    // Resumen
    document.getElementById("btn-cargar-resumen").addEventListener("click", cargarResumen);

    // Carga inicial
    cargarFiltros();
    cargarOrdenes(1);
  }

  document.addEventListener("DOMContentLoaded", init);

  return { editarOrden };
})();
