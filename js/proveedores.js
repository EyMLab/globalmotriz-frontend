// =====================================================
// proveedores.js — Módulo Cuentas por Pagar
// =====================================================

const PROV = (() => {

  // ── Estado interno ──────────────────────────────
  let paginaDoc        = 1;
  let totalPagDoc      = 1;
  let _disponible      = 0;
  let _proveedoresList = [];   // lista para autocomplete
  let _resumenData     = null; // cache del último resumen cargado (para PDFs)
  let _cardActiva      = null;

  const ESTADOS_GESTION_PROV = ["CAJA CHICA", "BANCOS", "SANTIAGO"];

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

  // ── Tarjetas de estado ──────────────────────────
  function activarCard(valor) {
    const container = document.getElementById("cards-estado-prov");
    if (_cardActiva === valor) {
      _cardActiva = null;
      container.classList.remove("cards-con-activa");
      container.querySelectorAll(".estado-card").forEach(b => b.classList.remove("card-activa"));
    } else {
      _cardActiva = valor;
      container.classList.add("cards-con-activa");
      container.querySelectorAll(".estado-card").forEach(b => {
        b.classList.toggle("card-activa", b.dataset.card === valor);
      });
      // Limpiar dropdown para que no se mezclen
      const sel = document.getElementById("f-estado-gestion-prov");
      if (sel) sel.value = "";
    }
    cargarDocumentos(1);
  }

  async function actualizarCards() {
    const estadoDoc = document.getElementById("f-estado")?.value || "";
    const qs = estadoDoc ? `?estado=${encodeURIComponent(estadoDoc)}` : "";
    const res = await apiFetch(`/proveedores-pagar/cards${qs}`);
    if (!res || !res.ok) return;
    const data = await safeJson(res);
    const map = {};
    (data.cards || []).forEach(r => { map[r.estado_gestion] = r.cantidad; });
    const el = id => document.getElementById(id);
    if (el("ec-n-cajachica"))      el("ec-n-cajachica").textContent      = map["CAJA CHICA"] || 0;
    if (el("ec-n-bancos"))         el("ec-n-bancos").textContent         = map["BANCOS"]     || 0;
    if (el("ec-n-santiago"))       el("ec-n-santiago").textContent       = map["SANTIAGO"]   || 0;
    if (el("ec-n-sinestado-prov")) el("ec-n-sinestado-prov").textContent = map["SIN ESTADO"] || 0;
  }

  // ── Gestión modal ──────────────────────────────
  function editarGestionClick(btn) {
    editarGestion(btn.dataset.num, btn.dataset.obs || "", btn.dataset.resp || "", btn.dataset.eg || "");
  }

  async function editarGestion(numDoc, obsActual, respActual, egActual) {
    const optsEG = ["", ...ESTADOS_GESTION_PROV].map(e =>
      `<option value="${e}"${e === egActual ? " selected" : ""}>${e || "— Sin estado —"}</option>`
    ).join("");

    const { isConfirmed, value: vals } = await Swal.fire({
      title: "Gestión del documento",
      width: 540,
      html: `
        <div style="text-align:left">
          <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Documento</div>
          <div style="font-family:monospace;font-size:13px;color:#1e40af;background:#eff6ff;padding:6px 10px;border-radius:6px;margin-bottom:14px">${numDoc}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
            <div>
              <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Estado</div>
              <select id="swal-eg" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-family:inherit;color:#111827;height:38px">${optsEG}</select>
            </div>
            <div>
              <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Responsable</div>
              <input type="text" id="swal-resp" value="${respActual}" placeholder="Nombre…"
                style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-family:inherit;outline:none;color:#111827"/>
            </div>
          </div>
          <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Observación</div>
          <textarea id="swal-obs" rows="4"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;line-height:1.5;outline:none;color:#111827"
          >${obsActual}</textarea>
        </div>`,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      confirmButtonColor: "#2B7A9E",
      cancelButtonText: "Cancelar",
      cancelButtonColor: "#9ca3af",
      focusConfirm: false,
      preConfirm: () => ({
        estado_gestion: document.getElementById("swal-eg").value,
        responsable: document.getElementById("swal-resp").value.trim(),
        observacion: document.getElementById("swal-obs").value.trim(),
      }),
    });
    if (!isConfirmed || !vals) return;

    const res = await apiFetch(`/proveedores-pagar/documentos/${encodeURIComponent(numDoc)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        observacion: vals.observacion,
        responsable: vals.responsable,
        estado_gestion: vals.estado_gestion || null,
      }),
    });
    if (!res || !res.ok) { Swal.fire("Error", "No se pudo guardar.", "error"); return; }
    cargarDocumentos(paginaDoc);
    actualizarCards();
  }

  // ── Filtros documentos ───────────────────────────
  function leerFiltros() {
    // Card tiene prioridad sobre dropdown; si no hay card, usa el dropdown
    const egCard = _cardActiva || "";
    const egDrop = document.getElementById("f-estado-gestion-prov")?.value || "";
    return {
      estado:          document.getElementById("f-estado")?.value    || "",
      proveedor:       document.getElementById("f-proveedor")?.value.trim() || "",
      tipo_doc:        document.getElementById("f-tipo")?.value      || "",
      centro_costos:   document.getElementById("f-centro")?.value    || "",
      fecha_desde:     document.getElementById("f-desde")?.value     || "",
      fecha_hasta:     document.getElementById("f-hasta")?.value     || "",
      estado_gestion:  egCard || egDrop,
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

    // Guardar lista para autocomplete personalizado
    _proveedoresList = data.proveedores || [];
  }

  // ── Autocomplete proveedor ───────────────────────
  function mostrarSugerencias() {
    const input    = document.getElementById("f-proveedor");
    const dropdown = document.getElementById("prov-dropdown");
    if (!input || !dropdown) return;

    const q = input.value.trim().toLowerCase();
    if (q.length < 1) { dropdown.style.display = "none"; return; }

    const matches = _proveedoresList
      .filter(p => p.toLowerCase().includes(q))
      .slice(0, 12);

    if (!matches.length) { dropdown.style.display = "none"; return; }

    dropdown.innerHTML = matches.map(p => {
      const enc = p.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
      // resaltar la parte que coincide
      const re  = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")})`, "gi");
      const hl  = enc.replace(re, `<strong>$1</strong>`);
      return `<div class="prov-suggestion" data-val="${enc}" onmousedown="PROV.seleccionarSugerencia(this)">${hl}</div>`;
    }).join("");
    dropdown.style.display = "block";
  }

  function seleccionarSugerencia(el) {
    const input = document.getElementById("f-proveedor");
    if (input) input.value = el.dataset.val;
    document.getElementById("prov-dropdown").style.display = "none";
  }

  function ocultarDropdown() {
    const d = document.getElementById("prov-dropdown");
    if (d) d.style.display = "none";
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
        const obsEnc = (d.observacion || "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        const numEnc = d.numero_documento.replace(/&/g,"&amp;").replace(/"/g,"&quot;");
        const respEnc = (d.responsable || "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        const rowStyle = descartado ? 'background:#f9fafb;opacity:.65;' : '';
        const tieneGestion = !!(d.observacion || "").trim() || !!(d.responsable || "").trim() || !!(d.estado_gestion || "").trim();
        const btnIcon = tieneGestion ? "⚙" : "+";
        const btnClass = tieneGestion ? "btn-gestion tiene-datos" : "btn-gestion";
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
          <td style="text-align:center;font-size:11px;font-weight:600">${d.estado_gestion || "—"}</td>
          <td style="text-align:center"><button class="${btnClass}" data-num="${numEnc}" data-obs="${obsEnc}" data-resp="${respEnc}" data-eg="${(d.estado_gestion||"").replace(/"/g,"&quot;")}" onclick="PROV.editarGestionClick(this)" title="Gestión">${btnIcon}</button></td>
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
    actualizarCards();
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
    _resumenData = data;  // guardar para PDFs
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
      const refEnc   = (r.referencia || "").replace(/"/g, "&quot;");
      return `<tr class="${rowClass}" data-proveedor="${provEnc}">
        <td style="color:var(--text-light);font-size:12px">${i + 1}</td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.proveedor}">${r.proveedor}</td>
        <td><input type="text" class="input-ref" value="${refEnc}" placeholder="" maxlength="50" data-campo="referencia" data-proveedor="${provEnc}"/></td>
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
    const prioridad  = tr?.querySelector("[data-campo='prioridad']")?.value;
    const por_abonar = tr?.querySelector("[data-campo='por_abonar']")?.value;
    const referencia = tr?.querySelector("[data-campo='referencia']")?.value.trim() || null;

    const res = await apiFetch(`/proveedores-pagar/resumen/${provEnc}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prioridad:  prioridad  ? parseInt(prioridad)    : null,
        por_abonar: por_abonar ? parseFloat(por_abonar) : null,
        referencia,
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
      const referencia = tr.querySelector("[data-campo='referencia']")?.value.trim() || null;
      const res = await apiFetch(`/proveedores-pagar/resumen/${provEnc}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prioridad:  prioridad  ? parseInt(prioridad)    : null,
          por_abonar: por_abonar ? parseFloat(por_abonar) : null,
          referencia,
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
    // Solo suma los conceptos que NO están marcados como pagados
    const total = [...document.querySelectorAll("#tbody-conceptos tr")].reduce((s, tr) => {
      const pagado = tr.querySelector(".c-pagado")?.checked;
      if (pagado) return s;   // ya pagado → no se descuenta del disponible
      return s + (parseFloat(tr.querySelector(".c-monto")?.value) || 0);
    }, 0);
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
        <td style="text-align:center"><input type="checkbox" class="c-pagado" ${c.pagado ? "checked" : ""} onchange="PROV.actualizarTotalFijo()"/></td>
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
      <td style="text-align:center"><input type="checkbox" class="c-pagado" onchange="PROV.actualizarTotalFijo()"/></td>
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

    // Construir modal de detalle
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
                <span style="color:#6b7280"> — ${d.proveedor}</span>
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
                <span style="color:#6b7280"> — ${d.proveedor}</span>
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

  // ═══════════════════════════════════════════════════
  // PDF — helpers compartidos
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
    doc.text("Sistema de Gestión - Cuentas por Pagar", logoX, 18);
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

  function pdfNumerarPaginas(doc, hoyStr) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFont("Roboto", "normal"); doc.setFontSize(7); doc.setTextColor(...PDF_GRAY);
      doc.text(`GlobalMotriz · Generado: ${hoyStr}`, 14, pageH - 6);
      doc.text(`Página ${i} de ${total}`, pageW - 14, pageH - 6, { align: "right" });
    }
  }

  // ── PDF: Resumen general — siempre en una sola hoja ──
  async function pdfResumen() {
    if (!_resumenData?.proveedores?.length) {
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
      const n = _resumenData.proveedores.length; // número de proveedores

      // ── Auto-escalado: calcular font+padding para caber en 1 hoja ─────────
      // Header PDF: 28mm  |  KPI strip compacto: 10mm  |  gap: 4mm
      // Overhead tabla (th + footer): 16mm  |  Margen inferior: 10mm
      const TOP_USED    = 28 + 10 + 4;  // 42mm
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

      let y = await construirCabeceraPDF(doc, "CUENTAS POR PAGAR", `Resumen · ${hoyStr}`);

      // ── KPI strip compacto (una sola línea, 10mm) ─
      const totalDeudaVal = parseFloat(_resumenData.total_general || 0);
      const conPlanVal    = _resumenData.proveedores.reduce((s, r) => s + parseFloat(r.por_abonar || 0), 0);
      const diferenciaVal = _disponible - conPlanVal;
      const kpis = [
        { label: "TOTAL DEUDA ACTIVA", valor: fmtMoney(totalDeudaVal), color: PDF_PRIMARY },
        { label: "DISPONIBLE DEL MES",  valor: fmtMoney(_disponible),   color: [21, 128, 61] },
        { label: "CON PLAN DE ABONO",  valor: fmtMoney(conPlanVal),    color: PDF_PRIMARY },
        { label: "DIFERENCIA",         valor: fmtMoney(diferenciaVal), color: diferenciaVal >= 0 ? [21, 128, 61] : [185, 28, 28] },
      ];
      // Fondo del strip
      doc.setFillColor(241, 245, 249); doc.setDrawColor(210, 220, 230);
      doc.roundedRect(mL, y, boxW, 10, 2, 2, "FD");
      const kpiW = boxW / 4;
      kpis.forEach((k, i) => {
        const cx = mL + i * kpiW + kpiW / 2;
        // Separadores verticales entre KPIs
        if (i > 0) {
          doc.setDrawColor(210, 220, 230); doc.setLineWidth(0.3);
          doc.line(mL + i * kpiW, y + 1.5, mL + i * kpiW, y + 8.5);
        }
        // Label pequeño
        doc.setFont("Roboto", "normal"); doc.setFontSize(5.5); doc.setTextColor(...PDF_GRAY);
        doc.text(k.label, cx, y + 3.5, { align: "center" });
        // Valor en negrita y color
        doc.setFont("Roboto", "bold"); doc.setFontSize(8); doc.setTextColor(...k.color);
        doc.text(k.valor, cx, y + 8.5, { align: "center" });
      });
      y += 14; // 10mm strip + 4mm gap

      // ── Tabla proveedores (auto-escalada) ─────────
      const totalSaldo  = _resumenData.proveedores.reduce((s, r) => s + parseFloat(r.total_saldo  || 0), 0);
      const totalAbonar = _resumenData.proveedores.reduce((s, r) => s + parseFloat(r.por_abonar   || 0), 0);

      doc.autoTable({
        startY: y,
        head: [["#", "Proveedor", "Referencia", "Docs", "Total Saldo", "Prioridad", "Por Abonar"]],
        body: _resumenData.proveedores.map((r, i) => [
          i + 1,
          r.proveedor,
          r.referencia || "",
          r.cantidad_docs,
          fmtMoney(r.total_saldo),
          priorMap[String(r.prioridad || "")] || "—",
          fmtMoney(r.por_abonar || 0),
        ]),
        foot: [[
          { content: "TOTALES", colSpan: 4, styles: { halign: "right", fontStyle: "bold" } },
          { content: fmtMoney(totalSaldo),  styles: { fontStyle: "bold", halign: "right" } },
          "",
          { content: fmtMoney(totalAbonar), styles: { fontStyle: "bold", halign: "right" } },
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
        bodyStyles: {
          fontStyle: "bold", font: "helvetica",
        },
        footStyles: {
          fillColor: [241, 245, 249], textColor: PDF_DARK,
          fontStyle: "bold", font: "helvetica", fontSize: fs,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: "auto", overflow: "ellipsize" }, // Proveedor — nunca wrap
          2: { cellWidth: 28, overflow: "ellipsize" },     // Referencia — nunca wrap
          3: { cellWidth: 12, halign: "center" },
          4: { cellWidth: 30, halign: "right" },
          5: { cellWidth: 20, halign: "center" },
          6: { cellWidth: 28, halign: "right" },
        },
        // Pintar de rojo suave las filas con prioridad ALTA (valor "3")
        didParseCell: (data) => {
          if (data.section === "body") {
            const prov = _resumenData.proveedores[data.row.index];
            if (String(prov?.prioridad || "") === "3") {
              data.cell.styles.fillColor = [254, 226, 226]; // rojo muy suave
              data.cell.styles.textColor = [127, 29, 29];   // rojo oscuro legible
            }
          }
        },
      });

      // Fecha de generación al pie (misma hoja)
      const finalY = doc.lastAutoTable.finalY + 4;
      doc.setFont("Roboto", "normal"); doc.setFontSize(6.5); doc.setTextColor(...PDF_GRAY);
      doc.text(`Generado: ${hoyStr}  ·  ${n} proveedores`, pageW - mR, finalY, { align: "right" });

      doc.save(`resumen_proveedores_${new Date().toISOString().slice(0, 10)}.pdf`);
      Swal.close();
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "No se pudo generar el PDF.", "error");
    }
  }

  // ── PDF: Desglose por proveedor ──────────────────
  async function pdfPorProveedor() {
    if (!_resumenData?.proveedores?.length) {
      return Swal.fire("Sin datos", "Carga el resumen primero.", "info");
    }
    if (!window.jspdf) {
      return Swal.fire("Error", "La librería PDF no está disponible.", "error");
    }

    // ── Modal de selección ───────────────────────
    const checklistHTML = _resumenData.proveedores.map(r => {
      const enc = r.proveedor.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      return `<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:13px">
        <input type="checkbox" class="prov-pdf-check" value="${enc}" checked
          style="width:15px;height:15px;cursor:pointer;flex-shrink:0;accent-color:#2B7A9E"/>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${enc}">${enc}</span>
        <span style="color:#6b7280;font-size:12px;white-space:nowrap;font-variant-numeric:tabular-nums">${fmtMoney(r.total_saldo)}</span>
      </label>`;
    }).join("");

    const { isConfirmed, value: selProveedores } = await Swal.fire({
      title: "Exportar por Proveedor",
      width: 620,
      html: `
        <div style="text-align:left">
          <p style="font-size:13px;color:#6b7280;margin:0 0 10px">
            Selecciona los proveedores a incluir en el reporte (desglose de facturas activas):
          </p>
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <button type="button"
              onclick="document.querySelectorAll('.prov-pdf-check').forEach(c=>c.checked=true)"
              style="font-size:12px;padding:4px 12px;border:1px solid #d1d5db;border-radius:6px;background:#f9fafb;cursor:pointer;font-family:inherit">
              Todos
            </button>
            <button type="button"
              onclick="document.querySelectorAll('.prov-pdf-check').forEach(c=>c.checked=false)"
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
        const sel = [...document.querySelectorAll(".prov-pdf-check:checked")].map(c => c.value);
        if (!sel.length) { Swal.showValidationMessage("Selecciona al menos un proveedor."); return false; }
        return sel;
      },
    });
    if (!isConfirmed) return;

    Swal.fire({ title: "Generando PDF...", didOpen: () => Swal.showLoading() });
    try {
      // ── Traer documentos del backend ─────────────
      const res = await apiFetch("/proveedores-pagar/documentos-detalle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proveedores: selProveedores }),
      });
      if (!res || !res.ok) throw new Error("Error al obtener documentos del servidor.");
      const { documentos } = await safeJson(res);

      // Agrupar por proveedor en el orden seleccionado
      const grupos = {};
      selProveedores.forEach(p => { grupos[p] = []; });
      documentos.forEach(d => { if (grupos[d.proveedor] !== undefined) grupos[d.proveedor].push(d); });

      // ── Generar PDF ───────────────────────────────
      const { jsPDF } = window.jspdf;
      const doc    = new jsPDF("p", "mm", "a4");
      const pageW  = doc.internal.pageSize.getWidth();
      const pageH  = doc.internal.pageSize.getHeight();
      const mL = 14; const mR = 14;
      const boxW   = pageW - mL - mR;
      const hoyStr = new Date().toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" });

      // Constantes de layout compacto
      const BANNER_H   = 10;   // banner más delgado
      const ROW_H      = 6.5; // altura fila una sola línea (7.5pt + pad 2)
      const TBL_HDR    = 8;    // encabezado de tabla
      const TBL_FTR    = 7;    // fila total
      const BOTTOM_M   = 12;
      const START_Y    = 10;
      const PAGE_USE   = pageH - START_Y - BOTTOM_M; // espacio útil en hoja en blanco

      let y = START_Y;

      for (let pi = 0; pi < selProveedores.length; pi++) {
        const provName = selProveedores[pi];
        const docs     = grupos[provName] || [];
        const provInfo = _resumenData.proveedores.find(r => r.proveedor === provName);

        // ── Lógica de salto de página ─────────────
        if (pi > 0) {
          const estH      = BANNER_H + 2 + (docs.length ? TBL_HDR + docs.length * ROW_H + TBL_FTR : 8);
          const remaining = pageH - BOTTOM_M - y;
          let newPage;

          if (estH <= PAGE_USE) {
            // El proveedor cabe entero en una hoja → solo mueve si no hay espacio aquí
            newPage = estH > remaining;
          } else {
            // Proveedor muy grande (siempre multi-página) → mueve solo si queda poco
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

        // ── Banner compacto (10mm) ────────────────
        doc.setFillColor(...PDF_PRIMARY);
        doc.roundedRect(mL, y, boxW, BANNER_H, 2, 2, "F");

        // Nombre del proveedor (izquierda, grande)
        doc.setFont("Roboto", "bold"); doc.setFontSize(9);
        let nameTxt = provName;
        const maxNW = boxW * 0.55;
        while (doc.getTextWidth(nameTxt) > maxNW && nameTxt.length > 6) nameTxt = nameTxt.slice(0, -1);
        if (nameTxt !== provName) nameTxt += "…";
        doc.setTextColor(255, 255, 255);
        doc.text(nameTxt, mL + 4, y + 7);

        // Fecha (derecha arriba, muy pequeña)
        doc.setFont("Roboto", "normal"); doc.setFontSize(5.5); doc.setTextColor(185, 215, 235);
        doc.text(hoyStr, pageW - mR - 4, y + 3.5, { align: "right" });

        // Info (derecha abajo)
        if (provInfo) {
          const infoTxt = `${provInfo.cantidad_docs} docs  ·  ${fmtMoney(provInfo.total_saldo)}  ·  Por abonar: ${fmtMoney(provInfo.por_abonar || 0)}`;
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

        // ── Tabla de documentos ───────────────────
        const totalProv  = docs.reduce((s, d) => s + parseFloat(d.saldo || 0), 0);
        const bannerName = nameTxt;

        doc.autoTable({
          startY: y,
          head: [["N° Documento", "Tipo", "Centro", "Fecha Emisión", "Saldo", "Observación"]],
          body: docs.map(d => [
            d.numero_documento,
            d.tipo_doc || "—",
            fmtCentro(d.centro_costos),
            fmtFecha(d.fecha_emision),
            fmtMoney(d.saldo),
            d.observacion || "",
          ]),
          foot: [[
            { content: "TOTAL", colSpan: 4, styles: { halign: "right", fontStyle: "bold" } },
            { content: fmtMoney(totalProv), styles: { fontStyle: "bold", halign: "right" } },
            "",
          ]],
          showFoot: "lastPage",
          rowPageBreak: "avoid",
          margin: { left: mL, right: mR, bottom: BOTTOM_M, top: 17 },
          styles: {
            // Fuente normal (no bold): más legible, menos tosca
            fontSize: 7.5, cellPadding: 2,
            lineColor: [226, 232, 240], lineWidth: 0.3, font: "helvetica",
            fontStyle: "normal",
            // TODAS las celdas en una sola línea — nunca wrap
            overflow: "ellipsize",
            minCellHeight: 0,
          },
          headStyles: {
            fillColor: [52, 109, 139], textColor: [255, 255, 255],
            fontStyle: "bold", font: "helvetica", fontSize: 7.5,
          },
          bodyStyles: {
            fontStyle: "normal",
          },
          footStyles: {
            fillColor: [241, 245, 249], textColor: PDF_DARK,
            fontStyle: "bold", font: "helvetica",
          },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          columnStyles: {
            0: { cellWidth: 38 },                        // N° Doc (38mm = suficiente para 001-001-000001234)
            1: { cellWidth: 24 },                        // Tipo (24mm para que "NOTA DE CRÉDITO" entre)
            2: { cellWidth: 22, halign: "center" },      // Centro
            3: { cellWidth: 21, halign: "center" },      // Fecha
            4: { cellWidth: 24, halign: "right" },       // Saldo
            5: { cellWidth: "auto" },                    // Observación — resto, una sola línea
          },
          // Reducir fuente en col Tipo si el texto es más largo que "FACTURA"
          didParseCell: (data) => {
            if (data.section === "body" && data.column.index === 1) {
              const len = String(data.cell.raw || "").length;
              if      (len > 12) data.cell.styles.fontSize = 5.5;
              else if (len > 8)  data.cell.styles.fontSize = 6.5;
            }
          },
          didDrawPage: (data) => {
            // Mini-banner en páginas de continuación (compacto 7mm)
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

      doc.save(`desglose_proveedores_${new Date().toISOString().slice(0, 10)}.pdf`);
      Swal.close();
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "No se pudo generar el PDF.", "error");
    }
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
    // Si el usuario es "control" → marca el body para ocultar acciones de escritura
    if (localStorage.getItem('rol') === 'control') {
      document.body.classList.add('rol-control');
    }

    initTabs();

    // Período por defecto
    const inpPeriodo = document.getElementById("inp-periodo");
    if (inpPeriodo) inpPeriodo.value = periodoActual();

    await cargarFiltros();
    await cargarDocumentos(1);
    actualizarCards();

    // Card click events
    document.querySelectorAll("#cards-estado-prov .estado-card").forEach(btn => {
      btn.addEventListener("click", () => activarCard(btn.dataset.card));
    });

    // Eventos toolbar
    document.getElementById("btn-importar-prov")?.addEventListener("click", importar);
    document.getElementById("btn-export-csv-prov")?.addEventListener("click", exportCSV);

    // Eventos filtros documentos
    document.getElementById("btn-filtrar-prov")?.addEventListener("click", () => {
      _cardActiva = null;
      document.getElementById("cards-estado-prov")?.classList.remove("cards-con-activa");
      document.querySelectorAll("#cards-estado-prov .estado-card").forEach(b => b.classList.remove("card-activa"));
      cargarDocumentos(1);
    });
    document.getElementById("btn-limpiar-prov")?.addEventListener("click", () => {
      ["f-estado","f-centro","f-tipo","f-estado-gestion-prov"].forEach(id => { const el = document.getElementById(id); if (el) el.value = id === "f-estado" ? "ACTIVO" : ""; });
      ["f-proveedor","f-desde","f-hasta"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
      _cardActiva = null;
      document.getElementById("cards-estado-prov")?.classList.remove("cards-con-activa");
      document.querySelectorAll("#cards-estado-prov .estado-card").forEach(b => b.classList.remove("card-activa"));
      cargarDocumentos(1);
    });
    const inpProv = document.getElementById("f-proveedor");
    inpProv?.addEventListener("input",  mostrarSugerencias);
    inpProv?.addEventListener("blur",   () => setTimeout(ocultarDropdown, 150));
    inpProv?.addEventListener("keydown", e => {
      if (e.key === "Enter")  { ocultarDropdown(); cargarDocumentos(1); }
      if (e.key === "Escape") ocultarDropdown();
    });

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
    document.getElementById("btn-pdf-resumen")?.addEventListener("click",   pdfResumen);
    document.getElementById("btn-pdf-prov")?.addEventListener("click",      pdfPorProveedor);

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
  return { actualizarBarraSeleccion, editarObsClick: editarGestionClick, editarGestionClick, seleccionarSugerencia, guardarAbono, guardarTodos, recalcDisponible, actualizarTotalFijo, addConcepto, delConcepto };

})();
