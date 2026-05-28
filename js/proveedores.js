// =====================================================
// proveedores.js — Módulo Cuentas por Pagar
// =====================================================

const PROV = (() => {

  // ── Estado interno ──────────────────────────────
  let paginaDoc     = 1;
  let totalPagDoc   = 1;
  let _disponible   = 0;   // disponible del mes actual

  // ── Helpers ─────────────────────────────────────
  function fmtMoney(v) {
    const n = parseFloat(v);
    if (isNaN(n)) return "—";
    return "$" + n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtFecha(s) {
    if (!s) return "—";
    const d = new Date(s + "T00:00:00");
    if (isNaN(d)) return s;
    return d.toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function periodoActual() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  // ── Filtros documentos ───────────────────────────
  function leerFiltros() {
    return {
      estado:        document.getElementById("f-estado")?.value    || "",
      proveedor:     document.getElementById("f-proveedor")?.value.trim() || "",
      tipo_doc:      document.getElementById("f-tipo")?.value      || "",
      centro_costos: document.getElementById("f-centro")?.value    || "",
      fecha_desde:   document.getElementById("f-desde")?.value     || "",
      fecha_hasta:   document.getElementById("f-hasta")?.value     || "",
    };
  }

  // ── Cargar filtros dinámicos ─────────────────────
  async function cargarFiltros() {
    const res = await apiFetch("/proveedores-pagar/filtros");
    if (!res || !res.ok) return;
    const data = await safeJson(res);

    ["f-centro", "f-centro-res"].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const prev = sel.value;
      while (sel.options.length > 1) sel.remove(1);
      (data.centros || []).forEach(c => {
        const o = new Option(c, c);
        sel.add(o);
      });
      if (prev) sel.value = prev;
    });

    const selTipo = document.getElementById("f-tipo");
    if (selTipo) {
      while (selTipo.options.length > 1) selTipo.remove(1);
      (data.tipos || []).forEach(t => selTipo.add(new Option(t, t)));
    }
  }

  // ── Cargar conteo total activos ──────────────────
  async function cargarTotal() {
    const res = await apiFetch("/proveedores-pagar/documentos?estado=ACTIVO&limit=1");
    if (!res || !res.ok) return;
    const data = await safeJson(res);
    const el = document.getElementById("c-total-prov");
    if (el) el.textContent = data.total ?? "—";
  }

  // ── Cargar tabla documentos ──────────────────────
  async function cargarDocumentos(pag = 1) {
    paginaDoc = pag;
    const f = leerFiltros();
    const qs = new URLSearchParams({ page: pag, limit: 50, ...f });
    Object.keys(f).forEach(k => { if (!f[k]) qs.delete(k); });

    const res = await apiFetch(`/proveedores-pagar/documentos?${qs}`);
    const tbody = document.getElementById("tbody-docs");

    if (!res || !res.ok) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#ef4444">Error al cargar datos.</td></tr>`;
      return;
    }
    const data = await safeJson(res);
    totalPagDoc = data.totalPaginas || 1;

    if (!data.documentos?.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-light)">Sin resultados.</td></tr>`;
    } else {
      tbody.innerHTML = data.documentos.map(d => {
        const descartado = d.estado === "DESCARTADO";
        const obs = (d.observacion || "").replace(/"/g, "&quot;");
        const obsCorta = obs.length > 40 ? obs.slice(0, 40) + "…" : obs;
        const badge = descartado
          ? `<span class="badge-descartado">DESCARTADO</span>`
          : `<span class="badge-activo">ACTIVO</span>`;
        const btnAccion = descartado
          ? `<button class="btn-reactivar" onclick="PROV.cambiarEstado('${d.numero_documento}','ACTIVO')">↩ Reactivar</button>`
          : `<button class="btn-descartar" onclick="PROV.cambiarEstado('${d.numero_documento}','DESCARTADO')">✕ Descartar</button>`;
        return `<tr class="${descartado ? "tr-descartado" : ""}">
          <td title="${(d.proveedor||"").replace(/"/g,"&quot;")}">${d.proveedor || "—"}</td>
          <td>${d.tipo_doc || "—"}</td>
          <td style="font-size:11px">${(d.centro_costos || "—").replace("CC.GLOBAL MOTRIZ ","")}</td>
          <td style="font-family:monospace;font-size:12px">${d.numero_documento}</td>
          <td style="white-space:nowrap">${fmtFecha(d.fecha_emision)}</td>
          <td class="num-right" style="font-weight:700">${fmtMoney(d.saldo)}</td>
          <td class="obs-cell" title="${obs}" onclick="PROV.editarObservacion('${d.numero_documento}','${obs}')">${obsCorta || "—"}</td>
          <td>${badge}</td>
          <td>${btnAccion}</td>
        </tr>`;
      }).join("");
    }

    document.getElementById("pag-info-doc").textContent =
      `Página ${paginaDoc} de ${totalPagDoc} (${data.total} docs)`;
    document.getElementById("btn-prev-doc").disabled = paginaDoc <= 1;
    document.getElementById("btn-next-doc").disabled = paginaDoc >= totalPagDoc;
  }

  // ── Cambiar estado (descartar / reactivar) ───────
  async function cambiarEstado(numDoc, nuevoEstado) {
    const accion = nuevoEstado === "DESCARTADO" ? "descartar" : "reactivar";
    const { isConfirmed } = await Swal.fire({
      title: `¿${nuevoEstado === "DESCARTADO" ? "Descartar" : "Reactivar"} documento?`,
      text: numDoc,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: `Sí, ${accion}`,
      confirmButtonColor: nuevoEstado === "DESCARTADO" ? "#ef4444" : "#2B7A9E",
      cancelButtonText: "Cancelar",
    });
    if (!isConfirmed) return;

    const res = await apiFetch(`/proveedores-pagar/documentos/${encodeURIComponent(numDoc)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: nuevoEstado }),
    });
    if (!res || !res.ok) {
      Swal.fire("Error", "No se pudo actualizar el estado.", "error");
      return;
    }
    await cargarDocumentos(paginaDoc);
    await cargarTotal();
  }

  // ── Editar observación ───────────────────────────
  async function editarObservacion(numDoc, obsActual) {
    const { value, isConfirmed } = await Swal.fire({
      title: "Observación",
      html: `<div style="font-family:monospace;font-size:12px;color:#6b7280;margin-bottom:10px">${numDoc}</div>
             <textarea id="swal-obs" rows="5" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;resize:vertical">${obsActual}</textarea>`,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      confirmButtonColor: "#2B7A9E",
      cancelButtonText: "Cancelar",
      preConfirm: () => document.getElementById("swal-obs").value.trim(),
    });
    if (!isConfirmed) return;

    const res = await apiFetch(`/proveedores-pagar/documentos/${encodeURIComponent(numDoc)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ observacion: value }),
    });
    if (!res || !res.ok) { Swal.fire("Error", "No se pudo guardar.", "error"); return; }
    cargarDocumentos(paginaDoc);
  }

  // ── Cargar resumen ───────────────────────────────
  async function cargarResumen() {
    const centro = document.getElementById("f-centro-res")?.value || "";
    const qs = centro ? `?centro_costos=${encodeURIComponent(centro)}` : "";

    const [resRes, resCostos] = await Promise.all([
      apiFetch(`/proveedores-pagar/resumen${qs}`),
      apiFetch(`/proveedores-pagar/costos/${periodoActual()}`),
    ]);

    if (!resRes || !resRes.ok) return;
    const data   = await safeJson(resRes);
    const costos = resCostos?.ok ? await safeJson(resCostos) : null;

    _disponible = costos?.disponible_proveedores ?? 0;

    // Indicadores
    const totalDeuda  = data.total_general || 0;
    const conPlan     = data.proveedores.reduce((s, r) => s + parseFloat(r.por_abonar || 0), 0);
    const diferencia  = _disponible - conPlan;

    document.getElementById("rc-total-deuda").textContent = fmtMoney(totalDeuda);
    document.getElementById("rc-disponible").textContent  = fmtMoney(_disponible);
    document.getElementById("rc-con-plan").textContent    = fmtMoney(conPlan);
    document.getElementById("rc-diferencia").textContent  = fmtMoney(diferencia);
    const difCard = document.getElementById("rc-diferencia-card");
    if (difCard) {
      difCard.style.background = diferencia >= 0 ? "#dcfce7" : "#fef2f2";
      difCard.querySelector(".rc-num").style.color = diferencia >= 0 ? "#15803d" : "#b91c1c";
    }

    // Tabla
    const tbody = document.getElementById("tbody-resumen");
    if (!data.proveedores?.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-light)">Sin datos activos.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.proveedores.map((r, i) => {
      const abonar = parseFloat(r.por_abonar || 0);
      const saldo  = parseFloat(r.total_saldo || 0);
      let rowClass = "";
      if (abonar > 0) rowClass = abonar >= saldo ? "pago-ok" : "pago-parcial";
      const provEnc = encodeURIComponent(r.proveedor);
      return `<tr class="${rowClass}" data-proveedor="${provEnc}">
        <td style="color:var(--text-light);font-size:12px">${i + 1}</td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.proveedor}">${r.proveedor}</td>
        <td style="text-align:center">${r.cantidad_docs}</td>
        <td class="num-right" style="font-weight:700">${fmtMoney(r.total_saldo)}</td>
        <td><input type="number" class="input-prior" value="${r.prioridad || ""}" placeholder="—" data-campo="prioridad" data-proveedor="${provEnc}"/></td>
        <td><input type="number" class="input-abonar" value="${abonar || ""}" placeholder="0.00" step="0.01" data-campo="por_abonar" data-proveedor="${provEnc}"/></td>
        <td><button class="btn-guardar-abono" onclick="PROV.guardarAbono('${provEnc}')">💾</button></td>
      </tr>`;
    }).join("");
  }

  // ── Guardar abono de un proveedor ────────────────
  async function guardarAbono(provEnc) {
    const proveedor  = decodeURIComponent(provEnc);
    const tr         = document.querySelector(`tr[data-proveedor="${provEnc}"]`);
    const prioridad  = tr?.querySelector("[data-campo='prioridad']")?.value;
    const por_abonar = tr?.querySelector("[data-campo='por_abonar']")?.value;

    const res = await apiFetch(`/proveedores-pagar/resumen/${provEnc}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prioridad:  prioridad  ? parseInt(prioridad)    : null,
        por_abonar: por_abonar ? parseFloat(por_abonar) : null,
      }),
    });
    if (!res || !res.ok) { Swal.fire("Error", "No se pudo guardar.", "error"); return; }
    cargarResumen();
  }

  // ── Guardar todos los abonos ─────────────────────
  async function guardarTodos() {
    const filas = document.querySelectorAll("#tbody-resumen tr[data-proveedor]");
    if (!filas.length) return;
    let errores = 0;
    for (const tr of filas) {
      const provEnc = tr.dataset.proveedor;
      const prioridad  = tr.querySelector("[data-campo='prioridad']")?.value;
      const por_abonar = tr.querySelector("[data-campo='por_abonar']")?.value;
      const res = await apiFetch(`/proveedores-pagar/resumen/${provEnc}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prioridad:  prioridad  ? parseInt(prioridad)    : null,
          por_abonar: por_abonar ? parseFloat(por_abonar) : null,
        }),
      });
      if (!res || !res.ok) errores++;
    }
    if (errores > 0) Swal.fire("Atención", `${errores} filas no se guardaron.`, "warning");
    else Swal.fire({ icon:"success", title:"Guardado", timer:1500, showConfirmButton:false });
    cargarResumen();
  }

  // ── Recalcular disponible en tiempo real ─────────
  function recalcDisponible() {
    const caja   = parseFloat(document.getElementById("inp-caja")?.value)   || 0;
    const colch  = parseFloat(document.getElementById("inp-colchon")?.value) || 0;
    const fijo   = parseFloat(document.getElementById("inp-fijo")?.value)    || 0;
    const disp   = caja - colch - fijo;
    const el     = document.getElementById("disp-num");
    const box    = document.getElementById("disponible-box");
    if (el)  el.textContent = fmtMoney(disp);
    if (box) box.classList.toggle("negativo", disp < 0);
  }

  // ── Cargar costos del mes ────────────────────────
  async function cargarCostos(periodo) {
    const res = await apiFetch(`/proveedores-pagar/costos/${periodo}`);
    if (!res || !res.ok) return;
    const data = await safeJson(res);
    if (!data) return;

    document.getElementById("inp-caja").value   = data.actual_caja   ?? "";
    document.getElementById("inp-colchon").value = data.colchon      ?? 2000;
    document.getElementById("inp-fijo").value    = data.por_pagar_fijo ?? "";
    renderConceptos(data.conceptos || []);
    recalcDisponible();
  }

  // ── Renderizar conceptos ─────────────────────────
  function renderConceptos(lista) {
    const tbody = document.getElementById("tbody-conceptos");
    tbody.innerHTML = lista.map((c, i) => `
      <tr data-idx="${i}">
        <td><input type="text"   class="c-concepto" value="${(c.concepto||"").replace(/"/g,"&quot;")}" placeholder="Concepto…"/></td>
        <td><input type="number" class="c-monto"    value="${c.monto || ""}" step="0.01" placeholder="0.00"/></td>
        <td style="text-align:center"><input type="checkbox" class="c-pagado" ${c.pagado ? "checked" : ""}/></td>
        <td><button class="btn-del-concepto" onclick="PROV.delConcepto(${i})">✕</button></td>
      </tr>`).join("");
  }

  function addConcepto() {
    const tbody = document.getElementById("tbody-conceptos");
    const i = tbody.querySelectorAll("tr").length;
    const tr = document.createElement("tr");
    tr.dataset.idx = i;
    tr.innerHTML = `
      <td><input type="text"   class="c-concepto" placeholder="Concepto…"/></td>
      <td><input type="number" class="c-monto"    step="0.01" placeholder="0.00"/></td>
      <td style="text-align:center"><input type="checkbox" class="c-pagado"/></td>
      <td><button class="btn-del-concepto" onclick="this.closest('tr').remove()">✕</button></td>`;
    tbody.appendChild(tr);
  }

  function delConcepto(i) {
    document.querySelector(`#tbody-conceptos tr[data-idx="${i}"]`)?.remove();
  }

  function leerConceptos() {
    return [...document.querySelectorAll("#tbody-conceptos tr")].map(tr => ({
      concepto: tr.querySelector(".c-concepto")?.value.trim() || "",
      monto:    parseFloat(tr.querySelector(".c-monto")?.value) || 0,
      pagado:   tr.querySelector(".c-pagado")?.checked || false,
    })).filter(c => c.concepto);
  }

  // ── Guardar costos ───────────────────────────────
  async function guardarCostos() {
    const periodo = document.getElementById("inp-periodo")?.value;
    if (!periodo) { Swal.fire("Atención", "Selecciona el periodo.", "warning"); return; }

    const body = {
      periodo,
      actual_caja:    parseFloat(document.getElementById("inp-caja")?.value)    || 0,
      colchon:        parseFloat(document.getElementById("inp-colchon")?.value)  || 2000,
      por_pagar_fijo: parseFloat(document.getElementById("inp-fijo")?.value)     || 0,
      conceptos:      leerConceptos(),
    };

    const res = await apiFetch("/proveedores-pagar/costos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res || !res.ok) { Swal.fire("Error", "No se pudo guardar.", "error"); return; }
    const data = await safeJson(res);
    recalcDisponible();
    Swal.fire({
      icon: "success",
      title: "Costos guardados",
      html: `Disponible para proveedores: <b>${fmtMoney(data.disponible_proveedores)}</b>`,
      timer: 2500,
      showConfirmButton: false,
    });
  }

  // ── Importar (modal Swal) ────────────────────────
  async function importar() {
    const { value: vals } = await Swal.fire({
      title: "Importar Reporte de Proveedores",
      html: `
        <div style="text-align:left;display:flex;flex-direction:column;gap:14px;padding:4px 0">
          <div>
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:#374151">
              Archivo Excel del sistema contable (.xlsx / .xls)
            </label>
            <input type="file" id="si-archivo-prov" accept=".xlsx,.xls"
              style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;box-sizing:border-box;background:#f9fafb"/>
          </div>
          <p style="font-size:12px;color:#6b7280;margin:0">
            Se leerá la hoja <b>"Worksheet 1"</b>. Los documentos que ya no aparezcan serán marcados automáticamente como descartados.
          </p>
        </div>`,
      confirmButtonText: "⬆ Importar",
      cancelButtonText: "Cancelar",
      showCancelButton: true,
      confirmButtonColor: "#2B7A9E",
      cancelButtonColor: "#6b7280",
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async () => {
        const file = document.getElementById("si-archivo-prov").files[0];
        if (!file) { Swal.showValidationMessage("Selecciona el archivo Excel."); return false; }
        const fd = new FormData();
        fd.append("reporte", file);
        try {
          const res = await apiFetch("/proveedores-pagar/importar", { method: "POST", body: fd });
          if (!res || !res.ok) {
            const err = await safeJson(res);
            Swal.showValidationMessage(err?.error || "No se pudo importar el archivo.");
            return false;
          }
          return await safeJson(res);
        } catch (e) {
          Swal.showValidationMessage("Error de conexión. Intenta de nuevo.");
          return false;
        }
      },
    });

    if (!vals) return;

    document.getElementById("import-info-prov").textContent =
      `Última importación: ${new Date().toLocaleString("es-EC")} · ${vals.nuevos} nuevos · ${vals.actualizados} actualizados · ${vals.descartados_automaticos} auto-descartados`;

    await cargarFiltros();
    await cargarTotal();
    await cargarDocumentos(1);

    Swal.fire({
      icon: "success",
      title: "Importación completada",
      html: `<b>${vals.nuevos}</b> nuevos<br><b>${vals.actualizados}</b> actualizados<br><b>${vals.descartados_automaticos}</b> auto-descartados`,
      timer: 3500,
      showConfirmButton: false,
    });
  }

  // ── Exportar CSV ─────────────────────────────────
  async function exportCSV() {
    const f = leerFiltros();
    const qs = new URLSearchParams({ limit: 9999, ...f });
    Object.keys(f).forEach(k => { if (!f[k]) qs.delete(k); });

    const res = await apiFetch(`/proveedores-pagar/documentos?${qs}`);
    if (!res || !res.ok) return;
    const data = await safeJson(res);
    if (!data.documentos?.length) { Swal.fire("Sin datos", "No hay documentos para exportar.", "info"); return; }

    const cols = ["proveedor","tipo_doc","centro_costos","numero_documento","fecha_emision","saldo","observacion","estado"];
    const header = cols.join(",");
    const rows = data.documentos.map(d =>
      cols.map(c => `"${String(d[c] ?? "").replace(/"/g, '""')}"`).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: "data:text/csv;charset=utf-8," + encodeURIComponent(csv),
      download: `proveedores_${new Date().toISOString().slice(0,10)}.csv`,
    });
    a.click();
  }

  // ── Tabs ─────────────────────────────────────────
  function initTabs() {
    document.querySelectorAll(".prov-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".prov-tab").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".prov-tab-panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        const panel = document.getElementById(`panel-${btn.dataset.tab}`);
        if (panel) panel.classList.add("active");

        if (btn.dataset.tab === "resumen") cargarResumen();
        if (btn.dataset.tab === "costos") {
          const p = document.getElementById("inp-periodo");
          if (p && !p.value) p.value = periodoActual();
          cargarCostos(p.value);
        }
      });
    });
  }

  // ── Init ─────────────────────────────────────────
  async function init() {
    initTabs();

    // Período por defecto
    const inpPeriodo = document.getElementById("inp-periodo");
    if (inpPeriodo) inpPeriodo.value = periodoActual();

    await cargarFiltros();
    await cargarTotal();
    await cargarDocumentos(1);

    // Eventos toolbar
    document.getElementById("btn-importar-prov")?.addEventListener("click", importar);
    document.getElementById("btn-export-csv-prov")?.addEventListener("click", exportCSV);

    // Eventos filtros documentos
    document.getElementById("btn-filtrar-prov")?.addEventListener("click", () => cargarDocumentos(1));
    document.getElementById("btn-limpiar-prov")?.addEventListener("click", () => {
      ["f-estado","f-centro","f-tipo"].forEach(id => { const el = document.getElementById(id); if (el) el.value = id === "f-estado" ? "ACTIVO" : ""; });
      ["f-proveedor","f-desde","f-hasta"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
      cargarDocumentos(1);
    });
    document.getElementById("f-proveedor")?.addEventListener("keydown", e => { if (e.key === "Enter") cargarDocumentos(1); });

    // Paginación documentos
    document.getElementById("btn-prev-doc")?.addEventListener("click", () => cargarDocumentos(paginaDoc - 1));
    document.getElementById("btn-next-doc")?.addEventListener("click", () => cargarDocumentos(paginaDoc + 1));

    // Resumen
    document.getElementById("btn-filtrar-res")?.addEventListener("click",  cargarResumen);
    document.getElementById("btn-guardar-todos")?.addEventListener("click", guardarTodos);

    // Costos
    document.getElementById("btn-cargar-costos")?.addEventListener("click", () => {
      const p = document.getElementById("inp-periodo")?.value;
      if (p) cargarCostos(p);
    });
    document.getElementById("btn-add-concepto")?.addEventListener("click", addConcepto);
    document.getElementById("btn-guardar-costos")?.addEventListener("click", guardarCostos);
  }

  document.addEventListener("DOMContentLoaded", init);

  // API pública
  return { cambiarEstado, editarObservacion, guardarAbono, guardarTodos, recalcDisponible, addConcepto, delConcepto };

})();
