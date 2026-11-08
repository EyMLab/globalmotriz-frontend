// =====================================================
// facturacion.js — Módulo Facturación (IIFE)
// =====================================================
const FACT = (() => {
  "use strict";

  // ── State ──────────────────────────────────────────
  let _pagina = 1, _totalPaginas = 1, _limit = 50;
  let _sortBy = "fecha", _sortDir = "DESC";
  let _cardActiva = "";
  let _filtros = {};
  let _charts = {};

  // ── Column definitions ─────────────────────────────
  const COLS = [
    { id: "numero_factura",  label: "Factura",         def: true  },
    { id: "forma_pago",      label: "Forma Pago",      def: false },
    { id: "cliente",         label: "Cliente",          def: true  },
    { id: "fecha",           label: "Fecha",            def: true  },
    { id: "estado",          label: "Estado",           def: true  },
    { id: "centro_costos",   label: "Localidad",        def: false },
    { id: "total",           label: "Total",            def: true  },
    { id: "pagado",          label: "Pagado",           def: true  },
    { id: "saldo",           label: "Saldo",            def: true  },
    { id: "iva",             label: "IVA",              def: false },
    { id: "descuento",       label: "Descuento",        def: false },
    { id: "subtotal_iva",    label: "Sub Total IVA",    def: false },
    { id: "total_servicios", label: "Servicios",        def: false },
    { id: "total_producto",  label: "Producto",         def: false },
    { id: "total_terceros",  label: "Terceros",         def: false },
    { id: "ot_taller",       label: "OT Taller",        def: true  },
    { id: "placa",           label: "Placa",            def: true  },
    { id: "observacion",     label: "Observación",      def: false },
    { id: "motivo_anulacion",label: "Motivo Anulación", def: false },
    { id: "cxc",             label: "CxC",              def: true  },
  ];
  const colVisible = {};
  COLS.forEach(c => { colVisible[c.id] = c.def; });

  // ── DOM refs ───────────────────────────────────────
  const $ = id => document.getElementById(id);

  // ── Formatting helpers ─────────────────────────────
  const fmt  = n => parseFloat(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtD = v => { if (!v) return "—"; const s = String(v).slice(0,10); const d = new Date(s + "T00:00:00"); return isNaN(d) ? "—" : d.toLocaleDateString("es-EC"); };

  // ── Read current filter values from DOM ────────────
  function leerFiltros() {
    return {
      estado:        $("f-estado")?.value      || "",
      centro_costos: $("f-centro")?.value      || "",
      forma_pago:    $("f-forma-pago")?.value   || "",
      cliente:       $("f-cliente")?.value      || "",
      placa:         $("f-placa")?.value        || "",
      ot_taller:     $("f-ot")?.value           || "",
      fecha_desde:   $("f-desde")?.value        || "",
      fecha_hasta:   $("f-hasta")?.value        || "",
    };
  }

  // ── Build query string from filter object ──────────
  function filtrosQS(filtros, extras) {
    const p = new URLSearchParams();
    const all = { ...filtros, ...extras };
    for (const [k, v] of Object.entries(all)) { if (v) p.set(k, v); }
    return p.toString();
  }

  // =====================================================
  // INIT
  // =====================================================
  document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initFiltros();
    initCards();
    initImport();
    initColumnToggle();
    $("btn-excel-docs")?.addEventListener("click", descargarExcel);
    $("btn-filtrar")?.addEventListener("click", () => { _pagina = 1; cargar(); });
    $("btn-limpiar")?.addEventListener("click", limpiarFiltros);
    $("btn-prev-doc")?.addEventListener("click", () => { if (_pagina > 1) { _pagina--; cargarDocs(); } });
    $("btn-next-doc")?.addEventListener("click", () => { if (_pagina < _totalPaginas) { _pagina++; cargarDocs(); } });
    cargarFiltros();
    cargar();
  });

  // ── Column toggle ─────────────────────────────────
  function initColumnToggle() {
    const checksEl = $("cols-checks");
    if (!checksEl) return;

    checksEl.innerHTML = COLS.map(c =>
      `<label><input type="checkbox" data-colid="${c.id}" ${colVisible[c.id] ? "checked" : ""}> ${c.label}</label>`
    ).join("");

    checksEl.addEventListener("change", e => {
      const cb = e.target;
      if (!cb.dataset.colid) return;
      colVisible[cb.dataset.colid] = cb.checked;
      aplicarColumnas();
    });

    $("btn-cols")?.addEventListener("click", e => {
      e.stopPropagation();
      $("cols-panel")?.classList.toggle("open");
    });
    document.addEventListener("click", e => {
      if (!e.target.closest("#cols-panel") && !e.target.closest("#btn-cols")) {
        $("cols-panel")?.classList.remove("open");
      }
    });

    $("cols-all")?.addEventListener("click", e => {
      e.preventDefault();
      COLS.forEach(c => { colVisible[c.id] = true; });
      checksEl.querySelectorAll("input").forEach(cb => { cb.checked = true; });
      aplicarColumnas();
    });
    $("cols-default")?.addEventListener("click", e => {
      e.preventDefault();
      COLS.forEach(c => { colVisible[c.id] = c.def; });
      checksEl.querySelectorAll("input").forEach(cb => { cb.checked = colVisible[cb.dataset.colid]; });
      aplicarColumnas();
    });

    aplicarColumnas();
  }

  function aplicarColumnas() {
    COLS.forEach(col => {
      const show = colVisible[col.id];
      document.querySelectorAll(`[data-col="${col.id}"]`).forEach(el => {
        el.style.display = show ? "" : "none";
      });
    });
  }

  // ── Tabs ───────────────────────────────────────────
  function initTabs() {
    document.querySelectorAll(".prov-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".prov-tab").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".prov-tab-panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        const panel = $(`panel-${btn.dataset.tab}`);
        if (panel) panel.classList.add("active");
        if (btn.dataset.tab === "dashboard") cargarDashboard();
      });
    });
  }

  // ── Load filter dropdowns ──────────────────────────
  async function cargarFiltros() {
    try {
      const res = await apiFetch("/facturacion/filtros");
      if (!res.ok) return;
      const data = await safeJson(res);
      _filtros = data;

      const selCentro = $("f-centro");
      const prevCentro = selCentro?.value;
      if (selCentro) {
        selCentro.innerHTML = '<option value="">Todos</option>';
        (data.centros || []).forEach(c => { selCentro.innerHTML += `<option value="${c}">${c}</option>`; });
        if (prevCentro) selCentro.value = prevCentro;
      }

      const selFP = $("f-forma-pago");
      const prevFP = selFP?.value;
      if (selFP) {
        selFP.innerHTML = '<option value="">Todos</option>';
        (data.formas_pago || []).forEach(f => { selFP.innerHTML += `<option value="${f}">${f}</option>`; });
        if (prevFP) selFP.value = prevFP;
      }
    } catch (e) { console.error("Error cargando filtros:", e); }
  }

  // ── Client autocomplete ────────────────────────────
  function initFiltros() {
    const inp = $("f-cliente");
    const dd  = $("cli-dropdown");
    if (!inp || !dd) return;

    inp.addEventListener("input", debounce(() => {
      const q = inp.value.trim().toLowerCase();
      if (!q || q.length < 2) { dd.style.display = "none"; return; }
      const matches = (_filtros.clientes || []).filter(c => c.toLowerCase().includes(q)).slice(0, 15);
      if (!matches.length) { dd.style.display = "none"; return; }
      dd.innerHTML = matches.map(c => `<div class="prov-suggestion">${c}</div>`).join("");
      dd.style.display = "block";
      dd.querySelectorAll(".prov-suggestion").forEach(el => {
        el.addEventListener("click", () => { inp.value = el.textContent; dd.style.display = "none"; });
      });
    }, 200));

    document.addEventListener("click", e => { if (!e.target.closest("#f-cliente") && !e.target.closest("#cli-dropdown")) dd.style.display = "none"; });
  }

  // ── Cards (Autorizado / Anulado) ───────────────────
  function initCards() {
    document.querySelectorAll("#cards-estado .estado-card").forEach(card => {
      card.addEventListener("click", () => {
        const val = card.dataset.card;
        if (_cardActiva === val) {
          _cardActiva = "";
          $("f-estado").value = "";
        } else {
          _cardActiva = val;
          $("f-estado").value = val;
        }
        renderCardActiva();
        _pagina = 1;
        cargar();
      });
    });
  }

  function renderCardActiva() {
    const container = $("cards-estado");
    container.classList.toggle("cards-con-activa", !!_cardActiva);
    container.querySelectorAll(".estado-card").forEach(c => {
      c.classList.toggle("card-activa", c.dataset.card === _cardActiva);
    });
  }

  async function actualizarCards() {
    try {
      const f = leerFiltros();
      const qs = filtrosQS({ ...f, estado: "" });
      const res = await apiFetch(`/facturacion/cards?${qs}`);
      if (!res.ok) return;
      const data = await safeJson(res);
      const map = {};
      (data.cards || []).forEach(c => { map[c.estado] = c; });

      const aut = map["Autorizado"]  || { cantidad: 0, monto: 0 };
      const anu = map["Anulado"]     || { cantidad: 0, monto: 0 };
      const des = map["Descartado"]  || { cantidad: 0, monto: 0 };

      $("ec-n-autorizado").textContent  = aut.cantidad;
      $("ec-m-autorizado").textContent  = `$${fmt(aut.monto)}`;
      $("ec-n-anulado").textContent     = anu.cantidad;
      $("ec-m-anulado").textContent     = `$${fmt(anu.monto)}`;
      $("ec-n-descartado").textContent  = des.cantidad;
      $("ec-m-descartado").textContent  = `$${fmt(des.monto)}`;

      $("c-total-fact").textContent = aut.cantidad + anu.cantidad + des.cantidad;
    } catch (e) { console.error("Error cards:", e); }
  }

  // ── Main load ──────────────────────────────────────
  function cargar() {
    cargarDocs();
    actualizarCards();
    if (document.querySelector('.prov-tab[data-tab="dashboard"]')?.classList.contains("active")) {
      cargarDashboard();
    }
  }

  // ── Load documents ─────────────────────────────────
  async function cargarDocs() {
    try {
      const f = leerFiltros();
      const qs = filtrosQS(f, { sort_by: _sortBy, sort_dir: _sortDir, page: _pagina, limit: _limit });
      const res = await apiFetch(`/facturacion/documentos?${qs}`);
      if (!res.ok) { $("tbody-docs").innerHTML = `<tr><td colspan="21" style="text-align:center;padding:32px;color:var(--text-light)">Error al cargar.</td></tr>`; return; }
      const data = await safeJson(res);

      _totalPaginas = data.totalPaginas || 1;
      $("pag-info-doc").textContent = `Página ${data.pagina} de ${_totalPaginas}`;
      $("btn-prev-doc").disabled = data.pagina <= 1;
      $("btn-next-doc").disabled = data.pagina >= _totalPaginas;

      if (!data.documentos.length) {
        $("tbody-docs").innerHTML = `<tr><td colspan="21" style="text-align:center;padding:32px;color:var(--text-light)">Sin facturas.</td></tr>`;
        return;
      }

      $("tbody-docs").innerHTML = data.documentos.map(d => {
        const estUp = (d.estado || "").toUpperCase();
        const estadoCls = estUp === "ANULADO" ? "badge-anulado" : estUp === "DESCARTADO" ? "badge-descartado" : "badge-autorizado";
        const otLink = d.ot_taller
          ? `<a class="link-modulo" href="control-taller.html?orden=${encodeURIComponent(d.ot_taller)}" target="_blank">${esc(d.ot_taller)}</a>`
          : "—";
        return `<tr>
          <td data-col="numero_factura">${esc(d.numero_factura)}</td>
          <td data-col="forma_pago">${esc(d.forma_pago)}</td>
          <td data-col="cliente">${esc(d.cliente)}</td>
          <td data-col="fecha">${fmtD(d.fecha)}</td>
          <td data-col="estado" style="text-align:center"><span class="badge-estado ${estadoCls}">${esc(d.estado)}</span></td>
          <td data-col="centro_costos" style="text-align:center">${esc(d.centro_costos)}</td>
          <td data-col="total" class="num-right">$${fmt(d.total)}</td>
          <td data-col="pagado" class="num-right">$${fmt(d.pagado)}</td>
          <td data-col="saldo" class="num-right">$${fmt(d.saldo)}</td>
          <td data-col="iva" class="num-right">$${fmt(d.iva)}</td>
          <td data-col="descuento" class="num-right">$${fmt(d.descuento)}</td>
          <td data-col="subtotal_iva" class="num-right">$${fmt(d.subtotal_iva)}</td>
          <td data-col="total_servicios" class="num-right">$${fmt(d.total_servicios)}</td>
          <td data-col="total_producto" class="num-right">$${fmt(d.total_producto)}</td>
          <td data-col="total_terceros" class="num-right">$${fmt(d.total_terceros)}</td>
          <td data-col="ot_taller">${otLink}</td>
          <td data-col="placa">${esc(d.placa)}</td>
          <td data-col="observacion" style="max-width:150px;overflow:hidden;text-overflow:ellipsis" title="${esc(d.observacion)}">${esc(d.observacion)}</td>
          <td data-col="motivo_anulacion" style="max-width:150px;overflow:hidden;text-overflow:ellipsis" title="${esc(d.motivo_anulacion)}">${esc(d.motivo_anulacion)}</td>
          <td data-col="cxc" style="text-align:center">${renderCxC(d)}</td>
          <td style="text-align:center">${renderAccion(d)}</td>
        </tr>`;
      }).join("");

      aplicarColumnas();

    } catch (e) {
      console.error("Error cargando docs:", e);
      $("tbody-docs").innerHTML = `<tr><td colspan="21" style="text-align:center;padding:32px;color:var(--text-light)">Error al cargar.</td></tr>`;
    }
  }

  function esc(s) { return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

  function renderCxC(d) {
    if (!d.cxc_id) return '<span style="color:var(--text-light);font-size:11px">—</span>';
    const est = (d.cxc_estado || "").toUpperCase();
    let cls = "badge-cxc-activo", label = "Pendiente";
    if (est === "COBRADO")    { cls = "badge-cxc-cobrado";    label = "Cobrado"; }
    if (est === "DESCARTADO") { cls = "badge-cxc-descartado"; label = "Descartado"; }
    const saldo = d.cxc_saldo ? ` $${fmt(d.cxc_saldo)}` : "";
    return `<a class="link-modulo" href="clientes.html?buscar=${encodeURIComponent(d.cliente)}" target="_blank" title="Ver en CxC: ${esc(d.cliente)}"><span class="badge-cxc ${cls}">${label}${saldo}</span></a>`;
  }

  function renderAccion(d) {
    const estUp = (d.estado || "").toUpperCase();
    if (estUp === "DESCARTADO") {
      return `<button class="btn-restaurar" onclick="FACT.cambiarEstado(${d.id},'Autorizado')">Restaurar</button>`;
    }
    return `<button class="btn-descartar" onclick="FACT.cambiarEstado(${d.id},'Descartado')">Descartar</button>`;
  }

  async function cambiarEstado(id, nuevoEstado) {
    const accion = nuevoEstado === "Descartado" ? "descartar" : "restaurar";
    const { isConfirmed } = await Swal.fire({
      title: `¿${accion.charAt(0).toUpperCase() + accion.slice(1)} esta factura?`,
      text: nuevoEstado === "Descartado"
        ? "No se tomará en cuenta en totales ni reportes."
        : "Volverá a contarse normalmente.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: `Sí, ${accion}`,
      cancelButtonText: "Cancelar",
    });
    if (!isConfirmed) return;
    try {
      const res = await apiFetch(`/facturacion/facturas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      if (!res.ok) { const e = await safeJson(res); Swal.fire("Error", e.error || "No se pudo actualizar.", "error"); return; }
      cargar();
    } catch (e) { Swal.fire("Error", e.message, "error"); }
  }

  // ── Sorting ────────────────────────────────────────
  function ordenar(col) {
    if (_sortBy === col) { _sortDir = _sortDir === "ASC" ? "DESC" : "ASC"; }
    else { _sortBy = col; _sortDir = "ASC"; }

    document.querySelectorAll(".sortable").forEach(th => {
      th.classList.remove("sort-asc", "sort-desc");
      if (th.dataset.sort === _sortBy) {
        th.classList.add(_sortDir === "ASC" ? "sort-asc" : "sort-desc");
      }
    });
    _pagina = 1;
    cargarDocs();
  }

  // ── Limpiar filtros ────────────────────────────────
  function limpiarFiltros() {
    $("f-estado").value     = "";
    $("f-centro").value     = "";
    $("f-forma-pago").value = "";
    $("f-cliente").value    = "";
    $("f-placa").value      = "";
    $("f-ot").value         = "";
    $("f-desde").value      = "";
    $("f-hasta").value      = "";
    _cardActiva = "";
    renderCardActiva();
    _pagina = 1;
    cargar();
  }

  // ── Import ─────────────────────────────────────────
  function initImport() {
    $("btn-importar-fact")?.addEventListener("click", async () => {
      const { value: file } = await Swal.fire({
        title: "Importar Facturas",
        text: "Sube el archivo Excel del reporte de facturación.",
        input: "file",
        inputAttributes: { accept: ".xlsx,.xls", "aria-label": "Archivo Excel" },
        showCancelButton: true,
        confirmButtonText: "Importar",
        showLoaderOnConfirm: true,
        preConfirm: (f) => {
          if (!f) { Swal.showValidationMessage("Selecciona un archivo"); return false; }
          return f;
        },
        allowOutsideClick: () => !Swal.isLoading(),
      });
      if (!file) return;

      const fd = new FormData();
      fd.append("reporte", file);
      try {
        Swal.fire({ title: "Importando…", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await apiFetch("/facturacion/importar", { method: "POST", body: fd, raw: true });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data?.error || "Error al importar");
        await Swal.fire("Listo", `Nuevos: ${data.nuevos} | Actualizados: ${data.actualizados}`, "success");
        cargarFiltros();
        cargar();
      } catch (e) {
        Swal.fire("Error", e.message, "error");
      }
    });
  }

  // ── Excel export ───────────────────────────────────
  async function descargarExcel() {
    try {
      const f = leerFiltros();
      const qs = filtrosQS(f, { sort_by: _sortBy, sort_dir: _sortDir, page: 1, limit: 99999 });
      const res = await apiFetch(`/facturacion/documentos?${qs}`);
      if (!res.ok) return;
      const data = await safeJson(res);
      if (!data.documentos.length) { Swal.fire("Sin datos", "No hay facturas para exportar.", "info"); return; }

      const headers = ["Factura","Forma Pago","Cliente","Fecha","Estado","Localidad",
        "Sub Total IVA","IVA","Total","Pagado","Saldo","Descuento",
        "Tot. Servicios","Tot. Producto","Tot. Terceros","OT Taller","Placa","Observación","Motivo Anulación"];
      const rows = data.documentos.map(d => [
        d.numero_factura, d.forma_pago, d.cliente, d.fecha, d.estado, d.centro_costos,
        +d.subtotal_iva, +d.iva, +d.total, +d.pagado, +d.saldo, +d.descuento,
        +d.total_servicios, +d.total_producto, +d.total_terceros,
        d.ot_taller, d.placa, d.observacion, d.motivo_anulacion,
      ]);
      const aoa = [headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = headers.map((h, i) => {
        let max = h.length;
        rows.forEach(r => { const l = String(r[i] ?? "").length; if (l > max) max = l; });
        return { wch: Math.min(max + 2, 40) };
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Facturas");
      XLSX.writeFile(wb, `Facturacion_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch (e) { console.error("Error export:", e); }
  }

  // =====================================================
  // DASHBOARD
  // =====================================================
  async function cargarDashboard() {
    try {
      const f = leerFiltros();
      const qs = filtrosQS({ ...f, estado: "" });
      const res = await apiFetch(`/facturacion/dashboard?${qs}`);
      if (!res.ok) return;
      const data = await safeJson(res);
      const t = data.totales;

      const card = c => `<div class="dash-fin-card"><div class="dfn">${c.n}</div><div class="dfl">${c.l}</div></div>`;
      $("dash-fin-row1").innerHTML = [
        { n: t.total_facturas, l: "Facturas" },
        { n: `$${fmt(t.total_facturado)}`, l: "Total Facturado" },
        { n: `$${fmt(t.total_pagado)}`, l: "Total Pagado" },
        { n: `$${fmt(t.total_saldo)}`, l: "Saldo Pendiente" },
        { n: t.autorizados, l: "Autorizados" },
        { n: t.anulados, l: "Anulados" },
      ].map(card).join("");
      $("dash-fin-row2").innerHTML = [
        { n: `$${fmt(t.total_servicios)}`, l: "Servicios" },
        { n: `$${fmt(t.total_producto)}`, l: "Producto" },
        { n: `$${fmt(t.total_terceros)}`, l: "Terceros" },
      ].map(card).join("");

      Object.values(_charts).forEach(c => c.destroy());
      _charts = {};

      const COLORS = ["#2B7A9E","#38bdf8","#f59e0b","#10b981","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#6366f1","#84cc16","#a855f7","#06b6d4","#e11d48","#22d3ee"];

      if (data.por_mes?.length) {
        _charts.mes = new Chart($("chart-mes"), {
          type: "bar",
          data: { labels: data.por_mes.map(m => m.mes), datasets: [{ label: "Facturado", data: data.por_mes.map(m => +m.total_facturado), backgroundColor: "#2B7A9E" }] },
          options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
        });
      }

      if (data.por_aseguradora?.length) {
        const asegData = [...data.por_aseguradora];
        const tp = data.total_particulares || { cantidad: 0, total_facturado: 0 };
        if (+tp.total_facturado > 0) asegData.push({ cliente: "PARTICULARES", cantidad: tp.cantidad, total_facturado: tp.total_facturado });
        asegData.sort((a, b) => +b.total_facturado - +a.total_facturado);
        _charts.aseguradoras = new Chart($("chart-aseguradoras"), {
          type: "bar",
          data: { labels: asegData.map(c => c.cliente.substring(0, 25)), datasets: [{ label: "Facturado", data: asegData.map(c => +c.total_facturado), backgroundColor: COLORS }] },
          options: { indexAxis: "y", responsive: true, plugins: { legend: { display: false } } },
        });
      }

      if (data.por_particular?.length) {
        _charts.particulares = new Chart($("chart-particulares"), {
          type: "bar",
          data: { labels: data.por_particular.map(c => c.cliente.substring(0, 25)), datasets: [{ label: "Facturado", data: data.por_particular.map(c => +c.total_facturado), backgroundColor: COLORS }] },
          options: { indexAxis: "y", responsive: true, plugins: { legend: { display: false } } },
        });
      }

      const pctLegendOpts = {
        labels: {
          generateLabels(ch) {
            const ds = ch.data.datasets[0];
            const total = ds.data.reduce((a, b) => a + b, 0);
            return ch.data.labels.map((l, i) => {
              const pct = total ? ((ds.data[i] / total) * 100).toFixed(1) : "0.0";
              return {
                text: `${l}  ${pct}%`,
                fillStyle: ds.backgroundColor[i],
                strokeStyle: ds.backgroundColor[i],
                hidden: !ch.getDataVisibility(i),
                index: i,
              };
            });
          },
        },
      };

      _charts.desglose = new Chart($("chart-desglose"), {
        type: "doughnut",
        data: { labels: ["Servicios", "Producto", "Terceros"], datasets: [{ data: [+t.total_servicios, +t.total_producto, +t.total_terceros], backgroundColor: ["#2B7A9E","#f59e0b","#10b981"] }] },
        options: { responsive: true, plugins: { legend: pctLegendOpts } },
      });

      if (data.por_forma_pago?.length) {
        _charts.formaPago = new Chart($("chart-forma-pago"), {
          type: "pie",
          data: { labels: data.por_forma_pago.map(f => f.forma_pago || "Sin dato"), datasets: [{ data: data.por_forma_pago.map(f => +f.total_facturado), backgroundColor: COLORS }] },
          options: { responsive: true, plugins: { legend: pctLegendOpts } },
        });
      }

      if (data.por_centro?.length) {
        _charts.localidad = new Chart($("chart-localidad"), {
          type: "doughnut",
          data: { labels: data.por_centro.map(c => c.centro_costos || "Sin dato"), datasets: [{ data: data.por_centro.map(c => +c.total_facturado), backgroundColor: COLORS }] },
          options: { responsive: true, plugins: { legend: pctLegendOpts } },
        });
      }

    } catch (e) { console.error("Error dashboard:", e); }
  }

  return { ordenar, cambiarEstado };
})();
