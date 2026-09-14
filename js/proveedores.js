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

  // control y asistente_administrativo: solo lectura en todo el módulo
  const soloLectura = ['control', 'asistente_administrativo'].includes(localStorage.getItem('rol'));

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
    editarGestion(btn.dataset.num, btn.dataset.prov || "", btn.dataset.obs || "", btn.dataset.resp || "", btn.dataset.eg || "");
  }

  async function editarGestion(numDoc, proveedor, obsActual, respActual, egActual) {
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
        proveedor,
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
      numero_documento: document.getElementById("f-numdoc")?.value.trim() || "",
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
  function verDocsProveedor(provName) {
    document.querySelectorAll(".prov-tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".prov-tab-panel").forEach(p => p.classList.remove("active"));
    const tabBtn = document.querySelector('.prov-tab[data-tab="documentos"]');
    const panel  = document.getElementById("panel-documentos");
    if (tabBtn) tabBtn.classList.add("active");
    if (panel)  panel.classList.add("active");

    const inpProv = document.getElementById("f-proveedor");
    if (inpProv) inpProv.value = provName;
    document.getElementById("f-estado").value = "ACTIVO";
    _cardActiva = null;
    document.getElementById("cards-estado-prov")?.classList.remove("cards-con-activa");
    document.querySelectorAll("#cards-estado-prov .estado-card").forEach(b => b.classList.remove("card-activa"));

    document.getElementById("tbody-docs").innerHTML =
      '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-light)">Cargando documentos…</td></tr>';

    cargarDocumentos(1);
  }

  function priorSelect(currentVal, provEnc) {
    const opts = PRIOR_OPTS.map(o =>
      `<option value="${o.val}"${String(currentVal||"") === o.val ? " selected" : ""}>${o.label}</option>`
    ).join("");
    return `<select class="select-prior" data-campo="prioridad" data-proveedor="${provEnc}" ${soloLectura ? "disabled" : ""}>${opts}</select>`;
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
              data-prov="${(d.proveedor||"").replace(/"/g,'&quot;')}"
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
          <td style="text-align:center"><button class="${btnClass}" data-num="${numEnc}" data-prov="${(d.proveedor||"").replace(/"/g,"&quot;")}" data-obs="${obsEnc}" data-resp="${respEnc}" data-eg="${(d.estado_gestion||"").replace(/"/g,"&quot;")}" onclick="PROV.editarGestionClick(this)" title="Gestión">${btnIcon}</button></td>
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

    Swal.fire({ title: nuevoEstado === "DESCARTADO" ? "Descartando..." : "Reactivando...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const pares = checks.map(c => ({ numDoc: c.dataset.num, proveedor: c.dataset.prov || "" }));
    const res = await apiFetch("/proveedores-pagar/documentos/bulk-estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pares, estado: nuevoEstado }),
    });
    if (!res || !res.ok) { Swal.fire("Error", "No se pudieron actualizar los documentos.", "error"); return; }
    Swal.fire({ icon: "success", title: nuevoEstado === "DESCARTADO" ? "Descartados" : "Reactivados", timer: 1500, showConfirmButton: false });
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
    // asistente_administrativo no tiene acceso a Costos del Mes — pedir ese endpoint
    // igual haría que apiFetch cierre la sesión al recibir el 403
    const tieneAccesoCostos = localStorage.getItem('rol') !== 'asistente_administrativo';

    const [resRes, resCostos] = await Promise.all([
      apiFetch(`/proveedores-pagar/resumen${qs}`),
      tieneAccesoCostos ? apiFetch(`/proveedores-pagar/costos/${periodoActual()}`) : Promise.resolve(null),
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
    document.getElementById("rc-disponible").textContent  = tieneAccesoCostos ? fmtMoney(_disponible) : '—';
    document.getElementById("rc-con-plan").textContent    = fmtMoney(conPlan);
    document.getElementById("rc-diferencia").textContent  = tieneAccesoCostos ? fmtMoney(diferencia) : '—';
    const difCard = document.getElementById("rc-diferencia-card");
    if (difCard && tieneAccesoCostos) {
      difCard.style.background = diferencia >= 0 ? "#dcfce7" : "#fef2f2";
      difCard.querySelector(".rc-num").style.color = diferencia >= 0 ? "#15803d" : "#b91c1c";
    }

    // Tabla separada por umbral
    const umbral = parseFloat(document.getElementById("f-umbral-res")?.value) || 0;
    const tbodyMayor = document.getElementById("tbody-resumen-mayor");
    const tbodyMenor = document.getElementById("tbody-resumen-menor");
    const lblMayor   = document.getElementById("lbl-seccion-mayor");
    const lblMenor   = document.getElementById("lbl-seccion-menor");
    const secMayor   = document.getElementById("resumen-section-mayor");
    const secMenor   = document.getElementById("resumen-section-menor");

    if (!data.proveedores?.length) {
      tbodyMayor.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-light)">Sin datos activos.</td></tr>`;
      tbodyMenor.innerHTML = "";
      lblMayor.textContent = "";
      lblMenor.textContent = "";
      secMenor.style.display = "none";
      return;
    }

    const mayores = data.proveedores.filter(r => parseFloat(r.total_saldo || 0) >= umbral);
    const menores = data.proveedores.filter(r => parseFloat(r.total_saldo || 0) < umbral);

    const fmtUmbral = fmtMoney(umbral);
    const buildRow = (r, idx) => {
      const abonar = parseFloat(r.por_abonar || 0);
      const saldo  = parseFloat(r.total_saldo || 0);
      let rowClass = "";
      if (abonar > 0) rowClass = abonar >= saldo ? "pago-ok" : "pago-parcial";
      const provEnc  = encodeURIComponent(r.proveedor);
      const totalFmt = saldo.toFixed(2);
      const refEnc   = (r.referencia || "").replace(/"/g, "&quot;");
      return `<tr class="${rowClass}" data-proveedor="${provEnc}">
        <td style="color:var(--text-light);font-size:12px">${idx + 1}</td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.proveedor}"><a href="#" class="prov-link" data-prov="${r.proveedor.replace(/&/g,"&amp;").replace(/"/g,"&quot;")}">${r.proveedor}</a></td>
        <td><input type="text" class="input-ref" value="${refEnc}" placeholder="" maxlength="50" data-campo="referencia" data-proveedor="${provEnc}" ${soloLectura ? "disabled" : ""}/></td>
        <td style="text-align:center">${r.cantidad_docs}</td>
        <td class="num-right" style="font-weight:700">${fmtMoney(r.total_saldo)}</td>
        <td>${priorSelect(r.prioridad, provEnc)}</td>
        <td${soloLectura ? ' style="text-align:right"' : ""}>
          ${soloLectura
            ? `<span style="font-weight:600">${fmtMoney(abonar)}</span>`
            : `<div style="display:flex;align-items:center;gap:4px">
            <input type="number" class="input-abonar" value="${abonar || ""}" placeholder="0.00" step="0.01" data-campo="por_abonar" data-proveedor="${provEnc}"/>
            <button class="btn-total-abonar" onclick="this.previousElementSibling.value='${totalFmt}'" title="Poner total adeudado">Total</button>
            <button class="btn-dist" data-prov="${provEnc}" title="Distribuir por factura y ver historial">&#9783;</button>
          </div>`}
        </td>
        <td>${soloLectura ? "" : `<button class="btn-guardar-abono" onclick="PROV.guardarAbono('${provEnc}')">Guardar</button>`}</td>
      </tr>`;
    };

    lblMayor.textContent = `Mayor o igual a ${fmtUmbral} (${mayores.length} proveedores)`;
    lblMenor.textContent = `Menor a ${fmtUmbral} (${menores.length} proveedores)`;

    if (mayores.length) {
      secMayor.style.display = "";
      tbodyMayor.innerHTML = mayores.map((r, i) => buildRow(r, i)).join("");
    } else {
      secMayor.style.display = "";
      tbodyMayor.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-light)">Ningún proveedor en esta sección.</td></tr>`;
    }

    if (menores.length) {
      secMenor.style.display = "";
      tbodyMenor.innerHTML = menores.map((r, i) => buildRow(r, i)).join("");
    } else {
      secMenor.style.display = "";
      tbodyMenor.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-light)">Ningún proveedor en esta sección.</td></tr>`;
    }
  }

  // ── Modal de distribución de abono ───────────────
  async function abrirDistribucion(provEnc) {
    const provName = decodeURIComponent(provEnc);
    Swal.fire({ title: "Cargando...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const [resDoc, resHist] = await Promise.all([
      apiFetch("/proveedores-pagar/documentos-detalle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proveedores: [provName] }),
      }),
      apiFetch(`/proveedores-pagar/resumen/${provEnc}/historial`),
    ]);

    if (!resDoc || !resDoc.ok) { Swal.fire("Error", "No se pudieron cargar los documentos.", "error"); return; }
    const { documentos: docs } = await safeJson(resDoc);
    const historial = resHist?.ok ? (await safeJson(resHist)).historial : [];
    const totalSaldo = docs.reduce((s, d) => s + parseFloat(d.saldo || 0), 0);

    const invoiceRows = docs.map((d, i) => `
      <tr class="dist-row" data-idx="${i}" style="border-bottom:1px solid #e5e7eb;transition:background .1s">
        <td style="padding:10px 12px;text-align:center;white-space:nowrap">
          <input type="checkbox" class="dist-check" data-idx="${i}" data-saldo="${d.saldo}"
            style="width:17px;height:17px;cursor:pointer;accent-color:#2B7A9E"/>
        </td>
        <td style="padding:10px 12px;white-space:nowrap;font-size:13px;font-family:monospace;color:#1e3a5f;font-weight:600">${d.numero_documento}</td>
        <td style="padding:10px 12px;white-space:nowrap;font-size:12px;color:#6b7280">${d.tipo_doc || "—"}</td>
        <td style="padding:10px 12px;white-space:nowrap;text-align:center;font-size:13px;color:#6b7280">${fmtFecha(d.fecha_emision)}</td>
        <td style="padding:10px 12px;white-space:nowrap;text-align:right;font-size:14px;font-weight:700;color:#0c4a6e">${fmtMoney(d.saldo)}</td>
        <td style="padding:10px 12px;white-space:nowrap;text-align:right">
          <input type="number" class="dist-input" data-idx="${i}" data-saldo="${d.saldo}"
            step="0.01" min="0" value="" placeholder="0.00"
            style="width:120px;padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;text-align:right;font-family:inherit;outline:none;box-sizing:border-box"
            onfocus="this.style.borderColor='#2B7A9E';this.style.boxShadow='0 0 0 3px rgba(43,122,158,.12)'"
            onblur="this.style.borderColor='#d1d5db';this.style.boxShadow='none'"/>
        </td>
      </tr>`).join("");

    const histHtml = historial.length ? historial.map(h => {
      const fecha = new Date(h.creado_en).toLocaleDateString("es-EC", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
      const desg = Array.isArray(h.desglose) ? h.desglose : [];
      const detalle = desg.filter(d => d.monto > 0).map(d => `${d.numero_documento}: ${fmtMoney(d.monto)}`).join("  |  ") || "Sin desglose";
      return `<div style="padding:10px 14px;border-bottom:1px solid #f3f4f6">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <span style="font-size:12px;color:#6b7280">${fecha}${h.creado_por ? ' &middot; ' + h.creado_por : ''}</span>
          <span style="font-size:14px;font-weight:700;color:#1d4ed8">${fmtMoney(h.monto_total)}</span>
        </div>
        ${h.nota ? `<div style="margin-top:4px;color:#374151;font-size:13px;font-style:italic">&ldquo;${h.nota.replace(/</g,"&lt;")}&rdquo;</div>` : ''}
        <div style="margin-top:4px;color:#9ca3af;font-size:11px">${detalle}</div>
      </div>`;
    }).join("") : '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px">Sin registros anteriores</div>';

    const html = `
      <div style="text-align:left">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding:16px 22px;background:#f0f9ff;border-radius:10px;border:1px solid #bae6fd">
          <div style="min-width:0;flex:1">
            <div style="font-size:17px;font-weight:700;color:#0c4a6e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${provName}</div>
            <div style="font-size:13px;color:#6b7280;margin-top:4px">${docs.length} documento${docs.length !== 1 ? 's' : ''} activo${docs.length !== 1 ? 's' : ''}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;margin-left:24px">
            <div style="font-size:26px;font-weight:800;color:#0c4a6e;white-space:nowrap">${fmtMoney(totalSaldo)}</div>
            <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Deuda total</div>
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:13px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.3px">Selecciona las facturas a abonar</div>
          <div style="display:flex;align-items:center;gap:8px">
            <button type="button" id="dist-sel-all"
              style="padding:5px 14px;background:#f9fafb;color:#374151;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit;transition:all .12s"
              onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f9fafb'">Todas</button>
            <button type="button" id="dist-sel-none"
              style="padding:5px 14px;background:#f9fafb;color:#374151;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit;transition:all .12s"
              onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f9fafb'">Ninguna</button>
          </div>
        </div>

        <div style="overflow:auto;max-height:320px;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:16px">
          <table style="width:100%;border-collapse:collapse;white-space:nowrap">
            <thead>
              <tr style="background:#1e3a5f;color:#fff;position:sticky;top:0;z-index:1">
                <th style="padding:10px 12px;width:42px"></th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px">N&#176; Documento</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px">Tipo</th>
                <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px">Fecha</th>
                <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px">Saldo</th>
                <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px">Abonar</th>
              </tr>
            </thead>
            <tbody id="dist-tbody">${invoiceRows || '<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;font-size:13px;white-space:normal">Sin documentos activos</td></tr>'}</tbody>
          </table>
        </div>

        <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-bottom:20px;padding:12px 20px;background:#f0fdf4;border:2px solid #bbf7d0;border-radius:10px">
          <span style="font-size:14px;font-weight:600;color:#374151">Total a abonar:</span>
          <span id="dist-total" style="font-size:24px;font-weight:800;color:#15803d">$0,00</span>
        </div>

        <div style="margin-bottom:18px">
          <div style="font-size:12px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px">Nota / Motivo</div>
          <textarea id="dist-nota" rows="2" placeholder="Ej: Pago parcial septiembre, prioridad alta..."
            style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;outline:none;line-height:1.5"
            onfocus="this.style.borderColor='#2B7A9E';this.style.boxShadow='0 0 0 3px rgba(43,122,158,.12)'"
            onblur="this.style.borderColor='#d1d5db';this.style.boxShadow='none'"></textarea>
        </div>

        <details style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
          <summary style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;cursor:pointer;background:#f9fafb;user-select:none">
            Historial de asignaciones (${historial.length})
          </summary>
          <div style="max-height:220px;overflow-y:auto">${histHtml}</div>
        </details>
      </div>`;

    const result = await Swal.fire({
      title: "Distribución de Abono",
      width: 920,
      customClass: { popup: 'swal-dist-modal' },
      html,
      showCancelButton: true,
      confirmButtonText: "Guardar distribución",
      confirmButtonColor: "#2B7A9E",
      cancelButtonText: "Cancelar",
      cancelButtonColor: "#9ca3af",
      focusConfirm: false,
      didOpen: () => {
        const popup = Swal.getPopup();
        popup.style.setProperty('width', '920px', 'important');
        popup.style.setProperty('max-width', '95vw', 'important');
        const hc = popup.querySelector('.swal2-html-container');
        if (hc) { hc.style.setProperty('max-width', 'none', 'important'); hc.style.setProperty('overflow-x', 'hidden', 'important'); hc.style.setProperty('overflow-y', 'auto', 'important'); }

        const updateTotal = () => {
          const sum = [...popup.querySelectorAll(".dist-input")].reduce((s, inp) => s + (parseFloat(inp.value) || 0), 0);
          popup.querySelector("#dist-total").textContent = fmtMoney(sum);
        };

        const syncCheck = (idx) => {
          const chk = popup.querySelector(`.dist-check[data-idx="${idx}"]`);
          const inp = popup.querySelector(`.dist-input[data-idx="${idx}"]`);
          const row = popup.querySelector(`.dist-row[data-idx="${idx}"]`);
          if (!chk || !inp) return;
          if (chk.checked) {
            inp.value = parseFloat(inp.dataset.saldo).toFixed(2);
            if (row) row.style.background = "#f0fdf4";
          } else {
            inp.value = "";
            if (row) row.style.background = "";
          }
          updateTotal();
        };

        popup.querySelectorAll(".dist-check").forEach(chk => {
          chk.addEventListener("change", () => syncCheck(chk.dataset.idx));
        });

        popup.querySelectorAll(".dist-input").forEach(inp => {
          inp.addEventListener("input", () => {
            const val = parseFloat(inp.value) || 0;
            const chk = popup.querySelector(`.dist-check[data-idx="${inp.dataset.idx}"]`);
            const row = popup.querySelector(`.dist-row[data-idx="${inp.dataset.idx}"]`);
            if (chk) chk.checked = val > 0;
            if (row) row.style.background = val > 0 ? "#f0fdf4" : "";
            updateTotal();
          });
        });

        popup.querySelector("#dist-sel-all")?.addEventListener("click", () => {
          popup.querySelectorAll(".dist-check").forEach(chk => { chk.checked = true; syncCheck(chk.dataset.idx); });
        });
        popup.querySelector("#dist-sel-none")?.addEventListener("click", () => {
          popup.querySelectorAll(".dist-check").forEach(chk => { chk.checked = false; syncCheck(chk.dataset.idx); });
        });
      },
      preConfirm: () => {
        const popup = Swal.getPopup();
        const desglose = [...popup.querySelectorAll(".dist-input")]
          .map((inp, i) => ({ numero_documento: docs[i].numero_documento, monto: parseFloat(inp.value) || 0 }))
          .filter(d => d.monto > 0);
        const monto_total = desglose.reduce((s, d) => s + d.monto, 0);
        const nota = popup.querySelector("#dist-nota").value.trim();
        return { monto_total: Math.round(monto_total * 100) / 100, nota, desglose };
      },
    });

    if (!result.isConfirmed || !result.value) return;
    const { monto_total, nota, desglose } = result.value;

    const trRes = document.querySelector(`#tbody-resumen-mayor tr[data-proveedor="${provEnc}"]`) || document.querySelector(`#tbody-resumen-menor tr[data-proveedor="${provEnc}"]`);
    const prioridad  = trRes?.querySelector("[data-campo='prioridad']")?.value || null;
    const referencia = trRes?.querySelector("[data-campo='referencia']")?.value.trim() || null;

    const saveRes = await apiFetch(`/proveedores-pagar/resumen/${provEnc}/abono`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        monto_total, nota: nota || null, desglose,
        prioridad: prioridad ? parseInt(prioridad) : null,
        referencia,
      }),
    });
    if (!saveRes || !saveRes.ok) { Swal.fire("Error", "No se pudo guardar.", "error"); return; }
    Swal.fire({ icon: "success", title: "Distribución guardada", timer: 1500, showConfirmButton: false });
    cargarResumen();
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
    const filas = document.querySelectorAll("#tbody-resumen-mayor tr[data-proveedor], #tbody-resumen-menor tr[data-proveedor]");
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

  // ── Limpiar todo el resumen (prioridad + por_abonar) ─
  async function limpiarResumen() {
    const { isConfirmed } = await Swal.fire({
      title: "¿Limpiar todo el resumen?",
      text: "Se eliminarán todas las prioridades y montos por abonar. Esta acción no se puede deshacer.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, limpiar",
      confirmButtonColor: "#ef4444",
      cancelButtonText: "Cancelar",
    });
    if (!isConfirmed) return;

    const res = await apiFetch("/proveedores-pagar/resumen/limpiar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res || !res.ok) {
      Swal.fire("Error", "No se pudo limpiar el resumen.", "error");
      return;
    }
    Swal.fire({ icon: "success", title: "Resumen limpiado", timer: 1400, showConfirmButton: false });
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

  // ── Exportar Excel ───────────────────────────────
  async function exportExcel() {
    const f = leerFiltros();
    const qs = new URLSearchParams({ limit: 9999, ...f });
    Object.keys(f).forEach(k => { if (!f[k]) qs.delete(k); });

    Swal.fire({ title: "Generando Excel...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const res = await apiFetch(`/proveedores-pagar/documentos?${qs}`);
    if (!res || !res.ok) { Swal.close(); return; }
    const data = await safeJson(res);
    if (!data.documentos?.length) {
      Swal.fire("Sin datos", "No hay documentos para exportar.", "info");
      return;
    }

    const COLS = [
      { key: "proveedor",        label: "Proveedor"         },
      { key: "tipo_doc",         label: "Tipo Documento"    },
      { key: "centro_costos",    label: "Centro de Costos"  },
      { key: "numero_documento", label: "N° Documento"      },
      { key: "fecha_emision",    label: "Fecha Emisión"     },
      { key: "saldo",            label: "Saldo ($)"         },
      { key: "observacion",      label: "Observación"       },
      { key: "estado",           label: "Estado"            },
      { key: "estado_gestion",   label: "Estado Gestión"    },
      { key: "prioridad",        label: "Prioridad"         },
      { key: "por_abonar",       label: "Por Abonar ($)"   },
    ];

    const PRIORIDAD_LABEL = { "1": "BAJA", "2": "MEDIA", "3": "ALTA" };

    const wsData = [
      COLS.map(c => c.label),
      ...data.documentos.map(d => COLS.map(c => {
        if (c.key === "prioridad") return PRIORIDAD_LABEL[String(d[c.key] ?? "")] || "";
        if (c.key === "saldo" || c.key === "por_abonar") return d[c.key] != null ? Number(d[c.key]) : "";
        return d[c.key] ?? "";
      })),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Anchos de columna
    ws["!cols"] = [
      { wch: 40 }, { wch: 22 }, { wch: 18 }, { wch: 22 },
      { wch: 14 }, { wch: 12 }, { wch: 30 }, { wch: 12 },
      { wch: 16 }, { wch: 10 }, { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Proveedores");
    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `proveedores_${fecha}.xlsx`);

    Swal.close();
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

  // ── PDF: Resumen general ──
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
      const n = _resumenData.proveedores.length;
      const doc   = new jsPDF("p", "mm", "a4");
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const mL = 14, mR = 14, MARGIN_BOTTOM = 12;
      const boxW  = pageW - mL - mR;
      const hoyStr = new Date().toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" });
      const priorMap = { "": "—", "1": "BAJA", "2": "MEDIA", "3": "ALTA" };
      const FONT = "Roboto";

      // ── Cabecera ──
      let y = await construirCabeceraPDF(doc, "CUENTAS POR PAGAR", `Resumen · ${hoyStr}`);

      // ── KPIs ──
      const tieneAccesoCostos = localStorage.getItem('rol') !== 'asistente_administrativo';
      const totalDeudaVal = parseFloat(_resumenData.total_general || 0);
      const conPlanVal    = _resumenData.proveedores.reduce((s, r) => s + parseFloat(r.por_abonar || 0), 0);
      const diferenciaVal = _disponible - conPlanVal;
      const kpis = [
        { label: "TOTAL DEUDA ACTIVA", valor: fmtMoney(totalDeudaVal), color: PDF_PRIMARY },
        { label: "DISPONIBLE DEL MES", valor: tieneAccesoCostos ? fmtMoney(_disponible) : '—', color: [21, 128, 61] },
        { label: "CON PLAN DE ABONO",  valor: fmtMoney(conPlanVal), color: PDF_PRIMARY },
        { label: "DIFERENCIA",         valor: tieneAccesoCostos ? fmtMoney(diferenciaVal) : '—', color: (!tieneAccesoCostos || diferenciaVal >= 0) ? [21, 128, 61] : [185, 28, 28] },
      ];
      doc.setFillColor(241, 245, 249); doc.setDrawColor(210, 220, 230);
      doc.roundedRect(mL, y, boxW, 14, 2, 2, "FD");
      const kpiW = boxW / 4;
      kpis.forEach((k, i) => {
        const cx = mL + i * kpiW + kpiW / 2;
        if (i > 0) { doc.setDrawColor(210, 220, 230); doc.setLineWidth(0.3); doc.line(mL + i * kpiW, y + 2, mL + i * kpiW, y + 12); }
        doc.setFont(FONT, "normal"); doc.setFontSize(7); doc.setTextColor(...PDF_GRAY);
        doc.text(k.label, cx, y + 5, { align: "center" });
        doc.setFont(FONT, "bold"); doc.setFontSize(11); doc.setTextColor(...k.color);
        doc.text(k.valor, cx, y + 11, { align: "center" });
      });
      y += 18;

      // ── Separación por umbral ──
      const umbralPdf = parseFloat(document.getElementById("f-umbral-res")?.value) || 0;
      const mayoresPdf = _resumenData.proveedores.filter(r => parseFloat(r.total_saldo || 0) >= umbralPdf);
      const menoresPdf = _resumenData.proveedores.filter(r => parseFloat(r.total_saldo || 0) < umbralPdf);

      const HEAD = ["#", "PROVEEDOR", "DOCS", "TOTAL SALDO", "PRIORIDAD", "POR ABONAR"];
      const PT_TO_MM = 0.3527;
      const LINE_H   = 1.15;

      // Calcular tamaño basado en la sección más larga para que ambas usen el mismo
      const mayorStartY = y + 12; // después de la etiqueta de sección
      const menorStartY = 14 + 12; // página nueva + etiqueta
      const maxRows = Math.max(mayoresPdf.length, menoresPdf.length);
      // Usar el peor caso: más filas con menos espacio
      const worstStartY = mayoresPdf.length >= menoresPdf.length ? mayorStartY : menorStartY;
      const avail = pageH - worstStartY - MARGIN_BOTTOM - 1;
      const rowH = avail / (maxRows + 2);
      const maxFs = (rowH - 1.2) / (PT_TO_MM * LINE_H);
      const FS = Math.floor(Math.max(6.5, Math.min(10, maxFs)) * 10) / 10;
      const textH = FS * PT_TO_MM * LINE_H;
      const padV = Math.max(0.8, (rowH - textH) / 2);

      const tableCommon = {
        margin: { left: mL, right: mR, bottom: MARGIN_BOTTOM },
        styles: {
          font: FONT, fontSize: FS, fontStyle: "bold",
          cellPadding: { top: padV, bottom: padV, left: 2.5, right: 2.5 },
          minCellHeight: rowH,
          lineColor: [226, 232, 240], lineWidth: 0.15,
          valign: "middle", overflow: "ellipsize", textColor: PDF_DARK,
        },
        headStyles: {
          fillColor: PDF_PRIMARY, textColor: [255, 255, 255],
          fontStyle: "bold", fontSize: Math.max(6, FS - 0.5),
          cellPadding: { top: padV + 0.3, bottom: padV + 0.3, left: 2.5, right: 2.5 },
        },
        footStyles: { fillColor: [241, 245, 249], textColor: PDF_DARK, fontStyle: "bold", fontSize: FS },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 10, halign: "center", textColor: PDF_GRAY },
          1: { cellWidth: "auto", overflow: "ellipsize" },
          2: { cellWidth: 14, halign: "center" },
          3: { cellWidth: 30, halign: "right" },
          4: { cellWidth: 22, halign: "center" },
          5: { cellWidth: 30, halign: "right" },
        },
      };

      const colorByPriority = (data, srcArr) => {
        if (data.section !== "body") return;
        const prov = srcArr[data.row.index];
        const p = String(prov?.prioridad || "");
        if (p === "3")      { data.cell.styles.fillColor = [254, 226, 226]; data.cell.styles.textColor = [153, 27, 27]; }
        else if (p === "2") { data.cell.styles.fillColor = [254, 249, 195]; data.cell.styles.textColor = [113, 63, 18]; }
        else if (p === "1") { data.cell.styles.fillColor = [220, 252, 231]; data.cell.styles.textColor = [22, 101, 52]; }
      };

      const buildRows = (arr) => arr.map((r, i) => [
        i + 1, r.proveedor, r.cantidad_docs,
        fmtMoney(r.total_saldo), priorMap[String(r.prioridad || "")] || "—", fmtMoney(r.por_abonar || 0),
      ]);

      const buildFoot = (arr) => {
        const s  = arr.reduce((a, r) => a + parseFloat(r.total_saldo || 0), 0);
        const ab = arr.reduce((a, r) => a + parseFloat(r.por_abonar  || 0), 0);
        return [[
          { content: `SUBTOTAL  (${arr.length})`, colSpan: 3, styles: { halign: "right" } },
          { content: fmtMoney(s),  styles: { halign: "right" } },
          "",
          { content: fmtMoney(ab), styles: { halign: "right" } },
        ]];
      };

      const drawSection = (label, yPos, textColor, bgColor, accentColor) => {
        doc.setFillColor(...bgColor);
        doc.roundedRect(mL, yPos, boxW, 10, 2, 2, "F");
        doc.setDrawColor(...accentColor); doc.setLineWidth(1);
        doc.line(mL, yPos, mL, yPos + 10);
        doc.setFont(FONT, "bold"); doc.setFontSize(11); doc.setTextColor(...textColor);
        doc.text(label, mL + 5, yPos + 6.8);
        return yPos + 12;
      };

      // ── Sección: >= umbral ──
      if (mayoresPdf.length) {
        y = drawSection(
          `Mayor o igual a ${fmtMoney(umbralPdf)}  —  ${mayoresPdf.length} proveedores`,
          y, [153, 27, 27], [254, 242, 242], [220, 38, 38]
        );
        doc.autoTable({
          ...tableCommon, startY: y, showFoot: "lastPage",
          head: [HEAD], body: buildRows(mayoresPdf), foot: buildFoot(mayoresPdf),
          didParseCell: (data) => colorByPriority(data, mayoresPdf),
        });
      }

      // ── Sección: < umbral (página nueva) ──
      if (menoresPdf.length) {
        doc.addPage();
        y = 14;
        y = drawSection(
          `Menor a ${fmtMoney(umbralPdf)}  —  ${menoresPdf.length} proveedores`,
          y, [22, 101, 52], [240, 253, 244], [22, 163, 74]
        );
        doc.autoTable({
          ...tableCommon, startY: y, showFoot: "lastPage",
          head: [HEAD], body: buildRows(menoresPdf), foot: buildFoot(menoresPdf),
          didParseCell: (data) => colorByPriority(data, menoresPdf),
        });
      }

      // ── Numeración de páginas ──
      pdfNumerarPaginas(doc, hoyStr);

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
    // Solo lectura: marca el body para ocultar acciones de escritura
    // (se reutiliza la clase .rol-control para "control" y "asistente_administrativo")
    if (soloLectura) {
      document.body.classList.add('rol-control');
      const umbralInp = document.getElementById("f-umbral-res");
      if (umbralInp) umbralInp.disabled = true;
      document.getElementById("btn-aplicar-umbral")?.style.setProperty("display", "none");
      document.getElementById("btn-guardar-todos")?.style.setProperty("display", "none");
      document.getElementById("btn-limpiar-resumen")?.style.setProperty("display", "none");
    }
    // asistente_administrativo tampoco tiene acceso a Costos del Mes (a diferencia de control),
    // por lo que además de ocultar la pestaña, sus tarjetas de indicadores del Resumen no aplican
    if (localStorage.getItem('rol') === 'asistente_administrativo') {
      document.querySelector('.prov-tab[data-tab="costos"]')?.style.setProperty('display', 'none');
      document.querySelector('.resumen-indicadores')?.style.setProperty('display', 'none');
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
    document.getElementById("btn-export-xlsx-prov")?.addEventListener("click", exportExcel);

    // Eventos filtros documentos
    document.getElementById("btn-filtrar-prov")?.addEventListener("click", () => {
      _cardActiva = null;
      document.getElementById("cards-estado-prov")?.classList.remove("cards-con-activa");
      document.querySelectorAll("#cards-estado-prov .estado-card").forEach(b => b.classList.remove("card-activa"));
      cargarDocumentos(1);
    });
    document.getElementById("btn-limpiar-prov")?.addEventListener("click", () => {
      ["f-estado","f-centro","f-tipo","f-estado-gestion-prov"].forEach(id => { const el = document.getElementById(id); if (el) el.value = id === "f-estado" ? "ACTIVO" : ""; });
      ["f-numdoc","f-proveedor","f-desde","f-hasta"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
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

    // Click en proveedor del resumen → ver sus documentos
    // Click en botón distribución → abrir modal
    const resumenClickHandler = e => {
      const link = e.target.closest(".prov-link");
      if (link) { e.preventDefault(); verDocsProveedor(link.dataset.prov); return; }
      const dist = e.target.closest(".btn-dist");
      if (dist) { abrirDistribucion(dist.dataset.prov); return; }
    };
    document.getElementById("tbody-resumen-mayor")?.addEventListener("click", resumenClickHandler);
    document.getElementById("tbody-resumen-menor")?.addEventListener("click", resumenClickHandler);

    // Resumen
    document.getElementById("btn-filtrar-res")?.addEventListener("click",  cargarResumen);
    document.getElementById("btn-aplicar-umbral")?.addEventListener("click", cargarResumen);
    document.getElementById("btn-guardar-todos")?.addEventListener("click",   guardarTodos);
    document.getElementById("btn-limpiar-resumen")?.addEventListener("click", limpiarResumen);
    document.getElementById("btn-pdf-resumen")?.addEventListener("click",     pdfResumen);
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
  return { actualizarBarraSeleccion, editarObsClick: editarGestionClick, editarGestionClick, seleccionarSugerencia, guardarAbono, guardarTodos, recalcDisponible, actualizarTotalFijo, addConcepto, delConcepto, verDocsProveedor, abrirDistribucion };

})();
