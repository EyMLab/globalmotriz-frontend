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

// ── Estado de card activa (compartido por DASH, CT y Resumen) ──
let _cardActiva = null;   // "ABIERTO" | "SVC" | "DEDUCIBLE" | null | etc.

// ── Instancias MultiSelect (módulo global) ──────────
let msOrdEstado, msOrdAseg, msOrdProceso;
let msDashEstado, msDashAseg, msDashProceso;

// ── Clase MultiSelect (dropdown con checkboxes) ──────
class MultiSelect {
  constructor(wrapperId, { placeholder = "Todos" } = {}) {
    this.wrap = document.getElementById(wrapperId);
    if (!this.wrap) return;
    this.placeholder = placeholder;
    this.selected    = new Set();
    this.wrap.innerHTML = `
      <button type="button" class="ms-btn">${placeholder}</button>
      <div class="ms-dropdown">
        <div class="ms-actions">
          <button type="button" class="ms-all">Todos</button>
          <button type="button" class="ms-none">Limpiar</button>
        </div>
        <div class="ms-items"></div>
      </div>`;
    this.btn      = this.wrap.querySelector(".ms-btn");
    this.dropdown = this.wrap.querySelector(".ms-dropdown");
    this.itemsEl  = this.wrap.querySelector(".ms-items");
    this.btn.addEventListener("click", e => { e.stopPropagation(); this.toggle(); });
    this.wrap.querySelector(".ms-all").addEventListener("click",  e => { e.stopPropagation(); this.selectAll(); });
    this.wrap.querySelector(".ms-none").addEventListener("click", e => { e.stopPropagation(); this.clear(); });
    document.addEventListener("click", e => { if (!this.wrap.contains(e.target)) this.close(); });
  }
  populate(items) {
    if (!this.itemsEl) return;
    this.selected = new Set([...this.selected].filter(v => items.includes(v)));
    this.itemsEl.innerHTML = items.length
      ? items.map(v => `<label class="ms-item"><input type="checkbox" value="${v.replace(/"/g,'&quot;')}" ${this.selected.has(v) ? "checked" : ""}> ${v}</label>`).join("")
      : `<div class="ms-empty">Sin opciones</div>`;
    this.itemsEl.querySelectorAll("input").forEach(cb => {
      cb.addEventListener("change", () => {
        if (cb.checked) this.selected.add(cb.value);
        else            this.selected.delete(cb.value);
        this.updateBtn();
      });
    });
    this.updateBtn();
  }
  updateBtn() {
    if (!this.btn) return;
    const n = this.selected.size;
    if (n === 0) { this.btn.textContent = this.placeholder; this.btn.classList.remove("ms-has-sel"); }
    else if (n === 1) { const v = [...this.selected][0]; this.btn.textContent = v.length > 22 ? v.slice(0,22)+"…" : v; this.btn.classList.add("ms-has-sel"); }
    else { this.btn.textContent = `${n} seleccionados`; this.btn.classList.add("ms-has-sel"); }
  }
  selectAll() { this.itemsEl?.querySelectorAll("input").forEach(cb => { cb.checked = true; this.selected.add(cb.value); }); this.updateBtn(); }
  clear()     { this.selected.clear(); this.itemsEl?.querySelectorAll("input").forEach(cb => cb.checked = false); this.updateBtn(); }
  toggle()    { this.dropdown?.classList.toggle("open"); }
  close()     { this.dropdown?.classList.remove("open"); }
  getValues() { return [...this.selected]; }
}

// ── Clase Autocomplete (búsqueda de clientes) ────────
class Autocomplete {
  constructor(inputId, { fetchFn, localidadFn = () => "" } = {}) {
    this.input      = document.getElementById(inputId);
    if (!this.input) return;
    this.fetchFn    = fetchFn;
    this.localidadFn = localidadFn;
    this._timer     = null;
    this._activeIdx = -1;
    this._items     = [];

    // Crear dropdown dentro del mismo .ac-wrap
    this.dropdown = document.createElement("div");
    this.dropdown.className = "ac-dropdown";
    this.input.parentNode.appendChild(this.dropdown);

    this.input.addEventListener("input",   () => this._onInput());
    this.input.addEventListener("keydown", e  => this._onKey(e));
    document.addEventListener("click", e => {
      if (!this.input.parentNode.contains(e.target)) this.close();
    });
  }

  _onInput() {
    clearTimeout(this._timer);
    const q = this.input.value.trim();
    if (q.length < 2) { this.close(); return; }
    this._timer = setTimeout(() => this._fetch(q), 300);
  }

  async _fetch(q) {
    const loc = this.localidadFn();
    const qs  = `q=${encodeURIComponent(q)}${loc ? `&localidad=${encodeURIComponent(loc)}` : ""}`;
    const res = await apiFetch(`/taller/clientes?${qs}`);
    if (!res || !res.ok) return;
    const d = await safeJson(res);
    this._show(d.clientes || []);
  }

  _show(items) {
    this._items     = items;
    this._activeIdx = -1;
    if (!items.length) { this.close(); return; }
    this.dropdown.innerHTML = items.map((v, i) =>
      `<div class="ac-item" data-idx="${i}">${v}</div>`
    ).join("");
    this.dropdown.querySelectorAll(".ac-item").forEach(el => {
      el.addEventListener("mousedown", e => {
        e.preventDefault();
        this.input.value = items[+el.dataset.idx];
        this.close();
      });
    });
    this.dropdown.classList.add("open");
  }

  _onKey(e) {
    const els = [...this.dropdown.querySelectorAll(".ac-item")];
    if (!els.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this._activeIdx = Math.min(this._activeIdx + 1, els.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this._activeIdx = Math.max(this._activeIdx - 1, -1);
    } else if (e.key === "Enter" && this._activeIdx >= 0) {
      e.preventDefault();
      this.input.value = this._items[this._activeIdx];
      this.close();
      return;
    } else if (e.key === "Escape") {
      this.close(); return;
    } else { return; }
    els.forEach((el, i) => el.classList.toggle("ac-active", i === this._activeIdx));
    if (this._activeIdx >= 0) els[this._activeIdx].scrollIntoView({ block: "nearest" });
  }

  close() {
    this.dropdown.classList.remove("open");
    this._activeIdx = -1;
  }
}

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
    return "$" + n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    // Lee directamente del panel de filtros unificado (f-*)
    const localidad  = document.getElementById("f-localidad")?.value || "";
    const orden      = (document.getElementById("f-orden")?.value   || "").trim();
    const placa      = (document.getElementById("f-placa")?.value   || "").trim();
    const cliente    = (document.getElementById("f-cliente")?.value || "").trim();
    const fechaDesde = document.getElementById("f-desde")?.value    || "";
    const fechaHasta = document.getElementById("f-hasta")?.value    || "";
    const params = new URLSearchParams();
    if (localidad)  params.set("localidad",   localidad);
    if (orden)      params.set("orden",       orden);
    if (placa)      params.set("placa",       placa);
    if (cliente)    params.set("cliente",     cliente);
    if (fechaDesde) params.set("fecha_desde", fechaDesde);
    if (fechaHasta) params.set("fecha_hasta", fechaHasta);
    // Multi-selects compartidos con pestaña Órdenes
    const estados  = msOrdEstado?.getValues()  || [];
    const aseg     = msOrdAseg?.getValues()    || [];
    const procesos = msOrdProceso?.getValues() || [];
    if (estados.length)  params.set("estados_multi",     estados.join(","));
    if (aseg.length)     params.set("aseguradoras_multi", aseg.join(","));
    if (procesos.length) params.set("procesos_multi",    procesos.join(","));
    // Card activa
    if (_cardActiva && _cardActiva !== "TOTAL") params.set("card", _cardActiva);

    // Mostrar loading en las tarjetas
    document.getElementById("dash-fin-grid").innerHTML =
      `<div style="padding:20px;color:var(--text-light);font-size:13px;">Cargando...</div>`;

    const res = await apiFetch(`/taller/resumen?${params}`);
    if (!res || !res.ok) { return; }
    const d = await safeJson(res);
    render(d);
  }

  // sincFiltros ya no hace falta (MultiSelects son compartidos)
  function sincFiltros() {}
  function init() {}

  return { cargar, sincFiltros, init };
})();

const CT = (() => {

  // ── Estado interno ────────────────────────────────
  let paginaActual  = 1;
  const LIMITE      = 100;
  let totalPaginas  = 1;
  // filtrosActivos eliminado — se lee directo del DOM via leerFiltros()
  // cardActiva → _cardActiva (módulo global, compartida con DASH)

  // ── Definición de columnas ────────────────────────
  const COLS = [
    { id:"orden",     label:"N° Orden",       def:true,  sticky:true },
    { id:"localidad", label:"Localidad",       def:false  },
    { id:"estado",    label:"Estado",          def:true   },
    { id:"proceso",   label:"Proceso OT",      def:true   },
    { id:"fingreso",  label:"F. Ingreso",      def:true   },
    { id:"fsalida",   label:"F. Salida",       def:false  },
    { id:"fsenv",     label:"F. Salida Env.",  def:true   },
    { id:"placa",     label:"Placa",           def:true   },
    { id:"marca",     label:"Marca",           def:false  },
    { id:"modelo",    label:"Modelo",          def:false  },
    { id:"color",     label:"Color",           def:false  },
    { id:"cliente",   label:"Cliente",         def:true   },
    { id:"aseg",      label:"Aseguradora",     def:true   },
    { id:"usuario",   label:"Usuario",         def:false  },
    { id:"vtotal",    label:"V. Total",        def:true   },
    { id:"obs",       label:"Observación",     def:false  },
    { id:"acciones",  label:"Acciones",        def:true,  noToggle:true },
  ];
  const colVisible = {};
  COLS.forEach(c => { colVisible[c.id] = c.def; });

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
      case "SANTIAGO":  return "tr-santiago";
      case "INTERNO":   return "tr-interno";
      case "GARANTÍA":  return "tr-garantia";
      case "EMPLEADO":  return "tr-empleado";
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
    document.getElementById("c-deducible").textContent = d.deducible  ?? 0;
    document.getElementById("c-santiago").textContent  = d.santiago   ?? 0;
    document.getElementById("c-interno").textContent   = d.interno    ?? 0;
    document.getElementById("c-garantia").textContent  = d.garantia   ?? 0;
    document.getElementById("c-empleado").textContent  = d.empleado   ?? 0;
    document.getElementById("c-total").textContent     = d.total      ?? 0;
  }

  // ── Activar / desactivar tarjeta ──────────────────
  function activarCard(card) {
    const contenedor = document.getElementById("cards-estado");
    const todas = contenedor.querySelectorAll(".estado-card");

    if (_cardActiva === card) {
      // Deseleccionar: quitar filtro de card
      _cardActiva = null;
      todas.forEach(b => b.classList.remove("card-activa"));
      contenedor.classList.remove("cards-con-activa");
    } else {
      _cardActiva = card;
      todas.forEach(b => b.classList.remove("card-activa"));
      const btn = contenedor.querySelector(`[data-card="${card}"]`);
      if (btn) btn.classList.add("card-activa");
      contenedor.classList.add("cards-con-activa");
    }

    // Si hay una card activa, limpiar los multi-selects de estado/proceso
    if (_cardActiva) {
      msOrdEstado?.clear();
      msOrdProceso?.clear();
    }

    // Recargar la pestaña que esté visible en ese momento
    const tabActiva = document.querySelector(".taller-tab.active")?.dataset.tab;
    if (tabActiva === "dashboard") {
      DASH.cargar();
    } else if (tabActiva === "resumen") {
      cargarResumen();
    } else {
      cargarOrdenes(1);
    }
  }

  // ── Leer valores del panel de filtros unificado ──────
  function leerFiltros() {
    return {
      localidad:   document.getElementById("f-localidad")?.value || "",
      orden:       document.getElementById("f-orden")?.value?.trim() || "",
      placa:       document.getElementById("f-placa")?.value?.trim() || "",
      cliente:     document.getElementById("f-cliente")?.value?.trim() || "",
      fecha_desde: document.getElementById("f-desde")?.value || "",
      fecha_hasta: document.getElementById("f-hasta")?.value || "",
      con_obs:     document.getElementById("f-con-obs")?.checked || false,
    };
  }

  // ── Construir params de query para /taller/ordenes ─
  function buildParams(page) {
    const p = new URLSearchParams({ page, limit: LIMITE });
    const f = leerFiltros();

    // Filtro de card
    if (_cardActiva) p.set("card", _cardActiva);

    if (f.localidad)   p.set("localidad",   f.localidad);
    if (f.orden)       p.set("orden",       f.orden);
    if (f.placa)       p.set("placa",       f.placa);
    if (f.cliente)     p.set("cliente",     f.cliente);
    if (f.fecha_desde) p.set("fecha_desde", f.fecha_desde);
    if (f.fecha_hasta) p.set("fecha_hasta", f.fecha_hasta);
    if (f.con_obs)     p.set("con_obs",     "1");

    // Multi-selects (solo si no hay card activa)
    if (!_cardActiva) {
      const estados  = msOrdEstado?.getValues()  || [];
      const aseg     = msOrdAseg?.getValues()    || [];
      const procesos = msOrdProceso?.getValues() || [];
      if (estados.length)  p.set("estados_multi",     estados.join(","));
      if (aseg.length)     p.set("aseguradoras_multi", aseg.join(","));
      if (procesos.length) p.set("procesos_multi",    procesos.join(","));
    } else {
      // Con card activa solo pasa aseguradora (no estado/proceso)
      const aseg = msOrdAseg?.getValues() || [];
      if (aseg.length) p.set("aseguradoras_multi", aseg.join(","));
    }

    return p.toString();
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
        const cl = (o.cliente    || "").replace(/"/g,"&quot;");
        const as = (o.aseguradora|| "").replace(/"/g,"&quot;");
        const ob = (o.observacion|| "").replace(/"/g,"&quot;");
        return `<tr class="${ce} ${cp}" data-orden="${o.numero_orden}" data-localidad="${o.localidad}">
          <td data-col="orden"><strong>${o.numero_orden}</strong></td>
          <td data-col="localidad">${o.localidad}</td>
          <td data-col="estado">${o.estado || "—"}</td>
          <td data-col="proceso">${o.proceso_ot || "—"}</td>
          <td data-col="fingreso">${fmtFecha(o.fecha_ingreso)}</td>
          <td data-col="fsalida">${fmtFecha(o.fecha_salida)}</td>
          <td data-col="fsenv" class="fecha-salida-env">${fmtFecha(o.fecha_salida_enviada)}</td>
          <td data-col="placa">${o.placa || "—"}</td>
          <td data-col="marca">${o.marca || "—"}</td>
          <td data-col="modelo">${o.modelo || "—"}</td>
          <td data-col="color">${o.color || "—"}</td>
          <td data-col="cliente" class="tc-cliente" title="${cl}">${o.cliente || "—"}</td>
          <td data-col="aseg" class="tc-aseg" title="${as}">${o.aseguradora || "—"}</td>
          <td data-col="usuario">${o.usuario_registro || "—"}</td>
          <td data-col="vtotal" class="num-right">${fmtMoney(o.valor_total)}</td>
          <td data-col="obs" class="obs-cell tc-obs" title="${ob}">${o.observacion || ""}</td>
          <td data-col="acciones"><button class="btn-editar" onclick="CT.editarOrden('${o.numero_orden}','${o.localidad}')">✏</button></td>
        </tr>`;
      }).join("");
    }

    // Contador y paginación
    const countEl = document.getElementById("tabla-count");
    if (countEl) countEl.textContent = `${data.total} órdenes`;
    document.getElementById("pag-info").textContent =
      `Página ${paginaActual} de ${totalPaginas} (${data.total} órdenes)`;
    document.getElementById("btn-prev").disabled = paginaActual <= 1;
    document.getElementById("btn-next").disabled = paginaActual >= totalPaginas;
    aplicarColumnas();
  }

  // ── Cargar filtros dinámicos ──────────────────────
  async function cargarFiltros(localidad = "") {
    const qs  = localidad ? `?localidad=${localidad}` : "";
    const res = await apiFetch(`/taller/filtros${qs}`);
    if (!res || !res.ok) return null;
    const data = await safeJson(res);

    // Poblar MultiSelects de órdenes
    msOrdEstado?.populate(data.estados || []);
    msOrdAseg?.populate((data.aseguradoras || []).filter(Boolean));
    msOrdProceso?.populate((data.procesos  || []).filter(Boolean));

    // Sincronizar con filtros del dashboard
    DASH.sincFiltros(data);
    return data;
  }

  // ── Importar reporte (modal Swal) ────────────────
  async function importar() {
    const { value: vals } = await Swal.fire({
      title: "Importar Reporte",
      html: `
        <div style="text-align:left;display:flex;flex-direction:column;gap:14px;padding:4px 0">
          <div>
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:#374151">Localidad</label>
            <select id="si-localidad" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;background:#fff">
              <option value="MATRIZ">MATRIZ</option>
              <option value="SUCURSAL">SUCURSAL</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:#374151">Reporte Excel (.xlsx / .xls)</label>
            <input type="file" id="si-archivo" accept=".xlsx,.xls"
              style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;box-sizing:border-box;background:#f9fafb"/>
          </div>
        </div>`,
      confirmButtonText: "⬆ Importar",
      cancelButtonText: "Cancelar",
      showCancelButton: true,
      confirmButtonColor: "#2B7A9E",
      cancelButtonColor: "#6b7280",
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async () => {
        const loc  = document.getElementById("si-localidad").value;
        const file = document.getElementById("si-archivo").files[0];
        if (!file) {
          Swal.showValidationMessage("Selecciona el archivo Excel del reporte.");
          return false;
        }
        const fd = new FormData();
        fd.append("localidad", loc);
        fd.append("reporte", file);
        try {
          const res = await apiFetch("/taller/importar", { method: "POST", body: fd });
          if (!res || !res.ok) {
            const err = await safeJson(res);
            Swal.showValidationMessage(err?.error || "No se pudo importar el reporte.");
            return false;
          }
          const data = await safeJson(res);
          return { ...data, localidad: loc };
        } catch (e) {
          Swal.showValidationMessage("Error de conexión. Intenta de nuevo.");
          return false;
        }
      },
    });

    if (!vals) return;   // cancelado o validación fallida

    const localidad = vals.localidad;
    document.getElementById("import-info").textContent =
      `Última importación: ${new Date().toLocaleString("es-EC")} · ${vals.nuevas} nuevas · ${vals.actualizadas} actualizadas`;

    await cargarFiltros(localidad);
    await cargarCards(localidad);

    // Limpiar card activa y recargar
    _cardActiva = null;
    document.getElementById("cards-estado").querySelectorAll(".estado-card").forEach(b => b.classList.remove("card-activa"));
    document.getElementById("cards-estado").classList.remove("cards-con-activa");
    document.getElementById("f-localidad").value = localidad;
    await cargarOrdenes(1);

    Swal.fire({
      icon: "success",
      title: "Importación completada",
      html: `<b>${vals.nuevas}</b> órdenes nuevas<br><b>${vals.actualizadas}</b> actualizadas`,
      timer: 3000,
      showConfirmButton: false,
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

  // ── Visibilidad de columnas ───────────────────────
  function aplicarColumnas() {
    COLS.forEach(col => {
      const show = colVisible[col.id];
      document.querySelectorAll(`[data-col="${col.id}"]`).forEach(el => {
        el.style.display = show ? "" : "none";
      });
    });
  }

  function initColumnToggle() {
    const checksEl = document.getElementById("cols-checks");
    if (!checksEl) return;
    checksEl.innerHTML = COLS.filter(c => !c.noToggle).map(c => `
      <label>
        <input type="checkbox" data-colid="${c.id}" ${colVisible[c.id] ? "checked" : ""}>
        ${c.label}
      </label>`).join("");
    checksEl.querySelectorAll("input").forEach(cb => {
      cb.addEventListener("change", () => {
        colVisible[cb.dataset.colid] = cb.checked;
        aplicarColumnas();
      });
    });
    document.getElementById("cols-all")?.addEventListener("click", () => {
      COLS.filter(c => !c.noToggle).forEach(c => { colVisible[c.id] = true; });
      checksEl.querySelectorAll("input").forEach(cb => cb.checked = true);
      aplicarColumnas();
    });
    document.getElementById("cols-default")?.addEventListener("click", () => {
      COLS.filter(c => !c.noToggle).forEach(c => { colVisible[c.id] = c.def; });
      checksEl.querySelectorAll("input").forEach(cb => {
        const col = COLS.find(c => c.id === cb.dataset.colid);
        if (col) cb.checked = col.def;
      });
      aplicarColumnas();
    });
    const btn = document.getElementById("btn-cols");
    const panel = document.getElementById("cols-panel");
    btn?.addEventListener("click", e => { e.stopPropagation(); panel?.classList.toggle("open"); });
    document.addEventListener("click", e => { if (!panel?.contains(e.target) && e.target !== btn) panel?.classList.remove("open"); });
  }

  // ── Exportar ──────────────────────────────────────
  function buildExportParams() {
    const p = new URLSearchParams();
    const f = leerFiltros();
    if (_cardActiva) p.set("card", _cardActiva);
    if (f.localidad)   p.set("localidad",   f.localidad);
    if (f.orden)       p.set("orden",       f.orden);
    if (f.placa)       p.set("placa",       f.placa);
    if (f.cliente)     p.set("cliente",     f.cliente);
    if (f.fecha_desde) p.set("fecha_desde", f.fecha_desde);
    if (f.fecha_hasta) p.set("fecha_hasta", f.fecha_hasta);
    if (f.con_obs)     p.set("con_obs",     "1");
    if (!_cardActiva) {
      const e = msOrdEstado?.getValues()  || [];
      const a = msOrdAseg?.getValues()    || [];
      const pr= msOrdProceso?.getValues() || [];
      if (e.length)  p.set("estados_multi",     e.join(","));
      if (a.length)  p.set("aseguradoras_multi", a.join(","));
      if (pr.length) p.set("procesos_multi",    pr.join(","));
    } else {
      const a = msOrdAseg?.getValues() || [];
      if (a.length) p.set("aseguradoras_multi", a.join(","));
    }
    return p.toString();
  }

  async function exportarCSV() {
    const btn = document.getElementById("btn-export-csv");
    if (btn) { btn.disabled = true; btn.textContent = "Generando..."; }
    const res = await apiFetch(`/taller/ordenes?${buildExportParams()}&limit=5000`);
    if (btn) { btn.disabled = false; btn.textContent = "⬇ CSV"; }
    if (!res || !res.ok) { Swal.fire("Error", "No se pudo exportar.", "error"); return; }
    const data = await safeJson(res);
    const filas = data.ordenes;
    const cols  = ["numero_orden","localidad","estado","proceso_ot","fecha_ingreso","fecha_salida","fecha_salida_enviada","placa","marca","modelo","color","cliente","aseguradora","usuario_registro","total_servicios","total_servicios_terce","total_repuestos","sub_total","valor_total","observacion"];
    const hdr   = ["N° ORDEN","LOCALIDAD","ESTADO","PROCESO OT","F. INGRESO","F. SALIDA","F. SALIDA ENV.","PLACA","MARCA","MODELO","COLOR","CLIENTE","ASEGURADORA","USUARIO","TOTAL SERV.","SERV. TERCEROS","TOTAL REP.","SUB TOTAL","VALOR TOTAL","OBSERVACIÓN"];
    const csv   = [hdr.join(","), ...filas.map(o => cols.map(c => `"${(o[c]??'').toString().replace(/"/g,'""')}"`).join(","))].join("\n");
    const blob  = new Blob(["﻿"+csv], { type:"text/csv;charset=utf-8;" });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement("a");
    a.href = url; a.download = `control-taller-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function exportarExcel() {
    const btn = document.getElementById("btn-export-excel");
    if (btn) { btn.disabled = true; btn.textContent = "Generando..."; }
    // Llama al endpoint del backend que devuelve el archivo xlsx
    const token = localStorage.getItem("token");
    const url = `${API_BASE_URL}/taller/exportar?${buildExportParams()}`;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Error del servidor");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `control-taller-${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
    } catch (e) {
      Swal.fire("Error", "No se pudo generar el Excel.", "error");
    }
    if (btn) { btn.disabled = false; btn.textContent = "⬇ Excel"; }
  }

  // ── Tab Resumen ───────────────────────────────────
  async function cargarResumen() {
    const f = leerFiltros();
    const p = new URLSearchParams();
    if (f.localidad)   p.set("localidad",   f.localidad);
    if (f.orden)       p.set("orden",       f.orden);
    if (f.placa)       p.set("placa",       f.placa);
    if (f.cliente)     p.set("cliente",     f.cliente);
    if (f.fecha_desde) p.set("fecha_desde", f.fecha_desde);
    if (f.fecha_hasta) p.set("fecha_hasta", f.fecha_hasta);
    if (_cardActiva) p.set("card", _cardActiva);
    const estados  = msOrdEstado?.getValues()  || [];
    const aseg     = msOrdAseg?.getValues()    || [];
    const procesos = msOrdProceso?.getValues() || [];
    if (estados.length)  p.set("estados_multi",     estados.join(","));
    if (aseg.length)     p.set("aseguradoras_multi", aseg.join(","));
    if (procesos.length) p.set("procesos_multi",    procesos.join(","));
    const res = await apiFetch(`/taller/resumen?${p}`);
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
      `<tr><td>${r.estado || "—"}</td><td class="num-right">${r.cantidad}</td><td class="num-right">${r.pct}%</td><td class="num-right">${fmtMoney(r.valor_total)}</td></tr>`
    ).join("") || `<tr><td colspan="4" style="padding:16px;text-align:center;color:var(--text-light);">Sin datos</td></tr>`;

    document.getElementById("res-proceso").innerHTML = (d.por_proceso || []).map(r =>
      `<tr><td>${r.proceso_ot || "—"}</td><td class="num-right">${r.cantidad}</td><td class="num-right">${fmtMoney(r.valor_total)}</td></tr>`
    ).join("") || `<tr><td colspan="3" style="padding:16px;text-align:center;color:var(--text-light);">Sin datos</td></tr>`;

    document.getElementById("res-aseg").innerHTML = (d.por_aseguradora || []).map(r =>
      `<tr><td>${r.aseguradora}</td>
           <td class="num-right">${r.abierto || 0}<span class="cell-val">${fmtMoney(r.valor_abierto)}</span></td>
           <td class="num-right">${r.terminado || 0}<span class="cell-val">${fmtMoney(r.valor_terminado)}</span></td>
           <td class="num-right">${r.facturado || 0}<span class="cell-val">${fmtMoney(r.valor_facturado)}</span></td>
           <td class="num-right">${r.anulado || 0}<span class="cell-val">${fmtMoney(r.valor_anulado)}</span></td>
           <td class="num-right"><strong>${r.total}</strong><span class="cell-val">${fmtMoney(r.valor_total)}</span></td></tr>`
    ).join("") || `<tr><td colspan="6" style="padding:16px;text-align:center;color:var(--text-light);">Sin datos</td></tr>`;

    document.getElementById("res-usuario").innerHTML = (d.por_usuario || []).map(r =>
      `<tr><td>${r.usuario}</td>
           <td class="num-right">${r.abierto || 0}<span class="cell-val">${fmtMoney(r.valor_abierto)}</span></td>
           <td class="num-right">${r.terminado || 0}<span class="cell-val">${fmtMoney(r.valor_terminado)}</span></td>
           <td class="num-right">${r.facturado || 0}<span class="cell-val">${fmtMoney(r.valor_facturado)}</span></td>
           <td class="num-right">${r.anulado || 0}<span class="cell-val">${fmtMoney(r.valor_anulado)}</span></td>
           <td class="num-right"><strong>${r.total}</strong><span class="cell-val">${fmtMoney(r.valor_total)}</span></td></tr>`
    ).join("") || `<tr><td colspan="6" style="padding:16px;text-align:center;color:var(--text-light);">Sin datos</td></tr>`;

    document.getElementById("res-mes").innerHTML = (d.por_mes || []).map(r =>
      `<tr><td>${fmtMes(r.mes)}</td>
           <td class="num-right">${r.abierto || 0}<span class="cell-val">${fmtMoney(r.valor_abierto)}</span></td>
           <td class="num-right">${r.terminado || 0}<span class="cell-val">${fmtMoney(r.valor_terminado)}</span></td>
           <td class="num-right">${r.facturado || 0}<span class="cell-val">${fmtMoney(r.valor_facturado)}</span></td>
           <td class="num-right">${r.anulado || 0}<span class="cell-val">${fmtMoney(r.valor_anulado)}</span></td>
           <td class="num-right"><strong>${r.total}</strong><span class="cell-val">${fmtMoney(r.valor_total)}</span></td></tr>`
    ).join("") || `<tr><td colspan="6" style="padding:16px;text-align:center;color:var(--text-light);">Sin datos</td></tr>`;
  }

  // ── Recargar la pestaña activa con los filtros actuales ──
  function recargarTabActiva() {
    const tab = document.querySelector(".taller-tab.active")?.dataset.tab || "ordenes";
    if      (tab === "ordenes")   cargarOrdenes(1);
    else if (tab === "dashboard") { DASH.cargar(); COBRO.cargarResumen(); }
    else if (tab === "resumen")   cargarResumen();
    else if (tab === "cobranza")  COBRO.cargar(1);
  }

  // ═══════════════════════════════════════════════════
  // MÓDULO COBRANZA
  // ═══════════════════════════════════════════════════
  const COBRO = (() => {
    let pag = 1, totalPag = 1;
    let _cardCobro = null;
    let chartEstado, chartAseg, chartAntiguedad;

    const fmtM = v => "$" + (parseFloat(v)||0).toLocaleString("es-EC",{minimumFractionDigits:2,maximumFractionDigits:2});
    const fmtD = d => d ? new Date(d).toLocaleDateString("es-EC") : "—";

    function estadoCobro(d) {
      if (d.estado_doc === "COBRADO_HISTORICO") return "HISTORICO";
      if (d.estado_doc === "DESCARTADO") return "DESCARTADO";
      if (d.estado_doc === "COBRADO" || (parseFloat(d.saldo) === 0 && parseFloat(d.cobrado) > 0)) return "COBRADO";
      if (parseFloat(d.cobrado) > 0 && parseFloat(d.saldo) > 0) return "PARCIAL";
      if (parseFloat(d.saldo) > 0) return "PENDIENTE";
      if (parseFloat(d.cargos) === 0 && parseFloat(d.saldo) === 0) return "COBRADO";
      return "SIN_INFO";
    }

    const COLORES_COBRO = {
      COBRADO:    { bg:"#f0fdf4", border:"#22c55e", text:"#16a34a", badge:"#dcfce7" },
      HISTORICO:  { bg:"#eff6ff", border:"#3b82f6", text:"#2563eb", badge:"#dbeafe" },
      PARCIAL:    { bg:"#fefce8", border:"#f59e0b", text:"#d97706", badge:"#fef9c3" },
      PENDIENTE:  { bg:"#fef2f2", border:"#ef4444", text:"#dc2626", badge:"#fee2e2" },
      DESCARTADO: { bg:"#f9fafb", border:"#d1d5db", text:"#6b7280", badge:"#f3f4f6" },
      SIN_INFO:   { bg:"#fff",    border:"#e5e7eb", text:"#9ca3af", badge:"#f3f4f6" },
    };

    function buildParams(page) {
      const p = new URLSearchParams({ page, limit: 100 });
      const f = leerFiltros();
      if (f.localidad)   p.set("localidad",   f.localidad);
      if (f.placa)       p.set("placa",       f.placa);
      if (f.cliente)     p.set("cliente",     f.cliente);
      if (f.fecha_desde) p.set("fecha_desde", f.fecha_desde);
      if (f.fecha_hasta) p.set("fecha_hasta", f.fecha_hasta);
      const aseg = msOrdAseg?.getValues();
      if (aseg?.length) p.set("aseguradora", aseg[0]);
      const tieneOrden = document.getElementById("fc-tiene-orden")?.value;
      if (tieneOrden) p.set("tiene_orden", tieneOrden);
      if (document.getElementById("fc-descartados")?.checked) p.set("incluir_descartados", "1");
      if (_cardCobro && _cardCobro !== "TOTAL") p.set("estado_cobro", _cardCobro);
      return p;
    }

    async function cargar(page = 1) {
      pag = page;
      const params = buildParams(page);
      try {
        const dataRes = await apiFetch(`/taller/cobranza?${params}`).then(r => safeJson(r));
        renderTabla(dataRes);
      } catch (e) {
        console.error("Error cobranza tabla:", e);
      }
    }

    async function cargarResumen() {
      try {
        const f = leerFiltros();
        const desc = document.getElementById("fc-descartados")?.checked ? "1" : "0";
        const res = await apiFetch(`/taller/cobranza/resumen?localidad=${encodeURIComponent(f.localidad)}&incluir_descartados=${desc}`).then(r => safeJson(r));
        renderResumen(res);
      } catch (e) {
        console.error("Error cobranza resumen:", e);
      }
    }

    function renderTabla(data) {
      const tbody = document.getElementById("tbody-cobranza");
      const count = document.getElementById("cobro-tabla-count");
      const historicos = data?.historicos || [];
      const docs = data?.documentos || [];
      if (!docs.length && !historicos.length) {
        tbody.innerHTML = `<tr><td colspan="14" class="empty-cell" style="padding:40px;">Sin documentos</td></tr>`;
        count.textContent = "0 documentos";
        document.getElementById("pag-cobranza").innerHTML = "";
        return;
      }
      totalPag = data.totalPaginas || 1;
      const histTxt = historicos.length ? ` + ${historicos.length} cobrados históricos` : "";
      count.textContent = `${data.total} documentos${histTxt} · Página ${data.pagina} de ${totalPag}`;

      function renderRow(d) {
        const ec = estadoCobro(d);
        const c = COLORES_COBRO[ec] || COLORES_COBRO.SIN_INFO;
        const descartado = ec === "DESCARTADO";
        return `<tr style="background:${c.bg};${descartado?'opacity:.6;':''}border-left:3px solid ${c.border};">
          <td><strong>${d.numero_documento||""}</strong></td>
          <td>${d.numero_orden||'<span style="color:#9ca3af">—</span>'}</td>
          <td>${d.centro_costos||""}</td>
          <td class="tc-cliente">${d.cliente||""}</td>
          <td>${d.placa||'<span style="color:#9ca3af">—</span>'}</td>
          <td class="tc-aseg">${d.aseguradora||'<span style="color:#9ca3af">—</span>'}</td>
          <td class="num-right">${fmtM(d.cargos)}</td>
          <td class="num-right" style="color:${c.text}">${fmtM(d.cobrado)}</td>
          <td class="num-right">${fmtM(d.retencion)}</td>
          <td class="num-right">${fmtM(d.n_credito)}</td>
          <td class="num-right" style="font-weight:700;color:${c.text}">${fmtM(d.saldo)}</td>
          <td>${fmtD(d.fecha_emision)}</td>
          <td class="num-right" style="color:${(d.dias||0)>90?'#dc2626':(d.dias||0)>30?'#d97706':'inherit'}">${d.dias??'—'}</td>
          <td><span style="padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;color:${c.text};background:${c.badge}">${ec}</span></td>
        </tr>`;
      }
      let html = docs.map(renderRow).join("");
      if (historicos.length) {
        html += `<tr style="background:#eff6ff;"><td colspan="14" style="padding:8px 12px;font-weight:700;color:#2563eb;font-size:12px;text-align:center;">
          COBRADOS HISTÓRICOS (${historicos.length}) — Facturas cobradas antes del registro en el sistema
        </td></tr>`;
        html += historicos.map(renderRow).join("");
      }
      tbody.innerHTML = html;

      // Paginación
      const pagEl = document.getElementById("pag-cobranza");
      if (totalPag <= 1) { pagEl.innerHTML = ""; return; }
      pagEl.innerHTML = `
        <button class="btn-sm btn-sm-sec" ${pag<=1?'disabled':''} id="cobro-prev">← Anterior</button>
        <span style="font-size:12px;color:var(--text-light)">Pág ${pag} de ${totalPag}</span>
        <button class="btn-sm btn-sm-sec" ${pag>=totalPag?'disabled':''} id="cobro-next">Siguiente →</button>`;
      document.getElementById("cobro-prev")?.addEventListener("click", () => cargar(pag - 1));
      document.getElementById("cobro-next")?.addEventListener("click", () => cargar(pag + 1));
    }

    function renderResumen(res) {
      if (!res) return;
      const c = res.cards || {};

      // Cards
      const histCount = parseInt(c.historico_count) || 0;
      document.getElementById("cc-total").textContent     = (parseInt(c.total)||0) + histCount;
      document.getElementById("cc-cobrado").textContent   = (parseInt(c.cobrado)||0) + histCount;
      document.getElementById("cc-parcial").textContent   = c.parcial ?? "—";
      document.getElementById("cc-pendiente").textContent = c.pendiente ?? "—";
      const histEl = document.getElementById("cc-historico");
      if (histEl) histEl.textContent = histCount;

      // Totales financieros
      const tc = parseFloat(c.total_cargos)||0;
      const tb = parseFloat(c.total_cobrado)||0;
      const pct = tc > 0 ? ((tb / tc) * 100).toFixed(1) : "0.0";
      document.getElementById("cf-cargos").textContent    = fmtM(c.total_cargos);
      document.getElementById("cf-cobrado").textContent   = fmtM(c.total_cobrado);
      document.getElementById("cf-retencion").textContent = fmtM(c.total_retencion);
      document.getElementById("cf-ncredito").textContent  = fmtM(c.total_n_credito);
      document.getElementById("cf-saldo").textContent     = fmtM(c.total_saldo);
      document.getElementById("cf-pct").textContent       = pct + "%";

      renderCharts(res);
    }

    function renderCharts(res) {
      const c = res.cards || {};

      // Donut: estado de cobro
      if (chartEstado) chartEstado.destroy();
      const ctxE = document.getElementById("chart-cobro-estado");
      if (ctxE) {
        chartEstado = new Chart(ctxE, {
          type: "doughnut",
          data: {
            labels: ["Cobrado", "Parcial", "Pendiente"],
            datasets: [{
              data: [parseInt(c.cobrado)||0, parseInt(c.parcial)||0, parseInt(c.pendiente)||0],
              backgroundColor: ["#22c55e","#f59e0b","#ef4444"],
              borderWidth: 1,
            }],
          },
          options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:"bottom",labels:{font:{size:11}}}} },
        });
      }

      // Barras: saldo por aseguradora
      if (chartAseg) chartAseg.destroy();
      const ctxA = document.getElementById("chart-cobro-aseg");
      const aseg = res.por_aseguradora || [];
      if (ctxA && aseg.length) {
        chartAseg = new Chart(ctxA, {
          type: "bar",
          data: {
            labels: aseg.map(a => {
              const lbl = a.aseguradora || "(sin aseg.)";
              return lbl.length > 25 ? lbl.slice(0,22)+"…" : lbl;
            }),
            datasets: [{
              label: "Saldo Pendiente",
              data: aseg.map(a => parseFloat(a.saldo_pendiente)||0),
              backgroundColor: "rgba(239,68,68,.7)",
              borderColor: "#ef4444",
              borderWidth: 1,
            }],
          },
          options: {
            indexAxis: "y", responsive:true, maintainAspectRatio:false,
            plugins:{legend:{display:false}},
            scales:{x:{ticks:{callback:v=>"$"+v.toLocaleString("es-EC")}}},
          },
        });
      }

      // Barras: antigüedad
      if (chartAntiguedad) chartAntiguedad.destroy();
      const ctxAnt = document.getElementById("chart-cobro-antiguedad");
      const ant = res.antiguedad || {};
      if (ctxAnt) {
        chartAntiguedad = new Chart(ctxAnt, {
          type: "bar",
          data: {
            labels: ["> 90 días", "31-90 días", "1-30 días", "Al día"],
            datasets: [{
              label: "Saldo",
              data: [
                parseFloat(ant.monto_mas_90)||0,
                parseFloat(ant.monto_31_90)||0,
                parseFloat(ant.monto_1_30)||0,
                parseFloat(ant.monto_al_dia)||0,
              ],
              backgroundColor: ["#ef4444","#f59e0b","#fbbf24","#86efac"],
              borderWidth: 1,
            }],
          },
          options: {
            responsive:true, maintainAspectRatio:false,
            plugins:{legend:{display:false}},
            scales:{y:{ticks:{callback:v=>"$"+v.toLocaleString("es-EC")}}},
          },
        });
      }
    }

    async function exportarExcel() {
      const btn = document.getElementById("btn-export-cobranza");
      if (!btn) return;
      btn.disabled = true; btn.textContent = "⏳ Generando...";
      try {
        const params = buildParams(1);
        params.delete("page"); params.delete("limit");
        const token = localStorage.getItem("token");
        const url = `${API_BASE_URL}/taller/cobranza/exportar?${params}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error("Error del servidor");
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `cobranza-taller-${new Date().toISOString().slice(0,10)}.xlsx`;
        a.click();
      } catch (e) {
        Swal.fire("Error", "No se pudo generar el Excel de cobranza.", "error");
      } finally {
        btn.disabled = false; btn.textContent = "⬇ Excel Cobranza";
      }
    }

    function switchToCobranzaTab() {
      document.querySelectorAll(".taller-tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".taller-tab-panel").forEach(p => p.classList.remove("active"));
      const tabBtn = document.querySelector('.taller-tab[data-tab="cobranza"]');
      if (tabBtn) tabBtn.classList.add("active");
      document.getElementById("panel-cobranza")?.classList.add("active");
    }

    function initEvents() {
      document.getElementById("cobro-cards")?.addEventListener("click", e => {
        const btn = e.target.closest("[data-cobro-card]");
        if (!btn) return;
        const val = btn.dataset.cobroCard;
        if (_cardCobro === val) {
          _cardCobro = null;
          btn.classList.remove("card-activa");
          document.getElementById("cobro-cards").classList.remove("cards-con-activa");
        } else {
          _cardCobro = val;
          document.getElementById("cobro-cards").querySelectorAll("[data-cobro-card]").forEach(b => b.classList.remove("card-activa"));
          btn.classList.add("card-activa");
          document.getElementById("cobro-cards").classList.add("cards-con-activa");
        }
        switchToCobranzaTab();
        cargar(1);
      });

      document.getElementById("fc-tiene-orden")?.addEventListener("change", () => cargar(1));
      document.getElementById("fc-descartados")?.addEventListener("change", () => cargar(1));
      document.getElementById("btn-export-cobranza")?.addEventListener("click", exportarExcel);
    }

    return { cargar, cargarResumen, initEvents };
  })();

  // ── Init ──────────────────────────────────────────
  function init() {
    // Tabs — al cambiar de pestaña, recargar con filtros actuales
    document.querySelectorAll(".taller-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".taller-tab").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".taller-tab-panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
        if (btn.dataset.tab === "resumen")   cargarResumen();
        if (btn.dataset.tab === "dashboard") { DASH.cargar(); COBRO.cargarResumen(); }
        if (btn.dataset.tab === "ordenes")   cargarOrdenes(1);
        if (btn.dataset.tab === "cobranza")  COBRO.cargar(1);
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

    // ── Buscar: desactiva card y recarga la pestaña activa ──
    document.getElementById("btn-filtrar").addEventListener("click", () => {
      _cardActiva = null;
      document.getElementById("cards-estado").querySelectorAll(".estado-card").forEach(b => b.classList.remove("card-activa"));
      document.getElementById("cards-estado").classList.remove("cards-con-activa");
      recargarTabActiva();
    });

    // ── Limpiar: vacía todos los campos y recarga ──
    document.getElementById("btn-limpiar").addEventListener("click", () => {
      _cardActiva = null;
      document.getElementById("cards-estado").querySelectorAll(".estado-card").forEach(b => b.classList.remove("card-activa"));
      document.getElementById("cards-estado").classList.remove("cards-con-activa");
      document.getElementById("f-localidad").value = "";
      ["f-orden","f-placa","f-cliente","f-desde","f-hasta"].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = "";
      });
      const cbObs = document.getElementById("f-con-obs"); if (cbObs) cbObs.checked = false;
      msOrdEstado?.clear(); msOrdAseg?.clear(); msOrdProceso?.clear();
      cargarFiltros("");
      cargarCards("");
      recargarTabActiva();
    });

    // Localidad — un solo selector, recarga tarjetas + pestaña activa
    document.getElementById("f-localidad")?.addEventListener("change", e => {
      const val = e.target.value;
      cargarFiltros(val);
      cargarCards(val);
      recargarTabActiva();
    });

    // Paginación
    document.getElementById("btn-prev").addEventListener("click", () => {
      if (paginaActual > 1) cargarOrdenes(paginaActual - 1);
    });
    document.getElementById("btn-next").addEventListener("click", () => {
      if (paginaActual < totalPaginas) cargarOrdenes(paginaActual + 1);
    });

    // Columnas y exportar
    initColumnToggle();
    document.getElementById("btn-export-csv")?.addEventListener("click", exportarCSV);
    document.getElementById("btn-export-excel")?.addEventListener("click", exportarExcel);

    // Inicializar MultiSelects compartidos
    msOrdEstado  = new MultiSelect("f-estado",      { placeholder: "Todos" });
    msOrdAseg    = new MultiSelect("f-aseguradora", { placeholder: "Todas" });
    msOrdProceso = new MultiSelect("f-proceso",     { placeholder: "Todos" });

    // Autocomplete de cliente
    new Autocomplete("f-cliente", { localidadFn: () => document.getElementById("f-localidad")?.value || "" });

    // ── Click en celda de observación: muestra texto completo ──
    document.getElementById("tbody-ordenes")?.addEventListener("click", e => {
      const cell = e.target.closest(".obs-cell");
      if (!cell) return;
      const texto = cell.textContent.trim();
      if (!texto) return;
      const tr = cell.closest("tr");
      const orden = tr?.dataset?.orden || "";
      Swal.fire({
        title: orden ? `Observación — OT ${orden}` : "Observación",
        html: `<p style="text-align:left;white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.6;">${texto.replace(/</g,"&lt;")}</p>`,
        icon: "info",
        confirmButtonText: "Cerrar",
        width: 520,
      });
    });

    // Cobranza events
    COBRO.initEvents();

    // Carga inicial
    cargarFiltros();
    cargarCards();
    cargarOrdenes(1);
  }

  document.addEventListener("DOMContentLoaded", init);

  return { editarOrden };
})();
