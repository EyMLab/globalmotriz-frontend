// =====================================================
// control-taller.js — Módulo Control Taller (OT)
// =====================================================

// ── Paleta de colores global ──────────────────────
const CHART_COLORS = {
  ABIERTO:   { bg: "rgba(254,162,162,.85)",  border: "#ef4444" },
  TERMINADO: { bg: "rgba(253,230,138,.85)",  border: "#f59e0b" },
  FACTURADO: { bg: "rgba(134,239,172,.85)",  border: "#22c55e" },
  ANULADO:   { bg: "rgba(196,181,253,.85)",  border: "#8b5cf6" },
};
const PALETTE = [
  "#2B7A9E","#4DB8D8","#5BC0BE","#1E5570","#06b6d4",
  "#0891b2","#0284c7","#0369a1","#1d4ed8","#4f46e5",
  "#7c3aed","#9333ea","#c026d3","#db2777","#e11d48",
  "#dc2626","#ea580c","#d97706","#65a30d","#16a34a",
];

// ── Módulo Dashboard ──────────────────────────────
const DASH = (() => {
  const charts = {};   // instancias Chart.js guardadas por id

  function fmtMes(yyyymm) {
    if (!yyyymm) return "—";
    const [y, m] = yyyymm.split("-");
    const meses = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    return `${meses[parseInt(m)]} ${y.slice(2)}`;
  }
  function fmtMoney(val) {
    const n = parseFloat(val) || 0;
    return "$" + n.toLocaleString("es-EC", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function destroyChart(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  }

  // ── Tarjetas financieras ─────────────────────────
  function renderFinCards(fin) {
    const items = [
      { lbl: "Valor Total",     val: fin.valor_total,             color: "#2B7A9E" },
      { lbl: "Sub Total",       val: fin.sub_total,               color: "#1E5570" },
      { lbl: "Total Servicios", val: fin.total_servicios,         color: "#5BC0BE" },
      { lbl: "Serv. Terceros",  val: fin.total_servicios_terce,   color: "#4DB8D8" },
      { lbl: "Total Repuestos", val: fin.total_repuestos,         color: "#06b6d4" },
    ];
    document.getElementById("dash-fin-grid").innerHTML = items.map(it => `
      <div class="dash-fin-card" style="border-top-color:${it.color}">
        <div class="dfn" style="color:${it.color}">${fmtMoney(it.val)}</div>
        <div class="dfl">${it.lbl}</div>
      </div>`).join("");
  }

  // ── Donut: por estado ────────────────────────────
  function renderEstado(porEstado) {
    destroyChart("chart-estado");
    const ctx = document.getElementById("chart-estado").getContext("2d");
    const labels = porEstado.map(r => r.estado);
    const data   = porEstado.map(r => r.cantidad);
    const bgs    = labels.map(l => CHART_COLORS[l]?.bg   || "rgba(150,150,150,.6)");
    const bords  = labels.map(l => CHART_COLORS[l]?.border || "#999");
    charts["chart-estado"] = new Chart(ctx, {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: bgs, borderColor: bords, borderWidth: 2 }] },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 12 }, padding: 12 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} (${porEstado[ctx.dataIndex]?.pct}%)` } },
        },
      },
    });
  }

  // ── Barras horizontales genéricas ────────────────
  function renderHBar({ id, labels, datasets, unit = "" }) {
    destroyChart(id);
    const ctx = document.getElementById(id)?.getContext("2d");
    if (!ctx) return;
    charts[id] = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets },
      options: {
        indexAxis: "y",
        responsive: true,
        plugins: {
          legend: { display: datasets.length > 1, position: "bottom", labels: { font: { size: 11 }, padding: 10 } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const v = ctx.raw;
                return unit === "$"
                  ? ` ${ctx.dataset.label || ""}: $${Number(v).toLocaleString("es-EC",{minimumFractionDigits:2,maximumFractionDigits:2})}`
                  : ` ${ctx.dataset.label || ""}: ${v}`;
              }
            }
          },
        },
        scales: {
          x: { beginAtZero: true, ticks: { font: { size: 11 } } },
          y: { ticks: { font: { size: 11 }, autoSkip: false } },
        },
      },
    });
  }

  // ── Barras verticales genéricas ──────────────────
  function renderVBar({ id, labels, datasets, unit = "", stacked = false }) {
    destroyChart(id);
    const ctx = document.getElementById(id)?.getContext("2d");
    if (!ctx) return;
    charts[id] = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets },
      options: {
        responsive: true,
        plugins: {
          legend: { display: datasets.length > 1, position: "bottom", labels: { font: { size: 11 }, padding: 10 } },
          tooltip: {
            callbacks: {
              label: ctx => unit === "$"
                ? ` ${ctx.dataset.label}: $${Number(ctx.raw).toLocaleString("es-EC",{minimumFractionDigits:0,maximumFractionDigits:0})}`
                : ` ${ctx.dataset.label}: ${ctx.raw}`,
            }
          },
        },
        scales: {
          x: { stacked, ticks: { font: { size: 10 }, maxRotation: 45 } },
          y: { stacked, beginAtZero: true, ticks: { font: { size: 11 } } },
        },
      },
    });
  }

  // ── Línea ─────────────────────────────────────────
  function renderLine({ id, labels, datasets }) {
    destroyChart(id);
    const ctx = document.getElementById(id)?.getContext("2d");
    if (!ctx) return;
    charts[id] = new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        plugins: { legend: { display: true, position: "bottom", labels: { font: { size: 11 }, padding: 10 } } },
        scales: {
          x: { ticks: { font: { size: 10 }, maxRotation: 45 } },
          y: { beginAtZero: true, ticks: { font: { size: 11 } } },
        },
      },
    });
  }

  // ── Renderizar todo con datos del resumen ─────────
  function render(d) {
    // Financiero
    renderFinCards(d.totales_financieros || {});

    // Estado donut
    renderEstado(d.por_estado || []);

    // Aseguradoras — cantidad (stacked por estado, top 15)
    const asegTop = (d.por_aseguradora || []).slice(0, 15);
    const asegLabels = asegTop.map(r => r.aseguradora.length > 25
      ? r.aseguradora.slice(0, 25) + "…" : r.aseguradora);
    renderHBar({
      id: "chart-aseg-count",
      labels: asegLabels,
      datasets: [
        { label: "ABIERTO",   data: asegTop.map(r => +r.abierto   || 0), backgroundColor: CHART_COLORS.ABIERTO.bg,   borderColor: CHART_COLORS.ABIERTO.border,   borderWidth: 1 },
        { label: "TERMINADO", data: asegTop.map(r => +r.terminado || 0), backgroundColor: CHART_COLORS.TERMINADO.bg, borderColor: CHART_COLORS.TERMINADO.border, borderWidth: 1 },
        { label: "FACTURADO", data: asegTop.map(r => +r.facturado || 0), backgroundColor: CHART_COLORS.FACTURADO.bg, borderColor: CHART_COLORS.FACTURADO.border, borderWidth: 1 },
        { label: "ANULADO",   data: asegTop.map(r => +r.anulado   || 0), backgroundColor: CHART_COLORS.ANULADO.bg,   borderColor: CHART_COLORS.ANULADO.border,   borderWidth: 1 },
      ],
    });

    // Aseguradoras — valor total
    renderHBar({
      id: "chart-aseg-valor",
      labels: asegLabels,
      datasets: [{ label: "Valor Total", data: asegTop.map(r => parseFloat(r.valor_total) || 0),
        backgroundColor: PALETTE.map(c => c + "CC"), borderColor: PALETTE, borderWidth: 1 }],
      unit: "$",
    });

    // Por usuario (top 12)
    const usrTop = (d.por_usuario || []).slice(0, 12);
    const usrLabels = usrTop.map(r => {
      const partes = (r.usuario || "").split(" ");
      return partes.length >= 2 ? `${partes[0]} ${partes[1]}` : r.usuario;
    });
    renderHBar({
      id: "chart-usuario",
      labels: usrLabels,
      datasets: [
        { label: "ABIERTO",   data: usrTop.map(r => +r.abierto   || 0), backgroundColor: CHART_COLORS.ABIERTO.bg,   borderColor: CHART_COLORS.ABIERTO.border,   borderWidth: 1 },
        { label: "TERMINADO", data: usrTop.map(r => +r.terminado || 0), backgroundColor: CHART_COLORS.TERMINADO.bg, borderColor: CHART_COLORS.TERMINADO.border, borderWidth: 1 },
        { label: "FACTURADO", data: usrTop.map(r => +r.facturado || 0), backgroundColor: CHART_COLORS.FACTURADO.bg, borderColor: CHART_COLORS.FACTURADO.border, borderWidth: 1 },
      ],
    });

    // Por mes (stacked, últimos 18, invertir para cronológico)
    const meses = [...(d.por_mes || [])].reverse().slice(-18);
    const mesLabels = meses.map(r => fmtMes(r.mes));
    renderVBar({
      id: "chart-mes",
      labels: mesLabels,
      stacked: true,
      datasets: [
        { label: "ABIERTO",   data: meses.map(r => +r.abierto   || 0), backgroundColor: CHART_COLORS.ABIERTO.bg,   borderColor: CHART_COLORS.ABIERTO.border,   borderWidth: 1 },
        { label: "TERMINADO", data: meses.map(r => +r.terminado || 0), backgroundColor: CHART_COLORS.TERMINADO.bg, borderColor: CHART_COLORS.TERMINADO.border, borderWidth: 1 },
        { label: "FACTURADO", data: meses.map(r => +r.facturado || 0), backgroundColor: CHART_COLORS.FACTURADO.bg, borderColor: CHART_COLORS.FACTURADO.border, borderWidth: 1 },
        { label: "ANULADO",   data: meses.map(r => +r.anulado   || 0), backgroundColor: CHART_COLORS.ANULADO.bg,   borderColor: CHART_COLORS.ANULADO.border,   borderWidth: 1 },
      ],
    });

    // Valor mensual (línea)
    renderLine({
      id: "chart-mes-valor",
      labels: mesLabels,
      datasets: [{
        label: "Valor Total",
        data: meses.map(r => parseFloat(r.valor_total) || 0),
        borderColor: "#2B7A9E", backgroundColor: "rgba(43,122,158,.15)",
        fill: true, tension: .35, pointRadius: 3,
      }],
    });

    // Por proceso OT
    const procTop = (d.por_proceso || []).slice(0, 12);
    renderHBar({
      id: "chart-proceso",
      labels: procTop.map(r => r.proceso_ot),
      datasets: [{ label: "Órdenes", data: procTop.map(r => +r.cantidad || 0),
        backgroundColor: PALETTE.map(c => c + "CC"), borderColor: PALETTE, borderWidth: 1 }],
    });
  }

  // ── Cargar datos ─────────────────────────────────
  async function cargar() {
    const params = new URLSearchParams();
    const vals = {
      localidad:   document.getElementById("d-localidad")?.value,
      estado:      document.getElementById("d-estado")?.value,
      aseguradora: document.getElementById("d-aseguradora")?.value,
      proceso_ot:  document.getElementById("d-proceso")?.value,
      fecha_desde: document.getElementById("d-desde")?.value,
      fecha_hasta: document.getElementById("d-hasta")?.value,
    };
    Object.entries(vals).forEach(([k, v]) => { if (v) params.set(k, v); });

    // Mostrar loading en las tarjetas
    document.getElementById("dash-fin-grid").innerHTML =
      `<div style="padding:20px;color:var(--text-light);font-size:13px;">Cargando...</div>`;

    const res = await apiFetch(`/taller/resumen?${params}`);
    if (!res || !res.ok) { return; }
    const d = await safeJson(res);
    render(d);
  }

  // ── Poblar selects del dashboard con los mismos datos de filtros ──
  function sincFiltros(filtrosData) {
    if (!filtrosData) return;
    const selE = document.getElementById("d-estado");
    const selA = document.getElementById("d-aseguradora");
    const selP = document.getElementById("d-proceso");
    if (!selE) return;
    const prevE = selE.value, prevA = selA.value, prevP = selP.value;
    selE.innerHTML = `<option value="">Todos</option>` + (filtrosData.estados || []).map(e => `<option value="${e}">${e}</option>`).join("");
    selA.innerHTML = `<option value="">Todas</option>` + (filtrosData.aseguradoras || []).filter(Boolean).map(a => `<option value="${a}">${a}</option>`).join("");
    selP.innerHTML = `<option value="">Todos</option>` + (filtrosData.procesos || []).filter(Boolean).map(p => `<option value="${p}">${p}</option>`).join("");
    if (prevE) selE.value = prevE;
    if (prevA) selA.value = prevA;
    if (prevP) selP.value = prevP;
  }

  function init() {
    document.getElementById("btn-dash-aplicar")?.addEventListener("click", cargar);
    document.getElementById("btn-dash-limpiar")?.addEventListener("click", () => {
      ["d-localidad","d-estado","d-aseguradora","d-proceso","d-desde","d-hasta"]
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
      cargar();
    });
    // Auto-aplicar al cambiar cualquier select
    ["d-localidad","d-estado","d-aseguradora","d-proceso"].forEach(id => {
      document.getElementById(id)?.addEventListener("change", cargar);
    });
  }

  return { cargar, sincFiltros, init };
})();

const CT = (() => {

  // ── Estado interno ────────────────────────────────
  let paginaActual  = 1;
  const LIMITE      = 100;
  let totalPaginas  = 1;
  let filtrosActivos = {};   // filtros de la barra
  let cardActiva    = null;  // card seleccionada: "ABIERTO", "SVC", etc.

  // ── Helpers ───────────────────────────────────────
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

  // ── Cargar conteos de tarjetas ────────────────────
  async function cargarCards(localidad = "") {
    const qs  = localidad ? `?localidad=${encodeURIComponent(localidad)}` : "";
    const res = await apiFetch(`/taller/cards${qs}`);
    if (!res || !res.ok) return;
    const d = await safeJson(res);

    document.getElementById("c-abierto").textContent   = d.abierto    ?? 0;
    document.getElementById("c-terminado").textContent = d.terminado  ?? 0;
    document.getElementById("c-facturado").textContent = d.facturado  ?? 0;
    document.getElementById("c-anulado").textContent   = d.anulado    ?? 0;
    document.getElementById("c-svc").textContent       = d.svc        ?? 0;
    document.getElementById("c-poranular").textContent = d.por_anular ?? 0;
    document.getElementById("c-total").textContent     = d.total      ?? 0;
  }

  // ── Activar / desactivar tarjeta ──────────────────
  function activarCard(card) {
    const contenedor = document.getElementById("cards-estado");
    const todas = contenedor.querySelectorAll(".estado-card");

    if (cardActiva === card) {
      // Deseleccionar: quitar filtro de card
      cardActiva = null;
      todas.forEach(b => b.classList.remove("card-activa"));
      contenedor.classList.remove("cards-con-activa");
    } else {
      cardActiva = card;
      todas.forEach(b => b.classList.remove("card-activa"));
      const btn = contenedor.querySelector(`[data-card="${card}"]`);
      if (btn) btn.classList.add("card-activa");
      contenedor.classList.add("cards-con-activa");
    }

    // Si hay una card activa, limpiar los filtros manuales de estado/proceso
    if (cardActiva) {
      document.getElementById("f-estado").value  = "";
      document.getElementById("f-proceso").value = "";
    }

    cargarOrdenes(1);
  }

  // ── Construir params de query para /taller/ordenes ─
  function buildParams(page) {
    const p = { page, limit: LIMITE };

    // Filtro de card
    if (cardActiva && cardActiva !== "TOTAL") p.card = cardActiva;

    // Filtros manuales (solo los que no se solapan con la card)
    const f = filtrosActivos;
    if (f.localidad)   p.localidad   = f.localidad;
    if (f.aseguradora) p.aseguradora = f.aseguradora;
    if (f.placa)       p.placa       = f.placa;
    if (f.cliente)     p.cliente     = f.cliente;
    if (f.fecha_desde) p.fecha_desde = f.fecha_desde;
    if (f.fecha_hasta) p.fecha_hasta = f.fecha_hasta;
    // estado y proceso_ot manuales solo si no hay card activa
    if (!cardActiva) {
      if (f.estado)    p.estado    = f.estado;
      if (f.proceso_ot) p.proceso_ot = f.proceso_ot;
    }

    return new URLSearchParams(p).toString();
  }

  // ── Cargar órdenes ────────────────────────────────
  async function cargarOrdenes(page = 1) {
    const tbody = document.getElementById("tbody-ordenes");
    tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:40px;color:var(--text-light);">Cargando...</td></tr>`;

    const res = await apiFetch(`/taller/ordenes?${buildParams(page)}`);
    if (!res || !res.ok) {
      tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;color:red;padding:20px;">Error cargando órdenes</td></tr>`;
      return;
    }
    const data = await safeJson(res);
    paginaActual = data.pagina;
    totalPaginas = data.totalPaginas;

    if (!data.ordenes.length) {
      tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:40px;color:var(--text-light);">Sin resultados</td></tr>`;
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

  // ── Cargar filtros dinámicos ──────────────────────
  async function cargarFiltros(localidad = "") {
    const qs  = localidad ? `?localidad=${localidad}` : "";
    const res = await apiFetch(`/taller/filtros${qs}`);
    if (!res || !res.ok) return null;
    const data = await safeJson(res);

    const selEstado  = document.getElementById("f-estado");
    const selAseg    = document.getElementById("f-aseguradora");
    const selProceso = document.getElementById("f-proceso");
    const prevE = selEstado.value, prevA = selAseg.value, prevP = selProceso.value;

    selEstado.innerHTML  = `<option value="">Todos</option>`  + (data.estados  || []).map(e => `<option value="${e}">${e}</option>`).join("");
    selAseg.innerHTML    = `<option value="">Todas</option>`  + (data.aseguradoras || []).filter(Boolean).map(a => `<option value="${a}">${a}</option>`).join("");
    selProceso.innerHTML = `<option value="">Todos</option>`  + (data.procesos || []).filter(Boolean).map(p => `<option value="${p}">${p}</option>`).join("");

    if (prevE) selEstado.value = prevE;
    if (prevA) selAseg.value   = prevA;
    if (prevP) selProceso.value = prevP;

    // Sincronizar con filtros del dashboard
    DASH.sincFiltros(data);
    return data;
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

    await cargarFiltros(localidad);
    await cargarCards(localidad);

    // Limpiar card activa y recargar
    cardActiva = null;
    document.getElementById("cards-estado").querySelectorAll(".estado-card").forEach(b => b.classList.remove("card-activa"));
    document.getElementById("cards-estado").classList.remove("cards-con-activa");
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
    if (tr) {
      tr.querySelector(".obs-cell").textContent = vals.observacion;
      tr.querySelector(".fecha-salida-env").textContent = fmtFecha(vals.fecha_salida_enviada);
    }
  }

  // ── Tab Resumen ───────────────────────────────────
  async function cargarResumen() {
    const localidad = document.getElementById("res-localidad").value;
    const qs = localidad ? `?localidad=${localidad}` : "";
    const res = await apiFetch(`/taller/resumen${qs}`);
    if (!res || !res.ok) { Swal.fire("Error", "No se pudo cargar el resumen.", "error"); return; }
    const d = await safeJson(res);

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

    document.getElementById("res-estado").innerHTML = (d.por_estado || []).map(r =>
      `<tr><td>${r.estado || "—"}</td><td class="num-right">${r.cantidad}</td><td class="num-right">${r.pct}%</td></tr>`
    ).join("") || `<tr><td colspan="3" style="padding:16px;text-align:center;color:var(--text-light);">Sin datos</td></tr>`;

    document.getElementById("res-proceso").innerHTML = (d.por_proceso || []).map(r =>
      `<tr><td>${r.proceso_ot || "—"}</td><td class="num-right">${r.cantidad}</td></tr>`
    ).join("") || `<tr><td colspan="2" style="padding:16px;text-align:center;color:var(--text-light);">Sin datos</td></tr>`;

    document.getElementById("res-aseg").innerHTML = (d.por_aseguradora || []).map(r =>
      `<tr><td>${r.aseguradora}</td>
           <td class="num-right">${r.abierto || 0}</td>
           <td class="num-right">${r.terminado || 0}</td>
           <td class="num-right">${r.facturado || 0}</td>
           <td class="num-right">${r.anulado || 0}</td>
           <td class="num-right"><strong>${r.total}</strong></td></tr>`
    ).join("") || `<tr><td colspan="6" style="padding:16px;text-align:center;color:var(--text-light);">Sin datos</td></tr>`;

    document.getElementById("res-usuario").innerHTML = (d.por_usuario || []).map(r =>
      `<tr><td>${r.usuario}</td>
           <td class="num-right">${r.abierto || 0}</td>
           <td class="num-right">${r.terminado || 0}</td>
           <td class="num-right">${r.facturado || 0}</td>
           <td class="num-right">${r.anulado || 0}</td>
           <td class="num-right"><strong>${r.total}</strong></td></tr>`
    ).join("") || `<tr><td colspan="6" style="padding:16px;text-align:center;color:var(--text-light);">Sin datos</td></tr>`;

    document.getElementById("res-mes").innerHTML = (d.por_mes || []).map(r =>
      `<tr><td>${fmtMes(r.mes)}</td>
           <td class="num-right">${r.abierto || 0}</td>
           <td class="num-right">${r.terminado || 0}</td>
           <td class="num-right">${r.facturado || 0}</td>
           <td class="num-right">${r.anulado || 0}</td>
           <td class="num-right"><strong>${r.total}</strong></td></tr>`
    ).join("") || `<tr><td colspan="6" style="padding:16px;text-align:center;color:var(--text-light);">Sin datos</td></tr>`;
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
        if (btn.dataset.tab === "resumen")   cargarResumen();
        if (btn.dataset.tab === "dashboard") DASH.cargar();
      });
    });

    // Cards como botones de filtro
    document.getElementById("cards-estado").addEventListener("click", e => {
      const btn = e.target.closest("[data-card]");
      if (!btn) return;
      activarCard(btn.dataset.card);
    });

    // Importar
    document.getElementById("btn-importar").addEventListener("click", importar);

    // Filtros manuales
    document.getElementById("btn-filtrar").addEventListener("click", () => {
      // Si hay card activa, desactivarla al aplicar filtros manuales
      cardActiva = null;
      document.getElementById("cards-estado").querySelectorAll(".estado-card").forEach(b => b.classList.remove("card-activa"));
      document.getElementById("cards-estado").classList.remove("cards-con-activa");

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
      Object.keys(filtrosActivos).forEach(k => { if (!filtrosActivos[k]) delete filtrosActivos[k]; });
      cargarOrdenes(1);
    });

    document.getElementById("btn-limpiar").addEventListener("click", () => {
      filtrosActivos = {};
      cardActiva = null;
      document.getElementById("cards-estado").querySelectorAll(".estado-card").forEach(b => b.classList.remove("card-activa"));
      document.getElementById("cards-estado").classList.remove("cards-con-activa");
      ["f-localidad","f-estado","f-aseguradora","f-proceso"].forEach(id => document.getElementById(id).value = "");
      ["f-placa","f-cliente","f-desde","f-hasta"].forEach(id => document.getElementById(id).value = "");
      cargarOrdenes(1);
    });

    document.getElementById("f-localidad").addEventListener("change", e => {
      cargarFiltros(e.target.value);
      cargarCards(e.target.value);
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

    // Init dashboard
    DASH.init();

    // Carga inicial
    cargarFiltros().then(data => DASH.sincFiltros(data));
    cargarCards();
    cargarOrdenes(1);
  }

  document.addEventListener("DOMContentLoaded", init);

  return { editarOrden };
})();
