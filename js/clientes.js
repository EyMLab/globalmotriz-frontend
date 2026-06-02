// =====================================================
// clientes.js — Módulo Cuentas por Cobrar
// =====================================================

const CLIE = (() => {

  let paginaDoc     = 1;
  let totalPagDoc   = 1;
  let _clientesList = [];
  let _resumenData  = null;

  // ── Helpers ─────────────────────────────────────
  function fmtMoney(v) {
    const n = parseFloat(v);
    if (isNaN(n)) return "—";
    return "$" + n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtFecha(s) {
    if (!s) return "—";
    const solo = String(s).slice(0, 10);
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

  function fmtDiasVenc(dias) {
    if (dias == null) return '<span class="badge-venc badge-venc-verde">—</span>';
    const d = parseInt(dias);
    if (d > 90)     return `<span class="badge-venc badge-venc-rojo">${d}d</span>`;
    if (d >= 31)    return `<span class="badge-venc badge-venc-naranja">${d}d</span>`;
    if (d >= 1)     return `<span class="badge-venc badge-venc-amarillo">${d}d</span>`;
    return `<span class="badge-venc badge-venc-verde">${d}d</span>`;
  }

  // ── Filtros ─────────────────────────────────────
  function leerFiltros() {
    return {
      estado:        document.getElementById("f-estado")?.value    || "",
      cliente:       document.getElementById("f-cliente")?.value.trim() || "",
      tipo_doc:      document.getElementById("f-tipo")?.value      || "",
      centro_costos: document.getElementById("f-centro")?.value    || "",
      fecha_desde:   document.getElementById("f-desde")?.value     || "",
      fecha_hasta:   document.getElementById("f-hasta")?.value     || "",
      responsable:   document.getElementById("f-responsable")?.value || "",
      solo_vencidos: document.getElementById("f-solo-vencidos")?.checked ? "true" : "",
    };
  }

  const PRIOR_OPTS = [
    { val: "",  label: "—"    },
    { val: "1", label: "BAJA" },
    { val: "2", label: "MEDIA"},
    { val: "3", label: "ALTA" },
  ];
  function priorSelect(currentVal, cliEnc) {
    const opts = PRIOR_OPTS.map(o =>
      `<option value="${o.val}"${String(currentVal||"") === o.val ? " selected" : ""}>${o.label}</option>`
    ).join("");
    return `<select class="select-prior" data-campo="prioridad" data-cliente="${cliEnc}">${opts}</select>`;
  }

  // ── Cargar filtros dinámicos ─────────────────────
  async function cargarFiltros() {
    const res = await apiFetch("/clientes-cobrar/filtros");
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

    const selResp = document.getElementById("f-responsable");
    if (selResp) {
      const prev = selResp.value;
      while (selResp.options.length > 1) selResp.remove(1);
      (data.responsables || []).forEach(r => selResp.add(new Option(r, r)));
      if (prev) selResp.value = prev;
    }

    _clientesList = data.clientes || [];
  }

  // ── Autocomplete cliente ────────────────────────
  function mostrarSugerencias() {
    const input    = document.getElementById("f-cliente");
    const dropdown = document.getElementById("cli-dropdown");
    if (!input || !dropdown) return;

    const q = input.value.trim().toLowerCase();
    if (q.length < 1) { dropdown.style.display = "none"; return; }

    const matches = _clientesList
      .filter(p => p.toLowerCase().includes(q))
      .slice(0, 12);

    if (!matches.length) { dropdown.style.display = "none"; return; }

    dropdown.innerHTML = matches.map(p => {
      const enc = p.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
      const re  = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")})`, "gi");
      const hl  = enc.replace(re, `<strong>$1</strong>`);
      return `<div class="prov-suggestion" data-val="${enc}" onmousedown="CLIE.seleccionarSugerencia(this)">${hl}</div>`;
    }).join("");
    dropdown.style.display = "block";
  }

  function seleccionarSugerencia(el) {
    const input = document.getElementById("f-cliente");
    if (input) input.value = el.dataset.val;
    document.getElementById("cli-dropdown").style.display = "none";
  }

  function ocultarDropdown() {
    const d = document.getElementById("cli-dropdown");
    if (d) d.style.display = "none";
  }

  function actualizarContador(total) {
    const estado = document.getElementById("f-estado")?.value ?? "ACTIVO";
    const el  = document.getElementById("c-total-cli");
    const lbl = document.getElementById("lbl-total-cli");
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

    const res = await apiFetch(`/clientes-cobrar/documentos?${qs}`);
    const tbody = document.getElementById("tbody-docs");

    if (!res || !res.ok) {
      tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;color:#ef4444">Error al cargar datos.</td></tr>`;
      return;
    }
    const data = await safeJson(res);
    totalPagDoc = data.totalPaginas || 1;

    if (!data.documentos?.length) {
      tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:30px;color:var(--text-light)">Sin resultados.</td></tr>`;
    } else {
      tbody.innerHTML = data.documentos.map(d => {
        const descartado = d.estado === "DESCARTADO";
        const obsEnc = (d.observacion || "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        const numEnc = d.numero_documento.replace(/&/g,"&amp;").replace(/"/g,"&quot;");
        const rowStyle = descartado ? 'background:#f9fafb;opacity:.65;' : '';
        const tieneObs = !!(d.observacion || "").trim();
        const btnObs = `<button class="btn-obs${tieneObs ? "" : " btn-obs-vacia"}"
          data-num="${numEnc}" data-obs="${obsEnc}"
          onclick="CLIE.editarObsClick(this)">${tieneObs ? "Ver / Editar" : "Agregar"}</button>`;
        return `<tr style="${rowStyle}">
          <td style="text-align:center">
            <input type="checkbox" class="row-check" style="width:15px;height:15px;cursor:pointer;accent-color:var(--primary)"
              data-num="${d.numero_documento.replace(/"/g,'&quot;')}"
              data-estado="${d.estado}"
              onchange="CLIE.actualizarBarraSeleccion()"/>
          </td>
          <td title="${(d.cliente||"").replace(/"/g,"&quot;")}">${d.cliente || "—"}</td>
          <td>${d.tipo_doc || "—"}</td>
          <td style="text-align:center">${fmtCentro(d.centro_costos)}</td>
          <td>${d.numero_documento}</td>
          <td style="white-space:nowrap">${fmtFecha(d.fecha_emision)}</td>
          <td style="text-align:center">${fmtDiasVenc(d.dias_vencimiento)}</td>
          <td class="num-right">${fmtMoney(d.cargos)}</td>
          <td class="num-right">${fmtMoney(d.cobrado)}</td>
          <td class="num-right">${fmtMoney(d.retencion)}</td>
          <td class="num-right" style="font-weight:700">${fmtMoney(d.saldo)}</td>
          <td><input type="text" class="input-resp" value="${(d.responsable||"").replace(/"/g,"&quot;")}" placeholder="—"
            data-num="${numEnc}" style="width:100px;padding:3px 6px;border:1px solid var(--input-border);border-radius:var(--r-md);font-size:12px;font-family:var(--font-main)"
            onblur="CLIE.guardarResponsable(this)"/></td>
          <td>${btnObs}</td>
        </tr>`;
      }).join("");
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

  // ── Barra de selección ──────────────────────────
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
      const res = await apiFetch(`/clientes-cobrar/documentos/${encodeURIComponent(cb.dataset.num)}`, {
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

  function editarObsClick(btn) {
    editarObservacion(btn.dataset.num, btn.dataset.obs || "");
  }

  async function guardarResponsable(input) {
    const numDoc = input.dataset.num;
    const valor  = input.value.trim();
    await apiFetch(`/clientes-cobrar/documentos/${encodeURIComponent(numDoc)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responsable: valor }),
    });
  }

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

    const res = await apiFetch(`/clientes-cobrar/documentos/${encodeURIComponent(numDoc)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ observacion: value }),
    });
    if (!res || !res.ok) { Swal.fire("Error", "No se pudo guardar.", "error"); return; }
    cargarDocumentos(paginaDoc);
  }

  // ── Cargar resumen ──────────────────────────────
  async function cargarResumen() {
    const centro = document.getElementById("f-centro-res")?.value || "";
    const qs = centro ? `?centro_costos=${encodeURIComponent(centro)}` : "";

    const resRes = await apiFetch(`/clientes-cobrar/resumen${qs}`);
    if (!resRes || !resRes.ok) return;
    const data   = await safeJson(resRes);
    _resumenData = data;

    const totalCobrar  = data.total_general || 0;
    const totalCobrado = data.total_cobrado || 0;
    const conPlan      = data.clientes.reduce((s, r) => s + parseFloat(r.por_cobrar || 0), 0);
    const docsVencidos = data.total_vencidos || 0;

    document.getElementById("rc-total-cobrar").textContent  = fmtMoney(totalCobrar);
    document.getElementById("rc-total-cobrado").textContent = fmtMoney(totalCobrado);
    document.getElementById("rc-con-plan").textContent      = fmtMoney(conPlan);
    document.getElementById("rc-docs-vencidos").textContent = docsVencidos;

    const vencCard = document.getElementById("rc-vencidos-card");
    if (vencCard) {
      if (docsVencidos === 0) {
        vencCard.classList.remove("rc-vencidos");
        vencCard.classList.add("rc-cobrado");
      } else {
        vencCard.classList.remove("rc-cobrado");
        vencCard.classList.add("rc-vencidos");
      }
    }

    const tbody = document.getElementById("tbody-resumen");
    if (!data.clientes?.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--text-light)">Sin datos activos.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.clientes.map((r, i) => {
      const cobrar = parseFloat(r.por_cobrar || 0);
      const saldo  = parseFloat(r.total_saldo || 0);
      let rowClass = "";
      if (cobrar > 0) rowClass = cobrar >= saldo ? "pago-ok" : "pago-parcial";
      const cliEnc   = encodeURIComponent(r.cliente);
      const totalFmt = saldo.toFixed(2);
      const refEnc   = (r.referencia || "").replace(/"/g, "&quot;");
      const telEnc   = (r.telefono || "").replace(/"/g, "&quot;");
      return `<tr class="${rowClass}" data-cliente="${cliEnc}">
        <td style="color:var(--text-light);font-size:12px">${i + 1}</td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.cliente}">${r.cliente}</td>
        <td style="font-size:11px;color:var(--text-light)">${r.identificacion || "—"}</td>
        <td style="font-size:11px;color:var(--text-light)" title="${telEnc}">${r.telefono ? r.telefono.split("|")[0].trim() || "—" : "—"}</td>
        <td style="text-align:center">${r.cantidad_docs}</td>
        <td class="num-right" style="font-weight:700">${fmtMoney(r.total_saldo)}</td>
        <td>${priorSelect(r.prioridad, cliEnc)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:4px">
            <input type="number" class="input-abonar" value="${cobrar || ""}" placeholder="0.00" step="0.01" data-campo="por_cobrar" data-cliente="${cliEnc}"/>
            <button class="btn-total-abonar" onclick="this.previousElementSibling.value='${totalFmt}'" title="Poner total adeudado">Total</button>
          </div>
        </td>
        <td><input type="text" class="input-ref" value="${refEnc}" placeholder="" maxlength="50" data-campo="referencia" data-cliente="${cliEnc}"/></td>
        <td><button class="btn-guardar-abono" onclick="CLIE.guardarAbono('${cliEnc}')">Guardar</button></td>
      </tr>`;
    }).join("");
  }

  async function guardarAbono(cliEnc) {
    const tr         = document.querySelector(`tr[data-cliente="${cliEnc}"]`);
    const prioridad  = tr?.querySelector("[data-campo='prioridad']")?.value;
    const por_cobrar = tr?.querySelector("[data-campo='por_cobrar']")?.value;
    const referencia = tr?.querySelector("[data-campo='referencia']")?.value.trim() || null;

    const res = await apiFetch(`/clientes-cobrar/resumen/${cliEnc}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prioridad:  prioridad  ? parseInt(prioridad)    : null,
        por_cobrar: por_cobrar ? parseFloat(por_cobrar) : null,
        referencia,
      }),
    });
    if (!res || !res.ok) { Swal.fire("Error", "No se pudo guardar.", "error"); return; }
    cargarResumen();
  }

  async function guardarTodos() {
    const filas = document.querySelectorAll("#tbody-resumen tr[data-cliente]");
    if (!filas.length) return;
    let errores = 0;
    for (const tr of filas) {
      const cliEnc = tr.dataset.cliente;
      const prioridad  = tr.querySelector("[data-campo='prioridad']")?.value;
      const por_cobrar = tr.querySelector("[data-campo='por_cobrar']")?.value;
      const referencia = tr.querySelector("[data-campo='referencia']")?.value.trim() || null;
      const res = await apiFetch(`/clientes-cobrar/resumen/${cliEnc}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prioridad:  prioridad  ? parseInt(prioridad)    : null,
          por_cobrar: por_cobrar ? parseFloat(por_cobrar) : null,
          referencia,
        }),
      });
      if (!res || !res.ok) errores++;
    }
    if (errores > 0) Swal.fire("Atención", `${errores} filas no se guardaron.`, "warning");
    else Swal.fire({ icon:"success", title:"Guardado", timer:1500, showConfirmButton:false });
    cargarResumen();
  }

  // ── Antigüedad de cartera ───────────────────────
  function cargarAntiguedad() {
    if (!_resumenData?.clientes?.length) {
      document.getElementById("tbody-antiguedad").innerHTML =
        `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-light)">Carga el resumen primero.</td></tr>`;
      return;
    }

    const clientes = _resumenData.clientes;
    let monto90 = 0, monto3090 = 0, monto130 = 0, montoDia = 0;
    let docs90 = 0, docs3090 = 0, docs130 = 0, docsDia = 0;

    for (const c of clientes) {
      const saldoPerDoc = parseFloat(c.total_saldo || 0) / (c.cantidad_docs || 1);
      docs90   += (c.vencido_90 || 0);
      docs3090 += (c.vencido_30_90 || 0);
      docs130  += (c.vencido_1_30 || 0);
      docsDia  += (c.al_dia || 0);
      monto90   += saldoPerDoc * (c.vencido_90 || 0);
      monto3090 += saldoPerDoc * (c.vencido_30_90 || 0);
      monto130  += saldoPerDoc * (c.vencido_1_30 || 0);
      montoDia  += saldoPerDoc * (c.al_dia || 0);
    }

    document.getElementById("ag-monto-90").textContent   = fmtMoney(monto90);
    document.getElementById("ag-docs-90").textContent     = `${docs90} docs`;
    document.getElementById("ag-monto-3090").textContent  = fmtMoney(monto3090);
    document.getElementById("ag-docs-3090").textContent   = `${docs3090} docs`;
    document.getElementById("ag-monto-130").textContent   = fmtMoney(monto130);
    document.getElementById("ag-docs-130").textContent    = `${docs130} docs`;
    document.getElementById("ag-monto-dia").textContent   = fmtMoney(montoDia);
    document.getElementById("ag-docs-dia").textContent    = `${docsDia} docs`;

    const sorted = [...clientes].sort((a, b) => (b.max_dias_vencido || 0) - (a.max_dias_vencido || 0));

    document.getElementById("tbody-antiguedad").innerHTML = sorted.map((r, i) => {
      const maxD = r.max_dias_vencido || 0;
      let maxBadge;
      if (maxD > 90)      maxBadge = `<span class="badge-venc badge-venc-rojo">${maxD}d</span>`;
      else if (maxD >= 31) maxBadge = `<span class="badge-venc badge-venc-naranja">${maxD}d</span>`;
      else if (maxD >= 1)  maxBadge = `<span class="badge-venc badge-venc-amarillo">${maxD}d</span>`;
      else                 maxBadge = `<span class="badge-venc badge-venc-verde">${maxD}d</span>`;

      return `<tr>
        <td style="color:var(--text-light);font-size:12px">${i + 1}</td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis" title="${r.cliente}">${r.cliente}</td>
        <td class="num-right" style="font-weight:700">${fmtMoney(r.total_saldo)}</td>
        <td style="text-align:center">${r.vencido_90 || 0}</td>
        <td style="text-align:center">${r.vencido_30_90 || 0}</td>
        <td style="text-align:center">${r.vencido_1_30 || 0}</td>
        <td style="text-align:center">${r.al_dia || 0}</td>
        <td style="text-align:center">${maxBadge}</td>
      </tr>`;
    }).join("");
  }

  // ── Importar ────────────────────────────────────
  async function importar() {
    const { value: vals } = await Swal.fire({
      title: "Importar Reporte de Clientes",
      html: `
        <div style="text-align:left;display:flex;flex-direction:column;gap:14px;padding:4px 0">
          <div>
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:#374151">
              Archivo Excel del sistema contable (.xlsx / .xls)
            </label>
            <input type="file" id="si-archivo-cli" accept=".xlsx,.xls"
              style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;box-sizing:border-box;background:#f9fafb"/>
          </div>
          <p style="font-size:12px;color:#6b7280;margin:0">
            Se leerá la hoja <b>"Worksheet 1"</b>. Los documentos que ya no aparezcan serán eliminados automáticamente.
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
        const file = document.getElementById("si-archivo-cli").files[0];
        if (!file) { Swal.showValidationMessage("Selecciona el archivo Excel."); return false; }
        const fd = new FormData();
        fd.append("reporte", file);
        try {
          const res = await apiFetch("/clientes-cobrar/importar", { method: "POST", body: fd });
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

    document.getElementById("import-info-cli").textContent =
      `Última importación: ${new Date().toLocaleString("es-EC")} · ${vals.nuevos} nuevos · ${vals.actualizados} actualizados · ${vals.eliminados} eliminados`;

    await cargarFiltros();
    await cargarDocumentos(1);

    const fmtSaldo = v => "$" + parseFloat(v || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const seccionNuevos = vals.detalle_nuevos?.length ? `
      <div style="margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">
          Documentos nuevos (${vals.nuevos})
        </div>
        <div style="max-height:180px;overflow-y:auto;border:1px solid #d1fae5;border-radius:6px">
          ${vals.detalle_nuevos.map(d => `
            <div style="padding:5px 10px;border-bottom:1px solid #f0fdf4;font-size:12px;display:flex;justify-content:space-between;gap:8px;align-items:center">
              <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                <span style="font-weight:600;color:#111827">${d.numero_documento}</span>
                <span style="color:#6b7280"> — ${d.cliente}</span>
              </span>
              <span style="white-space:nowrap;font-weight:700;color:#059669">${fmtSaldo(d.saldo)}</span>
            </div>`).join("")}
        </div>
      </div>` : "";

    const seccionEliminados = vals.detalle_eliminados?.length ? `
      <div>
        <div style="font-size:11px;font-weight:700;color:#b91c1c;text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px">
          Documentos eliminados (${vals.eliminados})
        </div>
        <div style="max-height:180px;overflow-y:auto;border:1px solid #fecaca;border-radius:6px">
          ${vals.detalle_eliminados.map(d => `
            <div style="padding:5px 10px;border-bottom:1px solid #fef2f2;font-size:12px;display:flex;justify-content:space-between;gap:8px;align-items:center">
              <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                <span style="font-weight:600;color:#111827">${d.numero_documento}</span>
                <span style="color:#6b7280"> — ${d.cliente}</span>
              </span>
              <span style="white-space:nowrap;font-size:11px;font-weight:600;
                color:${d.estado === "DESCARTADO" ? "#6b7280" : "#b91c1c"};
                background:${d.estado === "DESCARTADO" ? "#f3f4f6" : "#fef2f2"};
                padding:1px 6px;border-radius:99px">${d.estado}</span>
            </div>`).join("")}
        </div>
      </div>` : "";

    const sinDetalle = !seccionNuevos && !seccionEliminados;

    Swal.fire({
      icon: "success",
      title: "Importación completada",
      width: sinDetalle ? 420 : 560,
      html: `
        <div style="text-align:left">
          <div style="display:flex;gap:10px;margin-bottom:${sinDetalle ? 0 : 14}px;flex-wrap:wrap">
            <span style="padding:4px 10px;background:#f0fdf4;border-radius:99px;font-size:12px;font-weight:600;color:#15803d">
              ${vals.nuevos} nuevo${vals.nuevos !== 1 ? "s" : ""}
            </span>
            <span style="padding:4px 10px;background:#eff6ff;border-radius:99px;font-size:12px;font-weight:600;color:#1d4ed8">
              ${vals.actualizados} actualizado${vals.actualizados !== 1 ? "s" : ""}
            </span>
            <span style="padding:4px 10px;background:#fef2f2;border-radius:99px;font-size:12px;font-weight:600;color:#b91c1c">
              ${vals.eliminados} eliminado${vals.eliminados !== 1 ? "s" : ""}
            </span>
          </div>
          ${seccionNuevos}
          ${seccionEliminados}
        </div>`,
      confirmButtonText: "Entendido",
      confirmButtonColor: "#2B7A9E",
    });
  }

  // ── Exportar CSV ────────────────────────────────
  async function exportCSV() {
    const f = leerFiltros();
    const qs = new URLSearchParams({ limit: 9999, ...f });
    Object.keys(f).forEach(k => { if (!f[k]) qs.delete(k); });

    const res = await apiFetch(`/clientes-cobrar/documentos?${qs}`);
    if (!res || !res.ok) return;
    const data = await safeJson(res);
    if (!data.documentos?.length) { Swal.fire("Sin datos", "No hay documentos para exportar.", "info"); return; }

    const cols = ["cliente","identificacion","tipo_doc","centro_costos","numero_documento","fecha_emision","dias_vencimiento","cargos","cobrado","n_credito","retencion","saldo","observacion","estado"];
    const header = cols.join(",");
    const rows = data.documentos.map(d =>
      cols.map(c => `"${String(d[c] ?? "").replace(/"/g, '""')}"`).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: "data:text/csv;charset=utf-8," + encodeURIComponent(csv),
      download: `clientes_cobrar_${new Date().toISOString().slice(0,10)}.csv`,
    });
    a.click();
  }

  // ═══════════════════════════════════════════════════
  // PDF
  // ═══════════════════════════════════════════════════
  const PDF_PRIMARY = [30, 85, 112];
  const PDF_ACCENT  = [234, 88, 12];
  const PDF_GRAY    = [100, 116, 139];
  const PDF_DARK    = [15, 23, 42];

  function cargarImagenBase64(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async function construirCabeceraPDF(doc, titulo, subtitulo) {
    const pageW = doc.internal.pageSize.getWidth();
    const mL = 14;
    doc.setFillColor(...PDF_PRIMARY);
    doc.rect(0, 0, pageW, 3, "F");
    let logoX = mL;
    try {
      const logo = await cargarImagenBase64("img/logo.png");
      if (logo) { doc.addImage(logo, "PNG", mL, 6, 30, 15); logoX = mL + 34; }
    } catch { }
    doc.setFont("Roboto", "bold");   doc.setFontSize(14); doc.setTextColor(...PDF_PRIMARY);
    doc.text("GLOBAL MOTRIZ S.A.", logoX, 13);
    doc.setFont("Roboto", "normal"); doc.setFontSize(8);  doc.setTextColor(...PDF_GRAY);
    doc.text("Sistema de Gestión - Cuentas por Cobrar", logoX, 18);
    doc.setFont("Roboto", "bold");   doc.setFontSize(18); doc.setTextColor(...PDF_ACCENT);
    doc.text(titulo, pageW - mL, 12, { align: "right" });
    if (subtitulo) {
      doc.setFont("Roboto", "normal"); doc.setFontSize(8.5); doc.setTextColor(...PDF_GRAY);
      doc.text(subtitulo, pageW - mL, 18, { align: "right" });
    }
    doc.setDrawColor(...PDF_PRIMARY); doc.setLineWidth(0.4);
    doc.line(mL, 24, pageW - mL, 24);
    return 28;
  }

  async function pdfResumen() {
    if (!_resumenData?.clientes?.length) {
      return Swal.fire("Sin datos", "Carga el resumen primero.", "info");
    }
    if (!window.jspdf) {
      return Swal.fire("Error", "La librería PDF no está disponible.", "error");
    }

    Swal.fire({ title: "Generando PDF...", didOpen: () => Swal.showLoading() });
    try {
      const { jsPDF } = window.jspdf;
      const doc    = new jsPDF("p", "mm", "a4");
      const pageW  = doc.internal.pageSize.getWidth();
      const pageH  = doc.internal.pageSize.getHeight();
      const mL = 14; const mR = 14;
      const boxW   = pageW - mL - mR;
      const hoyStr = new Date().toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" });
      const priorMap = { "": "—", "1": "BAJA", "2": "MEDIA", "3": "ALTA" };
      const n = _resumenData.clientes.length;

      const TOP_USED    = 28 + 10 + 4;
      const TBL_FIXED   = 16;
      const BOTTOM_USED = 10;
      const availableH  = pageH - TOP_USED - TBL_FIXED - BOTTOM_USED;
      const targetRowH  = availableH / n;

      let fs, pad;
      if      (targetRowH >= 8)   { fs = 8.5; pad = 2.5; }
      else if (targetRowH >= 6.5) { fs = 7.5; pad = 2;   }
      else if (targetRowH >= 5)   { fs = 6.5; pad = 1.5; }
      else if (targetRowH >= 4)   { fs = 5.5; pad = 1;   }
      else                         { fs = 5;   pad = 0.8; }

      let y = await construirCabeceraPDF(doc, "CUENTAS POR COBRAR", `Resumen · ${hoyStr}`);

      const totalCobrarVal  = parseFloat(_resumenData.total_general || 0);
      const totalCobradoVal = parseFloat(_resumenData.total_cobrado || 0);
      const conPlanVal      = _resumenData.clientes.reduce((s, r) => s + parseFloat(r.por_cobrar || 0), 0);
      const docsVencidosVal = _resumenData.total_vencidos || 0;
      const kpis = [
        { label: "TOTAL POR COBRAR",   valor: fmtMoney(totalCobrarVal),  color: PDF_PRIMARY },
        { label: "TOTAL COBRADO",      valor: fmtMoney(totalCobradoVal), color: [21, 128, 61] },
        { label: "CON PLAN DE COBRO",  valor: fmtMoney(conPlanVal),      color: PDF_PRIMARY },
        { label: "DOCS VENCIDOS",      valor: String(docsVencidosVal),   color: docsVencidosVal === 0 ? [21, 128, 61] : [185, 28, 28] },
      ];
      doc.setFillColor(241, 245, 249); doc.setDrawColor(210, 220, 230);
      doc.roundedRect(mL, y, boxW, 10, 2, 2, "FD");
      const kpiW = boxW / 4;
      kpis.forEach((k, i) => {
        const cx = mL + i * kpiW + kpiW / 2;
        if (i > 0) {
          doc.setDrawColor(210, 220, 230); doc.setLineWidth(0.3);
          doc.line(mL + i * kpiW, y + 1.5, mL + i * kpiW, y + 8.5);
        }
        doc.setFont("Roboto", "normal"); doc.setFontSize(5.5); doc.setTextColor(...PDF_GRAY);
        doc.text(k.label, cx, y + 3.5, { align: "center" });
        doc.setFont("Roboto", "bold"); doc.setFontSize(8); doc.setTextColor(...k.color);
        doc.text(k.valor, cx, y + 8.5, { align: "center" });
      });
      y += 14;

      const totalSaldo  = _resumenData.clientes.reduce((s, r) => s + parseFloat(r.total_saldo  || 0), 0);
      const totalCobrar = _resumenData.clientes.reduce((s, r) => s + parseFloat(r.por_cobrar   || 0), 0);

      doc.autoTable({
        startY: y,
        head: [["#", "Cliente", "Docs", "Total Saldo", "Prioridad", "Por Cobrar"]],
        body: _resumenData.clientes.map((r, i) => [
          i + 1,
          r.cliente,
          r.cantidad_docs,
          fmtMoney(r.total_saldo),
          priorMap[String(r.prioridad || "")] || "—",
          fmtMoney(r.por_cobrar || 0),
        ]),
        foot: [[
          { content: "TOTALES", colSpan: 3, styles: { halign: "right", fontStyle: "bold" } },
          { content: fmtMoney(totalSaldo),  styles: { fontStyle: "bold", halign: "right" } },
          "",
          { content: fmtMoney(totalCobrar), styles: { fontStyle: "bold", halign: "right" } },
        ]],
        showFoot: "lastPage",
        margin: { left: mL, right: mR, bottom: 8 },
        styles: {
          fontSize: fs, cellPadding: pad,
          lineColor: [226, 232, 240], lineWidth: 0.2, font: "helvetica",
        },
        headStyles: {
          fillColor: PDF_PRIMARY, textColor: [255, 255, 255],
          fontStyle: "bold", font: "helvetica", fontSize: fs,
        },
        bodyStyles: { fontStyle: "bold", font: "helvetica" },
        footStyles: {
          fillColor: [241, 245, 249], textColor: PDF_DARK,
          fontStyle: "bold", font: "helvetica", fontSize: fs,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: "auto", overflow: "ellipsize" },
          2: { cellWidth: 12, halign: "center" },
          3: { cellWidth: 30, halign: "right" },
          4: { cellWidth: 20, halign: "center" },
          5: { cellWidth: 28, halign: "right" },
        },
        didParseCell: (data) => {
          if (data.section === "body") {
            const cli = _resumenData.clientes[data.row.index];
            if (String(cli?.prioridad || "") === "3") {
              data.cell.styles.fillColor = [254, 226, 226];
              data.cell.styles.textColor = [127, 29, 29];
            }
          }
        },
      });

      const finalY = doc.lastAutoTable.finalY + 4;
      doc.setFont("Roboto", "normal"); doc.setFontSize(6.5); doc.setTextColor(...PDF_GRAY);
      doc.text(`Generado: ${hoyStr}  ·  ${n} clientes`, pageW - mR, finalY, { align: "right" });

      doc.save(`resumen_clientes_cobrar_${new Date().toISOString().slice(0, 10)}.pdf`);
      Swal.close();
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "No se pudo generar el PDF.", "error");
    }
  }

  async function pdfPorCliente() {
    if (!_resumenData?.clientes?.length) {
      return Swal.fire("Sin datos", "Carga el resumen primero.", "info");
    }
    if (!window.jspdf) {
      return Swal.fire("Error", "La librería PDF no está disponible.", "error");
    }

    const checklistHTML = _resumenData.clientes.map(r => {
      const enc = r.cliente.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      return `<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:13px">
        <input type="checkbox" class="cli-pdf-check" value="${enc}" checked
          style="width:15px;height:15px;cursor:pointer;flex-shrink:0;accent-color:#2B7A9E"/>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${enc}">${enc}</span>
        <span style="color:#6b7280;font-size:12px;white-space:nowrap;font-variant-numeric:tabular-nums">${fmtMoney(r.total_saldo)}</span>
      </label>`;
    }).join("");

    const { isConfirmed, value: selClientes } = await Swal.fire({
      title: "Exportar por Cliente",
      width: 620,
      html: `
        <div style="text-align:left">
          <p style="font-size:13px;color:#6b7280;margin:0 0 10px">
            Selecciona los clientes a incluir en el reporte:
          </p>
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <button type="button"
              onclick="document.querySelectorAll('.cli-pdf-check').forEach(c=>c.checked=true)"
              style="font-size:12px;padding:4px 12px;border:1px solid #d1d5db;border-radius:6px;background:#f9fafb;cursor:pointer;font-family:inherit">
              Todos
            </button>
            <button type="button"
              onclick="document.querySelectorAll('.cli-pdf-check').forEach(c=>c.checked=false)"
              style="font-size:12px;padding:4px 12px;border:1px solid #d1d5db;border-radius:6px;background:#f9fafb;cursor:pointer;font-family:inherit">
              Ninguno
            </button>
          </div>
          <div style="max-height:340px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px">
            ${checklistHTML}
          </div>
        </div>`,
      showCancelButton: true,
      confirmButtonText: "Generar PDF",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#2B7A9E",
      cancelButtonColor: "#9ca3af",
      focusConfirm: false,
      preConfirm: () => {
        const sel = [...document.querySelectorAll(".cli-pdf-check:checked")].map(c => c.value);
        if (!sel.length) { Swal.showValidationMessage("Selecciona al menos un cliente."); return false; }
        return sel;
      },
    });
    if (!isConfirmed) return;

    Swal.fire({ title: "Generando PDF...", didOpen: () => Swal.showLoading() });
    try {
      const res = await apiFetch("/clientes-cobrar/documentos-detalle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientes: selClientes }),
      });
      if (!res || !res.ok) throw new Error("Error al obtener documentos del servidor.");
      const { documentos } = await safeJson(res);

      const grupos = {};
      selClientes.forEach(p => { grupos[p] = []; });
      documentos.forEach(d => { if (grupos[d.cliente] !== undefined) grupos[d.cliente].push(d); });

      const { jsPDF } = window.jspdf;
      const doc    = new jsPDF("p", "mm", "a4");
      const pageW  = doc.internal.pageSize.getWidth();
      const pageH  = doc.internal.pageSize.getHeight();
      const mL = 14; const mR = 14;
      const boxW   = pageW - mL - mR;
      const hoyStr = new Date().toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" });

      const BANNER_H = 10;
      const ROW_H    = 6.5;
      const TBL_HDR  = 8;
      const TBL_FTR  = 7;
      const BOTTOM_M = 12;
      const START_Y  = 10;
      const PAGE_USE = pageH - START_Y - BOTTOM_M;

      let y = START_Y;

      for (let pi = 0; pi < selClientes.length; pi++) {
        const cliName = selClientes[pi];
        const docs    = grupos[cliName] || [];
        const cliInfo = _resumenData.clientes.find(r => r.cliente === cliName);

        if (pi > 0) {
          const estH      = BANNER_H + 2 + (docs.length ? TBL_HDR + docs.length * ROW_H + TBL_FTR : 8);
          const remaining = pageH - BOTTOM_M - y;
          let newPage;

          if (estH <= PAGE_USE) {
            newPage = estH > remaining;
          } else {
            newPage = remaining < (BANNER_H + 2 + TBL_HDR + 5 * ROW_H);
          }

          if (newPage) {
            doc.addPage();
            y = START_Y;
          } else {
            y += 3;
            doc.setDrawColor(210, 220, 230); doc.setLineWidth(0.25);
            doc.line(mL, y, pageW - mR, y);
            y += 4;
          }
        }

        doc.setFillColor(...PDF_PRIMARY);
        doc.roundedRect(mL, y, boxW, BANNER_H, 2, 2, "F");

        doc.setFont("Roboto", "bold"); doc.setFontSize(9);
        let nameTxt = cliName;
        const maxNW = boxW * 0.55;
        while (doc.getTextWidth(nameTxt) > maxNW && nameTxt.length > 6) nameTxt = nameTxt.slice(0, -1);
        if (nameTxt !== cliName) nameTxt += "…";
        doc.setTextColor(255, 255, 255);
        doc.text(nameTxt, mL + 4, y + 7);

        doc.setFont("Roboto", "normal"); doc.setFontSize(5.5); doc.setTextColor(185, 215, 235);
        doc.text(hoyStr, pageW - mR - 4, y + 3.5, { align: "right" });

        if (cliInfo) {
          const infoTxt = `${cliInfo.cantidad_docs} docs  ·  ${fmtMoney(cliInfo.total_saldo)}  ·  Por cobrar: ${fmtMoney(cliInfo.por_cobrar || 0)}`;
          doc.setFontSize(6.5); doc.setTextColor(255, 255, 255);
          doc.text(infoTxt, pageW - mR - 4, y + 8.5, { align: "right" });
        }
        y += BANNER_H + 2;

        if (!docs.length) {
          doc.setFont("Roboto", "normal"); doc.setFontSize(8.5); doc.setTextColor(...PDF_GRAY);
          doc.text("Sin documentos activos.", mL + 4, y + 5);
          y += 10;
          continue;
        }

        const totalCli  = docs.reduce((s, d) => s + parseFloat(d.saldo || 0), 0);
        const bannerName = nameTxt;

        doc.autoTable({
          startY: y,
          head: [["N° Documento", "Tipo", "Centro", "Fecha Emisión", "Días Venc.", "Cargos", "Saldo", "Observación"]],
          body: docs.map(d => [
            d.numero_documento,
            d.tipo_doc || "—",
            fmtCentro(d.centro_costos),
            fmtFecha(d.fecha_emision),
            d.dias_vencimiento != null ? `${d.dias_vencimiento}d` : "—",
            fmtMoney(d.cargos),
            fmtMoney(d.saldo),
            d.observacion || "",
          ]),
          foot: [[
            { content: "TOTAL", colSpan: 6, styles: { halign: "right", fontStyle: "bold" } },
            { content: fmtMoney(totalCli), styles: { fontStyle: "bold", halign: "right" } },
            "",
          ]],
          showFoot: "lastPage",
          rowPageBreak: "avoid",
          margin: { left: mL, right: mR, bottom: BOTTOM_M, top: 17 },
          styles: {
            fontSize: 7.5, cellPadding: 2,
            lineColor: [226, 232, 240], lineWidth: 0.3, font: "helvetica",
            fontStyle: "normal",
            overflow: "ellipsize",
            minCellHeight: 0,
          },
          headStyles: {
            fillColor: [52, 109, 139], textColor: [255, 255, 255],
            fontStyle: "bold", font: "helvetica", fontSize: 7.5,
          },
          bodyStyles: { fontStyle: "normal" },
          footStyles: {
            fillColor: [241, 245, 249], textColor: PDF_DARK,
            fontStyle: "bold", font: "helvetica",
          },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          columnStyles: {
            0: { cellWidth: 36 },
            1: { cellWidth: 22 },
            2: { cellWidth: 20, halign: "center" },
            3: { cellWidth: 20, halign: "center" },
            4: { cellWidth: 16, halign: "center" },
            5: { cellWidth: 22, halign: "right" },
            6: { cellWidth: 22, halign: "right" },
            7: { cellWidth: "auto" },
          },
          didParseCell: (data) => {
            if (data.section === "body" && data.column.index === 1) {
              const len = String(data.cell.raw || "").length;
              if      (len > 12) data.cell.styles.fontSize = 5.5;
              else if (len > 8)  data.cell.styles.fontSize = 6.5;
            }
          },
          didDrawPage: (data) => {
            if (data.pageNumber > 1) {
              doc.setFillColor(52, 109, 139);
              doc.roundedRect(mL, 7, boxW, 7, 1, 1, "F");
              doc.setFont("Roboto", "bold"); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
              doc.text(bannerName, mL + 3, 12);
              doc.setFont("Roboto", "normal"); doc.setFontSize(6);
              doc.text("continuación · " + hoyStr, pageW - mR - 3, 12, { align: "right" });
            }
          },
        });

        y = doc.lastAutoTable.finalY + 3;
      }

      doc.save(`desglose_clientes_cobrar_${new Date().toISOString().slice(0, 10)}.pdf`);
      Swal.close();
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "No se pudo generar el PDF.", "error");
    }
  }

  // ── Tabs ────────────────────────────────────────
  function initTabs() {
    document.querySelectorAll(".prov-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".prov-tab").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".prov-tab-panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        const panel = document.getElementById(`panel-${btn.dataset.tab}`);
        if (panel) panel.classList.add("active");

        if (btn.dataset.tab === "resumen") cargarResumen();
        if (btn.dataset.tab === "antiguedad") {
          if (!_resumenData) {
            cargarResumen().then(() => cargarAntiguedad());
          } else {
            cargarAntiguedad();
          }
        }
      });
    });
  }

  // ── Init ────────────────────────────────────────
  async function init() {
    initTabs();

    await cargarFiltros();
    await cargarDocumentos(1);

    document.getElementById("btn-importar-cli")?.addEventListener("click", importar);
    document.getElementById("btn-export-csv-cli")?.addEventListener("click", exportCSV);

    document.getElementById("btn-filtrar-cli")?.addEventListener("click", () => cargarDocumentos(1));
    document.getElementById("btn-limpiar-cli")?.addEventListener("click", () => {
      ["f-estado","f-centro","f-tipo","f-responsable"].forEach(id => { const el = document.getElementById(id); if (el) el.value = id === "f-estado" ? "ACTIVO" : ""; });
      ["f-cliente","f-desde","f-hasta"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
      const sv = document.getElementById("f-solo-vencidos"); if (sv) sv.checked = false;
      cargarDocumentos(1);
    });
    const inpCli = document.getElementById("f-cliente");
    inpCli?.addEventListener("input",  mostrarSugerencias);
    inpCli?.addEventListener("blur",   () => setTimeout(ocultarDropdown, 150));
    inpCli?.addEventListener("keydown", e => {
      if (e.key === "Enter")  { ocultarDropdown(); cargarDocumentos(1); }
      if (e.key === "Escape") ocultarDropdown();
    });

    document.getElementById("btn-prev-doc")?.addEventListener("click", () => cargarDocumentos(paginaDoc - 1));
    document.getElementById("btn-next-doc")?.addEventListener("click", () => cargarDocumentos(paginaDoc + 1));

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

    document.getElementById("btn-filtrar-res")?.addEventListener("click",  cargarResumen);
    document.getElementById("btn-guardar-todos")?.addEventListener("click", guardarTodos);
    document.getElementById("btn-pdf-resumen")?.addEventListener("click",   pdfResumen);
    document.getElementById("btn-pdf-cli")?.addEventListener("click",      pdfPorCliente);
  }

  document.addEventListener("DOMContentLoaded", init);

  return { actualizarBarraSeleccion, editarObsClick, seleccionarSugerencia, guardarAbono, guardarTodos, guardarResponsable };

})();
