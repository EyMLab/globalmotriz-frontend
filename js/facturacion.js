// =====================================================
// facturacion.js — Módulo Facturación (IIFE)
// =====================================================
const FACT = (() => {
  "use strict";

  // ── State ──────────────────────────────────────────
  let _pagina = 1, _totalPaginas = 1, _limit = 50;
  let _sortBy = "fecha", _sortDir = "DESC";
  let _cardActiva = "";
  let _filtros = {};  // cached filter values from DB
  let _charts = {};

  // ── DOM refs ───────────────────────────────────────
  const $ = id => document.getElementById(id);

  // ── Formatting helpers ─────────────────────────────
  const fmt  = n => parseFloat(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtD = v => { if (!v) return "—"; const d = new Date(v + "T00:00:00"); return isNaN(d) ? "—" : d.toLocaleDateString("es-EC"); };

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
    $("btn-excel-docs")?.addEventListener("click", descargarExcel);
    $("btn-filtrar")?.addEventListener("click", () => { _pagina = 1; cargar(); });
    $("btn-limpiar")?.addEventListener("click", limpiarFiltros);
    $("btn-prev-doc")?.addEventListener("click", () => { if (_pagina > 1) { _pagina--; cargarDocs(); } });
    $("btn-next-doc")?.addEventListener("click", () => { if (_pagina < _totalPaginas) { _pagina++; cargarDocs(); } });
    cargarFiltros();
    cargar();
  });

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
      const qs = filtrosQS({ ...f, estado: "" }); // cards count across all estados
      const res = await apiFetch(`/facturacion/cards?${qs}`);
      if (!res.ok) return;
      const data = await safeJson(res);
      const map = {};
      (data.cards || []).forEach(c => { map[c.estado] = c; });

      const aut = map["Autorizado"] || { cantidad: 0, monto: 0 };
      const anu = map["Anulado"]    || { cantidad: 0, monto: 0 };

      $("ec-n-autorizado").textContent = aut.cantidad;
      $("ec-m-autorizado").textContent = `$${fmt(aut.monto)}`;
      $("ec-n-anulado").textContent    = anu.cantidad;
      $("ec-m-anulado").textContent    = `$${fmt(anu.monto)}`;

      $("c-total-fact").textContent = aut.cantidad + anu.cantidad;
    } catch (e) { console.error("Error cards:", e); }
  }

  // ── Main load ──────────────────────────────────────
  function cargar() {
    cargarDocs();
    actualizarCards();
  }

  // ── Load documents ─────────────────────────────────
  async function cargarDocs() {
    try {
      const f = leerFiltros();
      const qs = filtrosQS(f, { sort_by: _sortBy, sort_dir: _sortDir, page: _pagina, limit: _limit });
      const res = await apiFetch(`/facturacion/documentos?${qs}`);
      if (!res.ok) { $("tbody-docs").innerHTML = `<tr><td colspan="18" style="text-align:center;padding:32px;color:var(--text-light)">Error al cargar.</td></tr>`; return; }
      const data = await safeJson(res);

      _totalPaginas = data.totalPaginas || 1;
      $("pag-info-doc").textContent = `Página ${data.pagina} de ${_totalPaginas}`;
      $("btn-prev-doc").disabled = data.pagina <= 1;
      $("btn-next-doc").disabled = data.pagina >= _totalPaginas;

      if (!data.documentos.length) {
        $("tbody-docs").innerHTML = `<tr><td colspan="18" style="text-align:center;padding:32px;color:var(--text-light)">Sin facturas.</td></tr>`;
        return;
      }

      $("tbody-docs").innerHTML = data.documentos.map(d => {
        const estadoCls = d.estado?.toUpperCase() === "ANULADO" ? "badge-anulado" : "badge-autorizado";
        const otLink = d.ot_taller
          ? `<a class="link-modulo" href="control-taller.html?buscar=${encodeURIComponent(d.ot_taller)}" target="_blank">${esc(d.ot_taller)}</a>`
          : "—";
        return `<tr>
          <td>${esc(d.numero_factura)}</td>
          <td>${esc(d.forma_pago)}</td>
          <td>${esc(d.cliente)}</td>
          <td>${fmtD(d.fecha)}</td>
          <td style="text-align:center"><span class="badge-estado ${estadoCls}">${esc(d.estado)}</span></td>
          <td style="text-align:center">${esc(d.centro_costos)}</td>
          <td class="num-right">$${fmt(d.total)}</td>
          <td class="num-right">$${fmt(d.pagado)}</td>
          <td class="num-right">$${fmt(d.saldo)}</td>
          <td class="num-right">$${fmt(d.iva)}</td>
          <td class="num-right">$${fmt(d.descuento)}</td>
          <td class="num-right">$${fmt(d.total_servicios)}</td>
          <td class="num-right">$${fmt(d.total_producto)}</td>
          <td class="num-right">$${fmt(d.total_terceros)}</td>
          <td>${otLink}</td>
          <td>${esc(d.placa)}</td>
          <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis" title="${esc(d.observacion)}">${esc(d.observacion)}</td>
          <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis" title="${esc(d.motivo_anulacion)}">${esc(d.motivo_anulacion)}</td>
        </tr>`;
      }).join("");

    } catch (e) {
      console.error("Error cargando docs:", e);
      $("tbody-docs").innerHTML = `<tr><td colspan="18" style="text-align:center;padding:32px;color:var(--text-light)">Error al cargar.</td></tr>`;
    }
  }

  function esc(s) { return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

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
      const qs = filtrosQS(f);
      const res = await apiFetch(`/facturacion/dashboard?${qs}`);
      if (!res.ok) return;
      const data = await safeJson(res);
      const t = data.totales;

      // KPI cards
      $("dash-fin-grid").innerHTML = [
        { n: t.total_facturas, l: "Facturas" },
        { n: `$${fmt(t.total_facturado)}`, l: "Total Facturado" },
        { n: `$${fmt(t.total_pagado)}`, l: "Total Pagado" },
        { n: `$${fmt(t.total_saldo)}`, l: "Saldo Pendiente" },
        { n: t.autorizados, l: "Autorizados" },
        { n: t.anulados, l: "Anulados" },
        { n: `$${fmt(t.total_servicios)}`, l: "Servicios" },
        { n: `$${fmt(t.total_producto)}`, l: "Producto" },
        { n: `$${fmt(t.total_terceros)}`, l: "Terceros" },
      ].map(c => `<div class="dash-fin-card"><div class="dfn">${c.n}</div><div class="dfl">${c.l}</div></div>`).join("");

      // Destroy old charts
      Object.values(_charts).forEach(c => c.destroy());
      _charts = {};

      const COLORS = ["#2B7A9E","#38bdf8","#f59e0b","#10b981","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#6366f1","#84cc16","#a855f7","#06b6d4","#e11d48","#22d3ee"];

      // Facturado por mes
      if (data.por_mes?.length) {
        _charts.mes = new Chart($("chart-mes"), {
          type: "bar",
          data: { labels: data.por_mes.map(m => m.mes), datasets: [{ label: "Facturado", data: data.por_mes.map(m => +m.total_facturado), backgroundColor: "#2B7A9E" }] },
          options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
        });
      }

      // Top clientes
      if (data.por_cliente?.length) {
        _charts.clientes = new Chart($("chart-clientes"), {
          type: "bar",
          data: { labels: data.por_cliente.map(c => c.cliente.substring(0, 25)), datasets: [{ label: "Facturado", data: data.por_cliente.map(c => +c.total_facturado), backgroundColor: COLORS }] },
          options: { indexAxis: "y", responsive: true, plugins: { legend: { display: false } } },
        });
      }

      // Desglose servicios/producto/terceros
      _charts.desglose = new Chart($("chart-desglose"), {
        type: "doughnut",
        data: { labels: ["Servicios", "Producto", "Terceros"], datasets: [{ data: [+t.total_servicios, +t.total_producto, +t.total_terceros], backgroundColor: ["#2B7A9E","#f59e0b","#10b981"] }] },
        options: { responsive: true },
      });

      // Forma de pago
      if (data.por_forma_pago?.length) {
        _charts.formaPago = new Chart($("chart-forma-pago"), {
          type: "pie",
          data: { labels: data.por_forma_pago.map(f => f.forma_pago || "Sin dato"), datasets: [{ data: data.por_forma_pago.map(f => +f.total_facturado), backgroundColor: COLORS }] },
          options: { responsive: true },
        });
      }

      // Por localidad
      if (data.por_centro?.length) {
        _charts.localidad = new Chart($("chart-localidad"), {
          type: "bar",
          data: { labels: data.por_centro.map(c => c.centro_costos || "Sin dato"), datasets: [{ label: "Facturado", data: data.por_centro.map(c => +c.total_facturado), backgroundColor: COLORS }] },
          options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
        });
      }

    } catch (e) { console.error("Error dashboard:", e); }
  }

  // ── Public API ─────────────────────────────────────
  return { ordenar };
})();
