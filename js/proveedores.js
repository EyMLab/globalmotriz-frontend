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
    const solo = String(s).slice(0, 10);   // toma solo "YYYY-MM-DD" de cualquier formato ISO
    const d = new Date(solo + "T00:00:00");
    if (isNaN(d)) return solo;
    return d.toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function fmtCentro(val) {
    if (!val) return "—";
    const v = val.toUpperCase();
    if (v.includes("SUCURSAL")) return "SUCURSAL";
    if (v.includes(" SA"))      return "MATRIZ";
    return val.replace(/CC\.GLOBAL MOTRIZ\s*/i, "").trim() || val;
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

  // ── Prioridad: mapeo número ↔ texto ─────────────
  const PRIOR_OPTS = [
    { val: "",  label: "—"    },
    { val: "1", label: "BAJA" },
    { val: "2", label: "MEDIA"},
    { val: "3", label: "ALTA" },
  ];
  function priorSelect(currentVal, provEnc) {
    const opts = PRIOR_OPTS.map(o =>
      `<option value="${o.val}"${String(currentVal||"") === o.val ? " selected" : ""}>${o.label}</option>`
    ).join("");
    return `<select class="select-prior" data-campo="prioridad" data-proveedor="${provEnc}">${opts}</select>`;
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
      (data.centros || []).forEach(c => sel.add(new Option(c, c)));
      if (prev) sel.value = prev;
    });

    const selTipo = document.getElementById("f-tipo");
    if (selTipo) {
      while (selTipo.options.length > 1) selTipo.remove(1);
      (data.tipos || []).forEach(t => selTipo.add(new Option(t, t)));
    }

    // Datalist de proveedores para autocomplete
    const dl = document.getElementById("dl-proveedores");
    if (dl) {
      dl.innerHTML = (data.proveedores || [])
        .map(p => `<option value="${p.replace(/"/g, "&quot;")}">`)
        .join("");
    }
  }

  // ── Actualizar contador según filtro activo ───────
  function actualizarContador(total) {
    const estado = document.getElementById("f-estado")?.value ?? "ACTIVO";
    const el  = document.getElementById("c-total-prov");
    const lbl = document.getElementById("lbl-total-prov");
    if (el)  el.textContent  = total ?? "—";
    if (lbl) lbl.textContent =
      estado === "DESCARTADO" ? "docs descartados" :
      estado === "ACTIVO"     ? "docs activos"      :
                                "docs en total";
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
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#ef4444">Error al cargar datos.</td></tr>`;
      return;
    }
    const data = await safeJson(res);
    totalPagDoc = data.totalPaginas || 1;

    if (!data.documentos?.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-light)">Sin resultados.</td></tr>`;
    } else {
      tbody.innerHTML = data.documentos.map(d => {
        const descartado = d.estado === "DESCARTADO";
        const obsEnc = (d.observacion || "")
          .replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        const numEnc = d.numero_documento.replace(/&/g,"&amp;").replace(/"/g,"&quot;");
        const rowStyle = descartado ? 'background:#f9fafb;opacity:.65;' : '';
        const tieneObs = !!(d.observacion || "").trim();
        const btnObs = `<button class="btn-obs${tieneObs ? "" : " btn-obs-vacia"}"
          data-num="${numEnc}" data-obs="${obsEnc}"
          onclick="PROV.editarObsClick(this)">${tieneObs ? "Ver / Editar" : "Agregar"}</button>`;
        return `<tr style="${rowStyle}">
          <td style="text-align:center">
            <input type="checkbox" class="row-check" style="width:15px;height:15px;cursor:pointer;accent-color:var(--primary)"
              data-num="${d.numero_documento.replace(/"/g,'&quot;')}"
              data-estado="${d.estado}"
              onchange="PROV.actualizarBarraSeleccion()"/>
          </td>
          <td title="${(d.proveedor||"").replace(/"/g,"&quot;")}">${d.proveedor || "—"}</td>
          <td>${d.tipo_doc || "—"}</td>
          <td style="text-align:center">${fmtCentro(d.centro_costos)}</td>
          <td>${d.numero_documento}</td>
          <td style="white-space:nowrap">${fmtFecha(d.fecha_emision)}</td>
          <td class="num-right" style="font-weight:700">${fmtMoney(d.saldo)}</td>
          <td>${btnObs}</td>
        </tr>`;
      }).join("");
      // Resetear barra y check-all al recargar
      actualizarBarraSeleccion();
      const chkAll = document.getElementById("check-all-docs");
      if (chkAll) chkAll.checked = false;
    }

    document.getElementById("pag-info-doc").textContent =
      `Página ${paginaDoc} de ${totalPagDoc} (${data.total} docs)`;
    document.getElementById("btn-prev-doc").disabled = paginaDoc <= 1;
    document.getElementById("btn-next-doc").disabled = paginaDoc >= totalPagDoc;
    actualizarContador(data.total);
  }

  // ── Barra de selección ───────────────────────────
  function actualizarBarraSeleccion() {
    const checks  = [...document.querySelectorAll(".row-check:checked")];
    const bar     = document.getElementById("sel-bar");
    const countEl = document.getElementById("sel-count");
    if (!bar) return;
    if (!checks.length) { bar.style.display = "none"; return; }
    bar.style.display = "flex";
    const nActivo     = checks.filter(c => c.dataset.estado === "ACTIVO").length;
    const nDescartado = checks.filter(c => c.dataset.estado === "DESCARTADO").length;
    countEl.textContent = `${checks.length} seleccionado${checks.length > 1 ? "s" : ""}` +
      (nActivo     ? `  ·  ${nActivo} activo${nActivo > 1 ? "s" : ""}`         : "") +
      (nDescartado ? `  ·  ${nDescartado} descartado${nDescartado > 1 ? "s" : ""}` : "");
    const btnDesc  = document.getElementById("btn-desc-sel");
    const btnReact = document.getElementById("btn-react-sel");
    if (btnDesc)  btnDesc.style.display  = nActivo     ? "" : "none";
    if (btnReact) btnReact.style.display = nDescartado ? "" : "none";
  }

  // ── Cambiar estado en bloque ─────────────────────
  async function cambiarEstadoSeleccionados(nuevoEstado) {
    const checks = [...document.querySelectorAll(".row-check:checked")]
      .filter(c => c.dataset.estado !== nuevoEstado);
    if (!checks.length) return;

    const verbo = nuevoEstado === "DESCARTADO" ? "descartar" : "reactivar";
    const { isConfirmed } = await Swal.fire({
      title: `¿${nuevoEstado === "DESCARTADO" ? "Descartar" : "Reactivar"} ${checks.length} documento${checks.length > 1 ? "s" : ""}?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: `Sí, ${verbo}`,
      confirmButtonColor: nuevoEstado === "DESCARTADO" ? "#ef4444" : "#2B7A9E",
      cancelButtonText: "Cancelar",
    });
    if (!isConfirmed) return;

    let errores = 0;
    for (const cb of checks) {
      const res = await apiFetch(`/proveedores-pagar/documentos/${encodeURIComponent(cb.dataset.num)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      if (!res || !res.ok) errores++;
    }
    if (errores) Swal.fire("Atención", `${errores} documentos no se pudieron actualizar.`, "warning");
    else Swal.fire({ icon: "success", title: nuevoEstado === "DESCARTADO" ? "Descartados" : "Reactivados", timer: 1500, showConfirmButton: false });
    await cargarDocumentos(paginaDoc);
  }

  // ── Wrapper seguro para onclick del botón ────────
  function editarObsClick(btn) {
    editarObservacion(btn.dataset.num, btn.dataset.obs || "");
  }

  // ── Editar observación ───────────────────────────
  async function editarObservacion(numDoc, obsActual) {
    const { value, isConfirmed } = await Swal.fire({
      title: "Observación",
      width: 540,
      html: `
        <div style="text-align:left">
          <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Documento</div>
          <div style="font-family:monospace;font-size:13px;color:#1e40af;background:#eff6ff;padding:6px 10px;border-radius:6px;margin-bottom:14px">${numDoc}</div>
          <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Texto de observación</div>
          <textarea id="swal-obs" rows="5"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;line-height:1.5;outline:none;color:#111827"
            onfocus="this.style.borderColor='#2B7A9E';this.style.boxShadow='0 0 0 3px rgba(43,122,158,.15)'"
            onblur="this.style.borderColor='#d1d5db';this.style.boxShadow='none'"
          >${obsActual}</textarea>
        </div>`,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      confirmButtonColor: "#2B7A9E",
      cancelButtonText: "Cancelar",
      cancelButtonColor: "#9ca3af",
      focusConfirm: false,
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
      const provEnc  = encodeURIComponent(r.proveedor);
      const totalFmt = saldo.toFixed(2);
      return `<tr class="${rowClass}" data-proveedor="${provEnc}">
        <td style="color:var(--text-light);font-size:12px">${i + 1}</td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.proveedor}">${r.proveedor}</td>
        <td style="text-align:center">${r.cantidad_docs}</td>
        <td class="num-right" style="font-weight:700">${fmtMoney(r.total_saldo)}</td>
        <td>${priorSelect(r.prioridad, provEnc)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:4px">
            <input type="number" class="input-abonar" value="${abonar || ""}" placeholder="0.00" step="0.01" data-campo="por_abonar" data-proveedor="${provEnc}"/>
            <button class="btn-total-abonar" onclick="this.previousElementSibling.value='${totalFmt}'" title="Poner total adeudado">Total</button>
          </div>
        </td>
        <td><button class="btn-guardar-abono" onclick="PROV.guardarAbono('${provEnc}')">Guardar</button></td>
      </tr>`;
    }).join("");
  }

  // ── Guardar abono de un proveedor ────────────────
  async function guardarAbono(provEnc) {
    const tr         = document.querySelector(`tr[data-proveedor="${provEnc}"]`);
    const prioridad  = tr?.querySelector("[data-campo='prioridad']")?.value;   // viene del <select>
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

  // ── Suma conceptos → inp-fijo → recalc disponible ──
  function actualizarTotalFijo() {
    const total = [...document.querySelectorAll("#tbody-conceptos .c-monto")]
      .reduce((s, inp) => s + (parseFloat(inp.value) || 0), 0);
    const el = document.getElementById("inp-fijo");
    if (el) el.value = total.toFixed(2);
    recalcDisponible();
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
    actualizarTotalFijo();
  }

  // ── Renderizar conceptos ─────────────────────────
  function renderConceptos(lista) {
    const tbody = document.getElementById("tbody-conceptos");
    tbody.innerHTML = lista.map((c, i) => `
      <tr data-idx="${i}">
        <td><input type="text"   class="c-concepto" value="${(c.concepto||"").replace(/"/g,"&quot;")}" placeholder="Concepto…"/></td>
        <td><input type="number" class="c-monto"    value="${c.monto || ""}" step="0.01" placeholder="0.00" oninput="PROV.actualizarTotalFijo()"/></td>
        <td style="text-align:center"><input type="checkbox" class="c-pagado" ${c.pagado ? "checked" : ""}/></td>
        <td><button class="btn-del-concepto" onclick="PROV.delConcepto(${i});PROV.actualizarTotalFijo()">x</button></td>
      </tr>`).join("");
  }

  function addConcepto() {
    const tbody = document.getElementById("tbody-conceptos");
    const i = tbody.querySelectorAll("tr").length;
    const tr = document.createElement("tr");
    tr.dataset.idx = i;
    tr.innerHTML = `
      <td><input type="text"   class="c-concepto" placeholder="Concepto…"/></td>
      <td><input type="number" class="c-monto"    step="0.01" placeholder="0.00" oninput="PROV.actualizarTotalFijo()"/></td>
      <td style="text-align:center"><input type="checkbox" class="c-pagado"/></td>
      <td><button class="btn-del-concepto" onclick="this.closest('tr').remove();PROV.actualizarTotalFijo()">x</button></td>`;
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
      confirmButtonText: "Importar",
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
      `Última importación: ${new Date().toLocaleString("es-EC")} · ${vals.nuevos} nuevos · ${vals.actualizados} actualizados · ${vals.eliminados} eliminados`;

    await cargarFiltros();
    await cargarDocumentos(1);

    Swal.fire({
      icon: "success",
      title: "Importación completada",
      html: `<b>${vals.nuevos}</b> nuevos<br><b>${vals.actualizados}</b> actualizados<br><b>${vals.eliminados}</b> eliminados (pagados/resueltos)`,
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

    // Selección masiva
    document.getElementById("check-all-docs")?.addEventListener("change", e => {
      document.querySelectorAll(".row-check").forEach(c => { c.checked = e.target.checked; });
      actualizarBarraSeleccion();
    });
    document.getElementById("btn-desc-sel")?.addEventListener("click",  () => cambiarEstadoSeleccionados("DESCARTADO"));
    document.getElementById("btn-react-sel")?.addEventListener("click", () => cambiarEstadoSeleccionados("ACTIVO"));
    document.getElementById("btn-desel-all")?.addEventListener("click", () => {
      document.querySelectorAll(".row-check").forEach(c => { c.checked = false; });
      const ca = document.getElementById("check-all-docs");
      if (ca) ca.checked = false;
      actualizarBarraSeleccion();
    });

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
  return { actualizarBarraSeleccion, editarObsClick, editarObservacion, guardarAbono, guardarTodos, recalcDisponible, actualizarTotalFijo, addConcepto, delConcepto };

})();
