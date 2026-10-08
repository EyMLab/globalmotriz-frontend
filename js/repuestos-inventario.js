// =====================================================
// repuestos-inventario.js — Inventario de Repuestos (menú Repuestos → Inventario)
// Registro con código PROPIEDAD-ESTADO-MARCA-NNNN, reservas para OT, salidas con
// motivo, Acta de Custodia para Alto Valor e importación / exportación Excel.
// Todo vive dentro del IIFE; solo se expone window.REP (lo usa la campanita de nav.js).
// =====================================================
(function () {
  'use strict';

  const ROLES_PAGINA = ['admin', 'control', 'bodega', 'asesor', 'procesos'];

  const state = {
    usuario: '',
    rol: '',
    localidad: '',
    esAdmin: false,
    esBodega: false,
    esAsesor: false,
    esControl: false,
    esProcesos: false,
    puedeRegistrar: false, // admin, bodega, procesos
    puedeReservar: false,  // admin, bodega, procesos, asesor
    puedeVerActas: false,  // admin, bodega, control
    cat: null,             // GET /repuestos/catalogos
    empleados: [],         // GET /repuestos/empleados (solo bodega/admin)
    inv: { page: 1, pageSize: 20, total: 0 },
    sal: { page: 1, pageSize: 20, total: 0 },
    edicion: null,         // pieza en edición en el panel Registrar
    formEdicionId: null
  };

  // =====================================================
  // HELPERS
  // =====================================================
  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Valor para mostrar: escapado o "—"
  const val = (v) => (v === null || v === undefined || v === '' ? '—' : escapeHtml(v));

  function fmtMoney(v) {
    const n = parseFloat(v) || 0;
    return '$' + n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const pad = (n) => String(n).padStart(4, '0');
  const hoy = () => new Date().toLocaleDateString('en-CA');
  const etiqueta = (mapa, clave) => state.cat?.[mapa]?.[clave] || clave || '—';

  // Llamada a la API → { ok, status, data }. apiFetch ya manda al login si hay 401/403.
  async function api(path, options = {}) {
    const res = await apiFetch(path, options);
    if (!res) throw new Error('Sesión expirada');
    const data = await safeJson(res);
    return { ok: res.ok, status: res.status, data: data || {} };
  }

  const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) });
  const put = (path, body) => api(path, { method: 'PUT', body: JSON.stringify(body || {}) });

  // Descarga un archivo del backend (Excel) con el token
  async function descargar(path, nombre) {
    try {
      const res = await apiFetch(path);
      if (!res) return;
      if (!res.ok) {
        const d = await safeJson(res);
        throw new Error(d?.error || 'No se pudo descargar el archivo');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = nombre;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  }

  function copiar(texto, aviso) {
    if (!navigator.clipboard) { toast('No se pudo copiar', 'error'); return; }
    navigator.clipboard.writeText(texto).then(
      () => toast(aviso || `Copiado: ${texto}`),
      () => toast('No se pudo copiar', 'error')
    );
  }

  function toast(texto, icon = 'success') {
    const t = document.createElement('div');
    t.textContent = texto;
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:100000000;' +
      `background:${icon === 'success' ? '#166534' : '#991b1b'};color:#fff;padding:10px 18px;border-radius:8px;` +
      'font-size:14px;box-shadow:0 4px 14px rgba(0,0,0,.2)';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  const badge = (clase, texto) => `<span class="rep-badge ${clase}">${escapeHtml(texto)}</span>`;
  const badgePropiedad = (k) => badge(`prop-${k}`, etiqueta('propiedades', k));
  const badgeEstado = (k) => badge(`est-${k}`, etiqueta('estados', k));
  const badgeSituacion = (k) => badge(`sit-${k}`, etiqueta('situaciones', k));

  function opciones(mapa, vacio) {
    return (vacio !== undefined ? `<option value="">${vacio}</option>` : '') +
      Object.entries(mapa).map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join('');
  }

  function opcionesMarcas(vacio) {
    return `<option value="">${vacio}</option>` +
      state.cat.marcas.map(m => `<option value="${m.id}">${escapeHtml(m.nombre)} (${m.codigo})</option>`).join('');
  }

  // Sugerencia de código de marca: primeras 3 letras sin tildes
  const sugerirCodigo = (nombre) => String(nombre || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);

  const soloLetras = (input) => { input.value = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3); };

  // =====================================================
  // INIT
  // =====================================================
  document.addEventListener('DOMContentLoaded', init);

  async function verificarSesion(reintentos = 2) {
    try {
      const { ok, data } = await api('/auth/me');
      if (!ok) throw new Error();
      return data;
    } catch {
      if (reintentos > 0) {
        await new Promise(r => setTimeout(r, 1200));
        return verificarSesion(reintentos - 1);
      }
      return null;
    }
  }

  async function init() {
    if (!getToken()) { redirectLogin(); return; }

    const me = await verificarSesion();
    if (!me) {
      Swal.fire('Error', 'No se pudo verificar la sesión', 'error');
      redirectLogin();
      return;
    }
    if (!ROLES_PAGINA.includes(me.rol)) {
      window.location.href = 'inventario.html';
      return;
    }

    state.usuario = me.usuario;
    state.rol = me.rol;
    state.localidad = me.localidad || '';
    state.esAdmin = me.rol === 'admin';
    state.esBodega = me.rol === 'bodega';
    state.esAsesor = me.rol === 'asesor';
    state.esControl = me.rol === 'control';
    state.esProcesos = me.rol === 'procesos';
    state.puedeRegistrar = state.esAdmin || state.esBodega || state.esProcesos;
    state.puedeReservar = state.puedeRegistrar || state.esAsesor;
    state.puedeVerActas = state.esAdmin || state.esBodega || state.esControl;

    const cat = await api('/repuestos/catalogos');
    if (!cat.ok) {
      Swal.fire('Error', cat.data.error || 'No se pudieron cargar los catálogos', 'error');
      return;
    }
    state.cat = cat.data;

    prepararVistaPorRol();
    llenarSelects();
    initTabs();
    initInventario();
    initFormulario();
    initSalidas();
    initConfiguracion();

    cargarInventario();
    cargarResumen();

    // Enlace directo (campanita): repuestos-inventario.html?id=123
    const id = new URLSearchParams(window.location.search).get('id');
    if (/^\d+$/.test(id || '')) {
      history.replaceState(null, '', window.location.pathname);
      verDetalle(Number(id));
    }
  }

  function prepararVistaPorRol() {
    const mostrar = (id, visible) => { const el = $(id); if (el) el.style.display = visible ? '' : 'none'; };
    mostrar('tab-btn-registrar', state.puedeRegistrar);
    mostrar('tab-btn-configuracion', state.puedeRegistrar);
    mostrar('btn-registrar', state.puedeRegistrar);
    mostrar('btn-importar', state.puedeRegistrar);
    mostrar('btn-plantilla', state.puedeRegistrar);
    mostrar('grupo-mis-reservas', state.esAsesor);
    actualizarEtiquetaUmbral();
  }

  function actualizarEtiquetaUmbral() {
    $('kpi-alto-label').textContent = `Alto valor (> ${fmtMoney(state.cat.umbral)})`;
  }

  function llenarSelects() {
    const localidades = state.cat.localidades.map(l => `<option value="${l}">${l}</option>`).join('');

    $('f-marca').innerHTML = opcionesMarcas('Todas');
    $('f-propiedad').innerHTML = opciones(state.cat.propiedades, 'Todas');
    $('f-estado').innerHTML = opciones(state.cat.estados, 'Todos');
    $('f-categoria').innerHTML = opciones(state.cat.categorias, 'Todas');
    // Los filtros de localidad inician en "Todas": se ven las piezas de ambas sedes
    $('f-localidad').innerHTML = '<option value="">Todas</option>' + localidades;

    $('s-motivo').innerHTML = opciones(state.cat.motivos, 'Todos');
    $('s-localidad').innerHTML = '<option value="">Todas</option>' + localidades;

    $('r-marca').innerHTML = opcionesMarcas('Seleccione...');
    $('r-localidad').innerHTML = localidades;
    $('r-localidad').value = state.localidad || state.cat.localidades[0];

    $('dl-clientes').innerHTML = state.cat.sugerencias.clientes
      .map(c => `<option value="${escapeHtml(c)}">`).join('');
  }

  // Vuelve a pedir las marcas activas (tras crear / editar una) sin perder lo elegido
  async function refrescarMarcas() {
    const { ok, data } = await api('/repuestos/catalogos');
    if (!ok) return;
    state.cat.marcas = data.marcas;
    for (const [id, vacio] of [['f-marca', 'Todas'], ['r-marca', 'Seleccione...']]) {
      const actual = $(id).value;
      $(id).innerHTML = opcionesMarcas(vacio);
      $(id).value = actual;
    }
    asegurarMarcaEnSelect();
  }

  function initTabs() {
    document.querySelectorAll('.subtab-btn').forEach(btn =>
      btn.addEventListener('click', () => irATab(btn.dataset.tab)));
  }

  function irATab(tab) {
    document.querySelectorAll('.subtab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.subtab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
    if (tab === 'salidas') cargarSalidas();
    if (tab === 'configuracion') cargarConfiguracion();
    if (tab === 'registrar') prepararFormulario();
  }

  // =====================================================
  // INVENTARIO (lista, filtros y KPIs)
  // =====================================================
  function initInventario() {
    const recargar = () => { state.inv.page = 1; cargarInventario(); };

    ['f-marca', 'f-propiedad', 'f-estado', 'f-categoria', 'f-situacion', 'f-desde', 'f-hasta', 'f-alto', 'f-mis']
      .forEach(id => $(id)?.addEventListener('change', recargar));
    $('f-localidad').addEventListener('change', () => { recargar(); cargarResumen(); });
    ['f-q', 'f-modelo', 'f-placa'].forEach(id => $(id).addEventListener('input', debounce(recargar, 400)));

    // Enter en la búsqueda: si queda un solo repuesto, se abre su detalle
    $('f-q').addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      state.inv.page = 1;
      const items = await cargarInventario();
      if (items.length === 1) verDetalle(items[0].id);
    });

    $('inv-prev').onclick = () => { if (state.inv.page > 1) { state.inv.page--; cargarInventario(); } };
    $('inv-next').onclick = () => { if (state.inv.page < totalPaginas(state.inv)) { state.inv.page++; cargarInventario(); } };

    $('btn-limpiar-filtros').onclick = limpiarFiltros;
    $('btn-registrar').onclick = () => { cancelarEdicion(); irATab('registrar'); };
    $('btn-importar').onclick = importarExcel;
    $('btn-plantilla').onclick = () => descargar('/repuestos/plantilla', 'plantilla-inventario-repuestos.xlsx');
    $('btn-exportar').onclick = () => descargar(`/repuestos/exportar?${paramsInventario(false)}`, `inventario-repuestos-${hoy()}.xlsx`);

    $('tabla-inventario').addEventListener('click', (e) => {
      const fila = e.target.closest('tr[data-id]');
      if (fila) verDetalle(Number(fila.dataset.id));
    });

    // KPIs clicables → filtran la tabla
    document.querySelectorAll('[data-kpi]').forEach(card => card.addEventListener('click', () => {
      const kpi = card.dataset.kpi;
      if (kpi === 'SALIDAS') { irATab('salidas'); return; }
      $('f-situacion').value = kpi === 'ALTO' ? 'EN_BODEGA' : kpi;
      $('f-alto').checked = kpi === 'ALTO';
      recargar();
    }));
  }

  function limpiarFiltros() {
    ['f-q', 'f-marca', 'f-modelo', 'f-placa', 'f-propiedad', 'f-estado', 'f-categoria', 'f-desde', 'f-hasta']
      .forEach(id => { $(id).value = ''; });
    $('f-situacion').value = 'EN_BODEGA';
    $('f-localidad').value = '';
    $('f-alto').checked = false;
    if ($('f-mis')) $('f-mis').checked = false;
    state.inv.page = 1;
    cargarInventario();
    cargarResumen();
  }

  function paramsInventario(conPagina = true) {
    const p = new URLSearchParams();
    if (conPagina) {
      p.set('page', state.inv.page);
      p.set('pageSize', state.inv.pageSize);
    }
    const campos = {
      q: 'f-q', marca_id: 'f-marca', modelo: 'f-modelo', placa: 'f-placa', propiedad: 'f-propiedad',
      estado: 'f-estado', categoria: 'f-categoria', localidad: 'f-localidad', situacion: 'f-situacion',
      desde: 'f-desde', hasta: 'f-hasta'
    };
    for (const [k, id] of Object.entries(campos)) {
      const v = $(id).value.trim();
      if (v) p.set(k, v);
    }
    if ($('f-alto').checked) p.set('alto_valor', '1');
    if ($('f-mis')?.checked) p.set('mis_reservas', '1');
    return p.toString();
  }

  const totalPaginas = (s) => Math.max(1, Math.ceil(s.total / s.pageSize));

  function renderPaginacion(prefijo, s) {
    $(`${prefijo}-pagina`).textContent = `Página ${s.page} de ${totalPaginas(s)}`;
    $(`${prefijo}-prev`).disabled = s.page <= 1;
    $(`${prefijo}-next`).disabled = s.page >= totalPaginas(s);
  }

  async function cargarInventario() {
    const tbody = $('tabla-inventario');
    tbody.innerHTML = '<tr><td colspan="11" class="empty-cell">Cargando...</td></tr>';
    try {
      const { ok, data } = await api(`/repuestos/piezas?${paramsInventario()}`);
      if (!ok) throw new Error(data.error);
      state.inv.total = data.total;
      if (data.umbral !== undefined && data.umbral !== state.cat.umbral) {
        state.cat.umbral = data.umbral;
        actualizarEtiquetaUmbral();
      }
      renderInventario(data.items);
      renderPaginacion('inv', state.inv);
      $('contador-inventario').textContent = `${data.total} repuesto${data.total === 1 ? '' : 's'}`;
      return data.items;
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="11" class="empty-cell">Error cargando repuestos${err.message ? ': ' + escapeHtml(err.message) : ''}</td></tr>`;
      return [];
    }
  }

  function renderInventario(items) {
    const tbody = $('tabla-inventario');
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="11" class="empty-cell">No hay repuestos con estos filtros</td></tr>';
      return;
    }
    tbody.innerHTML = items.map(p => {
      const reserva = p.situacion === 'RESERVADO'
        ? `<span class="rep-sub">OT ${escapeHtml(p.reservado_ot)} · ${escapeHtml(p.reservado_por)}</span>` : '';
      const dias = p.situacion === 'RESERVADO'
        ? `${p.dias_reservado ?? 0} <span class="rep-sub">reservado</span>`
        : (p.situacion === 'DISPONIBLE' ? p.dias_en_bodega : '—');
      return `
        <tr class="rep-fila${p.situacion === 'ANULADO' ? ' rep-anulada' : ''}" data-id="${p.id}">
          <td><span class="rep-codigo">${escapeHtml(p.codigo)}</span>${p.codigo_auxiliar ? `<span class="rep-sub">Aux: ${escapeHtml(p.codigo_auxiliar)}</span>` : ''}</td>
          <td class="rep-detalle-cel" title="${escapeHtml(p.detalle)}">${escapeHtml(p.detalle)}<span class="rep-sub">${escapeHtml(etiqueta('categorias', p.categoria))}</span></td>
          <td>${escapeHtml(p.marca)}<span class="rep-sub">${val(p.modelo)}</span></td>
          <td>${val(p.placa)}<span class="rep-sub">${p.orden_trabajo ? 'OT ' + escapeHtml(p.orden_trabajo) : '—'}</span></td>
          <td>${badgePropiedad(p.propiedad)}</td>
          <td>${badgeEstado(p.estado)}</td>
          <td><span class="badge-localidad badge-${p.localidad.toLowerCase()}">${p.localidad}</span></td>
          <td class="num-right">${fmtMoney(p.costo)}${p.alto_valor ? `<span class="rep-sub">${badge('rep-alto', 'Alto valor')}</span>` : ''}</td>
          <td>${badgeSituacion(p.situacion)}${reserva}</td>
          <td class="num-right">${dias}</td>
          <td><button type="button" class="btn-obs">Ver</button></td>
        </tr>`;
    }).join('');
  }

  async function cargarResumen() {
    try {
      const loc = $('f-localidad').value;
      const { ok, data } = await api(`/repuestos/resumen${loc ? `?localidad=${loc}` : ''}`);
      if (!ok) return;
      $('kpi-disponibles').textContent = data.disponibles;
      $('kpi-reservados').textContent = data.reservados;
      $('kpi-valor-propio').textContent = fmtMoney(data.valor_propio);
      $('kpi-valor-custodia').textContent = fmtMoney(data.valor_custodia);
      $('kpi-alto').textContent = data.alto_valor;
      $('kpi-salidas').textContent = data.salidas_mes;
      state.cat.umbral = data.umbral;
      actualizarEtiquetaUmbral();
    } catch { /* los KPIs son informativos */ }
  }

  function refrescarListas() {
    cargarInventario();
    cargarResumen();
    if ($('panel-salidas').classList.contains('active')) cargarSalidas();
  }

  // =====================================================
  // DETALLE
  // =====================================================
  async function verDetalle(id) {
    Swal.fire({ title: 'Cargando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    let r;
    try {
      r = await api(`/repuestos/piezas/${id}`);
    } catch {
      return;
    }
    if (!r.ok) {
      Swal.fire('Error', r.data.error || 'No se pudo cargar el repuesto', 'error');
      return;
    }
    const { pieza: p, movimientos, actas, umbral } = r.data;

    Swal.fire({
      customClass: { popup: 'rep-pop-lg' },
      showConfirmButton: false,
      showCloseButton: true,
      html: htmlDetalle(p, movimientos, actas, umbral),
      didOpen: (popup) => {
        popup.querySelectorAll('[data-accion]').forEach(b =>
          b.addEventListener('click', () => ejecutarAccion(b.dataset.accion, p)));
        popup.querySelectorAll('[data-acta]').forEach(b =>
          b.addEventListener('click', () => reimprimirActa(Number(b.dataset.acta))));
        popup.querySelector('#det-copiar')?.addEventListener('click', () => copiar(p.codigo));
      }
    });
  }

  function dato(label, valor) {
    return `<div class="rep-dato"><span>${label}</span><span>${valor}</span></div>`;
  }

  function htmlDetalle(p, movimientos, actas, umbral) {
    const anteriores = [...(p.codigos_anteriores || [])];
    if (p.codigo_legacy) anteriores.push(`${p.codigo_legacy} (antes del sistema)`);

    const reserva = p.situacion === 'RESERVADO' ? `
      <div class="rep-reserva">
        <b>Reservado para la OT ${escapeHtml(p.reservado_ot)}</b> por ${escapeHtml(p.reservado_por)} el ${escapeHtml(p.reservado_en)}
        (${p.dias_reservado ?? 0} día${p.dias_reservado === 1 ? '' : 's'})${p.reserva_obs ? ` — ${escapeHtml(p.reserva_obs)}` : ''}
      </div>` : '';

    const htmlMovs = `
      <div class="rep-scroll" style="max-height:230px;">
        <table class="rep-mini-tabla">
          <thead><tr><th>Fecha</th><th>Movimiento</th><th>Usuario</th></tr></thead>
          <tbody>${movimientos.map(m => `
            <tr${m.anulado ? ' style="opacity:.6"' : ''}>
              <td style="white-space:nowrap">${escapeHtml(m.fecha)}</td>
              <td>${describirMovimiento(m)}</td>
              <td>${escapeHtml(m.usuario)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    const htmlActas = actas.length ? `
      <div class="rep-det-titulo">Actas de custodia</div>
      <table class="rep-mini-tabla">
        <thead><tr><th>N°</th><th>Fecha</th><th>Motivo</th><th>Responsable</th><th></th></tr></thead>
        <tbody>${actas.map(a => `
          <tr>
            <td><b>${pad(a.numero)}</b>${a.anulada ? ' ' + badge('sit-ANULADO', 'Anulada') : ''}</td>
            <td>${escapeHtml(a.fecha)}</td>
            <td>${escapeHtml(etiqueta('motivos', a.motivo))}</td>
            <td>${escapeHtml(a.responsable_nombre)}${a.responsable_cargo ? `<span class="rep-sub">${escapeHtml(a.responsable_cargo)}</span>` : ''}</td>
            <td>${state.puedeVerActas ? `<button type="button" class="btn-obs" data-acta="${a.id}">Reimprimir</button>` : ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : '';

    const acciones = accionesDisponibles(p).map(([accion, texto, clase]) =>
      `<button type="button" class="${clase}" data-accion="${accion}">${texto}</button>`).join('');

    return `
      <div class="rep-modal">
        <div class="rep-det-cabecera">
          <div>
            <div class="rep-det-codigo">${escapeHtml(p.codigo)}</div>
            <div class="rep-det-badges">
              ${badgeSituacion(p.situacion)} ${badgePropiedad(p.propiedad)} ${badgeEstado(p.estado)}
              ${p.alto_valor ? badge('rep-alto', `Alto valor (> ${fmtMoney(umbral)})`) : ''}
            </div>
            ${anteriores.length ? `<span class="rep-sub">Códigos anteriores: ${escapeHtml(anteriores.join(', '))}</span>` : ''}
          </div>
          <button type="button" class="btn-obs" id="det-copiar">Copiar código</button>
        </div>
        ${reserva}
        <div class="rep-det-grid">
          <div class="rep-det-caja">
            <h4>Datos de origen</h4>
            ${dato('Aseguradora / cliente', val(p.cliente))}
            ${dato('Marca', `${escapeHtml(p.marca)} (${escapeHtml(p.marca_codigo)})`)}
            ${dato('Modelo', val(p.modelo))}
            ${dato('Placa', val(p.placa))}
            ${dato('Orden de trabajo', val(p.orden_trabajo))}
            ${dato('Proveedor', val(p.proveedor))}
          </div>
          <div class="rep-det-caja">
            <h4>Información del repuesto</h4>
            ${dato('Detalle', escapeHtml(p.detalle))}
            ${dato('Código auxiliar', val(p.codigo_auxiliar))}
            ${dato('Categoría', escapeHtml(etiqueta('categorias', p.categoria)))}
            ${dato('Propiedad', escapeHtml(etiqueta('propiedades', p.propiedad)))}
            ${dato('Estado', escapeHtml(etiqueta('estados', p.estado)))}
            ${dato('Detalle de estado', val(p.detalle_estado))}
          </div>
          <div class="rep-det-caja">
            <h4>Control e histórico</h4>
            ${dato('Localidad', escapeHtml(p.localidad))}
            ${dato('Costo', fmtMoney(p.costo))}
            ${dato('Ingreso', `${escapeHtml(p.fecha_ingreso)} ${escapeHtml(p.hora_ingreso)}`)}
            ${dato('Revisado por', val(p.revisado_por))}
            ${dato('Registrado por', `${escapeHtml(p.registrado_por)}${p.origen_registro === 'IMPORTACION' ? ' (importación)' : ''}`)}
          </div>
        </div>
        <div class="rep-det-titulo">Historial</div>
        ${htmlMovs}
        ${htmlActas}
        ${acciones ? `<div class="rep-acciones">${acciones}</div>` : ''}
      </div>`;
  }

  const CAMPOS_LABEL = {
    cliente: 'Cliente', marca: 'Marca', modelo: 'Modelo', placa: 'Placa', orden_trabajo: 'OT',
    proveedor: 'Proveedor', detalle: 'Detalle', codigo_auxiliar: 'Código auxiliar', categoria: 'Categoría', propiedad: 'Propiedad',
    estado: 'Estado', detalle_estado: 'Detalle de estado', localidad: 'Localidad',
    costo: 'Costo', revisado_por: 'Revisado por'
  };

  function fmtCampo(campo, v) {
    if (v === null || v === undefined || v === '') return '—';
    if (campo === 'costo') return fmtMoney(v);
    if (campo === 'categoria') return etiqueta('categorias', v);
    if (campo === 'propiedad') return etiqueta('propiedades', v);
    if (campo === 'estado') return etiqueta('estados', v);
    return v;
  }

  function describirMovimiento(m) {
    const obs = m.observacion ? ` <span class="rep-sub">${escapeHtml(m.observacion)}</span>` : '';
    switch (m.tipo) {
      case 'INGRESO':
        return `<b>Ingreso a bodega</b>${m.orden_trabajo ? ` · OT ${escapeHtml(m.orden_trabajo)}` : ''}${obs}`;
      case 'EDICION': {
        const cambios = Object.keys(m.datos_nuevos || {}).map(c =>
          `${CAMPOS_LABEL[c] || c}: ${escapeHtml(fmtCampo(c, m.datos_anteriores?.[c]))} → ${escapeHtml(fmtCampo(c, m.datos_nuevos[c]))}`);
        const codigo = m.codigo_anterior ? `<span class="rep-sub"><b>Código: ${escapeHtml(m.codigo_anterior)} → ${escapeHtml(m.codigo)}</b></span>` : '';
        return `<b>Edición</b>${obs}${codigo}<span class="rep-sub">${cambios.join('<br>')}</span>`;
      }
      case 'RESERVA':
        return `<b>Reservado</b> para OT ${escapeHtml(m.orden_trabajo)}${obs}`;
      case 'LIBERACION':
        return `<b>Reserva liberada</b>${m.orden_trabajo ? ` (OT ${escapeHtml(m.orden_trabajo)})` : ''}${obs}`;
      case 'SALIDA': {
        const partes = [
          m.orden_trabajo ? `OT ${escapeHtml(m.orden_trabajo)}` : '',
          m.entregado_a ? `a ${escapeHtml(m.entregado_a)}` : '',
          m.precio_venta !== null && m.precio_venta !== undefined ? `por ${fmtMoney(m.precio_venta)}` : '',
          m.acta_numero ? `Acta N° ${pad(m.acta_numero)}` : ''
        ].filter(Boolean).join(' · ');
        return `<b>Salida: ${escapeHtml(etiqueta('motivos', m.motivo))}</b>${m.anulado ? ' ' + badge('sit-ANULADO', 'Anulada') : ''}` +
          `${partes ? `<span class="rep-sub">${partes}</span>` : ''}${obs}`;
      }
      case 'ANULACION_SALIDA':
        return `<b>Salida anulada</b>${obs}`;
      case 'ANULACION':
        return `<b>Registro anulado</b>${obs}`;
      default:
        return escapeHtml(m.tipo);
    }
  }

  function accionesDisponibles(p) {
    const a = [];
    const enBodega = p.situacion === 'DISPONIBLE' || p.situacion === 'RESERVADO';
    if (state.puedeRegistrar && enBodega) a.push(['editar', 'Editar', 'btn-obs']);
    if (state.puedeReservar && p.situacion === 'DISPONIBLE') a.push(['reservar', 'Reservar para OT', 'btn-obs']);
    if (p.situacion === 'RESERVADO' && (state.puedeRegistrar || (state.esAsesor && p.reservado_por === state.usuario))) {
      a.push(['liberar', 'Liberar reserva', 'btn-obs']);
    }
    if (state.esAdmin && p.situacion === 'DISPONIBLE') a.push(['anular', 'Anular registro', 'btn-eliminar']);
    if (state.esAdmin && p.situacion === 'SALIDA') a.push(['anular-salida', 'Anular salida', 'btn-eliminar']);
    if (state.puedeRegistrar && enBodega) a.push(['salida', 'Registrar salida', 'rep-btn-primario']);
    return a;
  }

  function ejecutarAccion(accion, p) {
    const acciones = {
      editar: () => editarPieza(p),
      reservar: () => reservar(p),
      liberar: () => liberar(p),
      salida: () => registrarSalida(p),
      'anular-salida': () => anularSalida(p),
      anular: () => anularRegistro(p)
    };
    acciones[accion]?.();
  }

  // =====================================================
  // RESERVAS
  // =====================================================
  async function reservar(p) {
    const { value: resultado } = await Swal.fire({
      title: `Reservar ${p.codigo}`,
      customClass: { popup: 'rep-pop-md' },
      html: `
        <div class="rep-modal">
          <p class="rep-modal-sub">${escapeHtml(p.detalle)} · ${escapeHtml(p.marca)} ${val(p.modelo)}</p>
          <div class="rep-campo">
            <label for="res-ot">OT donde se usará <span class="req">*</span></label>
            <input id="res-ot" class="swal2-input" maxlength="20" placeholder="Ej: 4754" inputmode="numeric">
          </div>
          <div class="rep-campo">
            <label for="res-obs">Observación</label>
            <textarea id="res-obs" class="swal2-textarea" maxlength="500"></textarea>
          </div>
          <p class="rep-ayuda">Mientras esté reservada nadie más podrá tomarla. Bodega recibe un aviso.</p>
        </div>`,
      showCancelButton: true,
      confirmButtonText: 'Reservar',
      cancelButtonText: 'Volver',
      focusConfirm: false,
      allowOutsideClick: () => !Swal.isLoading(),
      didOpen: () => $('res-ot').focus(),
      preConfirm: async () => {
        const ot = $('res-ot').value.trim();
        if (!ot) { Swal.showValidationMessage('Indique la OT'); return false; }
        const r = await post(`/repuestos/piezas/${p.id}/reservar`, { orden_trabajo: ot, observacion: $('res-obs').value.trim() });
        if (!r.ok) { Swal.showValidationMessage(r.data.error || 'No se pudo reservar'); return false; }
        return r.data;
      }
    });
    if (resultado) {
      refrescarListas();
      if (resultado.advertencias?.length) {
        await Swal.fire({ icon: 'info', title: 'Reservado', text: resultado.advertencias.join(' ') });
      } else {
        toast(`Reservado ${p.codigo}`);
      }
    }
    verDetalle(p.id);
  }

  async function liberar(p) {
    const { value: ok } = await Swal.fire({
      title: 'Liberar reserva',
      customClass: { popup: 'rep-pop-md' },
      html: `
        <div class="rep-modal">
          <p class="rep-modal-sub">${escapeHtml(p.codigo)} reservado para la OT ${escapeHtml(p.reservado_ot)} por ${escapeHtml(p.reservado_por)}</p>
          <div class="rep-campo">
            <label for="lib-obs">Observación</label>
            <textarea id="lib-obs" class="swal2-textarea" maxlength="500" placeholder="Opcional"></textarea>
          </div>
        </div>`,
      showCancelButton: true,
      confirmButtonText: 'Liberar',
      cancelButtonText: 'Volver',
      allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async () => {
        const r = await post(`/repuestos/piezas/${p.id}/liberar`, { observacion: $('lib-obs').value.trim() });
        if (!r.ok) { Swal.showValidationMessage(r.data.error || 'No se pudo liberar'); return false; }
        return true;
      }
    });
    if (ok) {
      refrescarListas();
      toast('Reserva liberada');
    }
    verDetalle(p.id);
  }

  // =====================================================
  // SALIDA + ACTA DE CUSTODIA
  // =====================================================
  async function registrarSalida(p) {
    await cargarEmpleados();
    const umbral = state.cat.umbral;
    const altoValor = p.costo > umbral;
    const deTerceros = p.propiedad !== 'TAL';

    const opcionesEmpleados = state.empleados.map(e =>
      `<option value="${e.id}">${escapeHtml(e.nombre_completo)}${e.cargo ? ' — ' + escapeHtml(e.cargo) : ''}</option>`).join('');

    const { value: resultado } = await Swal.fire({
      title: `Registrar salida · ${p.codigo}`,
      customClass: { popup: 'rep-pop-lg' },
      html: `
        <div class="rep-modal">
          <p class="rep-modal-sub">${escapeHtml(p.detalle)} · ${escapeHtml(p.marca)} ${val(p.modelo)} · ${fmtMoney(p.costo)} · ${escapeHtml(etiqueta('propiedades', p.propiedad))}</p>
          ${p.situacion === 'RESERVADO' ? `<div class="rep-reserva">Reservado para la OT <b>${escapeHtml(p.reservado_ot)}</b> por ${escapeHtml(p.reservado_por)}</div>` : ''}
          <div class="rep-fila2">
            <div class="rep-campo">
              <label for="sal-motivo">Motivo <span class="req">*</span></label>
              <select id="sal-motivo" class="swal2-select">${opciones(state.cat.motivos)}</select>
            </div>
            <div class="rep-campo" id="sal-grupo-ot">
              <label for="sal-ot">OT donde se usará <span class="req">*</span></label>
              <input id="sal-ot" class="swal2-input" maxlength="20" inputmode="numeric" value="${escapeHtml(p.reservado_ot || '')}">
            </div>
          </div>
          <div class="rep-fila2">
            <div class="rep-campo">
              <label for="sal-entregado" id="sal-lbl-entregado">Entregado a</label>
              <input id="sal-entregado" class="swal2-input" maxlength="200" list="dl-clientes">
            </div>
            <div class="rep-campo" id="sal-grupo-precio">
              <label for="sal-precio">Precio de venta (USD) <span class="req">*</span></label>
              <input id="sal-precio" class="swal2-input" type="number" min="0" step="0.01" inputmode="decimal">
            </div>
          </div>
          <div class="rep-campo">
            <label for="sal-obs" id="sal-lbl-obs">Observación</label>
            <textarea id="sal-obs" class="swal2-textarea" maxlength="1000"></textarea>
            ${deTerceros ? `<span class="rep-ayuda warn">La pieza es propiedad de ${escapeHtml(etiqueta('propiedades', p.propiedad))}: para uso interno, venta o baja indique quién lo autorizó.</span>` : ''}
          </div>
          <div id="sal-acta" style="display:${altoValor ? '' : 'none'};">
            <div class="rep-banner-alto" id="sal-banner">
              ALTO VALOR: el costo de ${fmtMoney(p.costo)} supera el umbral de ${fmtMoney(umbral)}.
              Se generará el Acta de Custodia; debe imprimirse y firmarla quien retira la pieza.
            </div>
            <div class="rep-fila2">
              <div class="rep-campo">
                <label for="sal-emp">Quién retira <span class="req">*</span></label>
                <select id="sal-emp" class="swal2-select">
                  <option value="">— Persona externa —</option>
                  ${opcionesEmpleados}
                </select>
              </div>
              <div class="rep-campo">
                <label for="sal-resp-nombre">Nombre completo <span class="req">*</span></label>
                <input id="sal-resp-nombre" class="swal2-input" maxlength="200">
              </div>
            </div>
            <div class="rep-fila2">
              <div class="rep-campo">
                <label for="sal-resp-cedula">Cédula <span class="req">*</span></label>
                <input id="sal-resp-cedula" class="swal2-input" maxlength="20">
              </div>
              <div class="rep-campo">
                <label for="sal-resp-cargo">Cargo</label>
                <input id="sal-resp-cargo" class="swal2-input" maxlength="120">
              </div>
            </div>
          </div>
        </div>`,
      showCancelButton: true,
      confirmButtonText: 'Registrar salida',
      cancelButtonText: 'Volver',
      focusConfirm: false,
      allowOutsideClick: () => !Swal.isLoading(),
      didOpen: () => {
        const motivo = $('sal-motivo');
        motivo.value = 'OT_INTERNA';
        motivo.addEventListener('change', () => ajustarCamposSalida(p));
        ajustarCamposSalida(p);

        $('sal-emp').addEventListener('change', () => {
          const emp = state.empleados.find(e => String(e.id) === $('sal-emp').value);
          const campos = ['sal-resp-nombre', 'sal-resp-cedula', 'sal-resp-cargo'];
          campos.forEach(id => { $(id).readOnly = !!emp; });
          $('sal-resp-nombre').value = emp?.nombre_completo || '';
          $('sal-resp-cedula').value = emp?.cedula || '';
          $('sal-resp-cargo').value = emp?.cargo || '';
          if (emp && !$('sal-entregado').value.trim() && motivo.value === 'OT_INTERNA') {
            $('sal-entregado').value = emp.nombre_completo;
          }
        });
      },
      preConfirm: async () => {
        const motivo = $('sal-motivo').value;
        const body = {
          motivo,
          orden_trabajo: motivo === 'OT_INTERNA' ? $('sal-ot').value.trim() : '',
          entregado_a: $('sal-entregado').value.trim(),
          observacion: $('sal-obs').value.trim(),
          situacion_esperada: p.situacion
        };
        if (motivo === 'VENTA') body.precio_venta = $('sal-precio').value;

        if (motivo === 'OT_INTERNA' && !body.orden_trabajo) return falta('Indique la OT donde se usará la pieza');
        if (motivo === 'VENTA' && !body.entregado_a) return falta('Indique el comprador');
        if (motivo === 'VENTA' && (body.precio_venta === '' || Number(body.precio_venta) < 0)) return falta('Indique el precio de venta');
        if (motivo === 'DEVOLUCION' && !body.entregado_a) return falta('Indique a quién se devuelve');
        if (motivo === 'BAJA' && !body.observacion) return falta('Indique la razón de la baja');
        if (deTerceros && ['OT_INTERNA', 'VENTA', 'BAJA'].includes(motivo) && !body.observacion) {
          return falta('Indique en la observación quién autorizó esta salida');
        }

        if ($('sal-acta').style.display !== 'none') {
          body.responsable = {
            empleado_id: $('sal-emp').value || null,
            nombre: $('sal-resp-nombre').value.trim(),
            cedula: $('sal-resp-cedula').value.trim(),
            cargo: $('sal-resp-cargo').value.trim()
          };
          if (!body.responsable.nombre || !body.responsable.cedula) {
            return falta('Complete el nombre y la cédula de quien retira la pieza (Acta de Custodia)');
          }
        }

        const r = await post(`/repuestos/piezas/${p.id}/salida`, body);
        if (!r.ok) {
          // El umbral pudo cambiar mientras el formulario estaba abierto
          if (r.status === 422 && r.data.requiere_acta) $('sal-acta').style.display = '';
          Swal.showValidationMessage(r.data.error || 'No se pudo registrar la salida');
          return false;
        }
        return r.data;
      }
    });

    if (!resultado) { verDetalle(p.id); return; }
    refrescarListas();

    if (resultado.acta) {
      const doc = await generarActaPDF(resultado.acta, false);
      doc.save(nombreActa(resultado.acta));
      await Swal.fire({
        icon: 'success',
        title: `Salida registrada · Acta N° ${pad(resultado.acta.numero)}`,
        html: `Se descargó el Acta de Custodia. Imprímala y hágala firmar por <b>${escapeHtml(resultado.acta.responsable_nombre)}</b>.<br><br>
               <button type="button" class="btn-obs" id="btn-abrir-acta">Abrir acta para imprimir</button>`,
        didOpen: () => { $('btn-abrir-acta').onclick = () => window.open(doc.output('bloburl'), '_blank'); }
      });
    } else {
      toast('Salida registrada');
    }
    verDetalle(p.id);
  }

  function falta(mensaje) {
    Swal.showValidationMessage(mensaje);
    return false;
  }

  function ajustarCamposSalida(p) {
    const motivo = $('sal-motivo').value;
    $('sal-grupo-ot').style.visibility = motivo === 'OT_INTERNA' ? 'visible' : 'hidden';
    $('sal-grupo-precio').style.visibility = motivo === 'VENTA' ? 'visible' : 'hidden';
    const etiquetas = {
      OT_INTERNA: 'Entregado a (técnico)',
      VENTA: 'Comprador <span class="req">*</span>',
      DEVOLUCION: 'Devuelto a (aseguradora / cliente) <span class="req">*</span>',
      BAJA: 'Entregado a (opcional)'
    };
    $('sal-lbl-entregado').innerHTML = etiquetas[motivo];
    $('sal-lbl-obs').innerHTML = motivo === 'BAJA' ? 'Razón de la baja <span class="req">*</span>' : 'Observación';
    if (motivo === 'DEVOLUCION' && !$('sal-entregado').value.trim()) $('sal-entregado').value = p.cliente || '';
  }

  async function anularSalida(p) {
    const { value: ok } = await Swal.fire({
      title: 'Anular salida',
      icon: 'warning',
      customClass: { popup: 'rep-pop-md' },
      html: `
        <div class="rep-modal">
          <p class="rep-modal-sub">El repuesto ${escapeHtml(p.codigo)} vuelve a estar disponible; si tenía Acta de Custodia, queda anulada.</p>
          <div class="rep-campo">
            <label for="anu-motivo">Motivo <span class="req">*</span></label>
            <textarea id="anu-motivo" class="swal2-textarea" maxlength="500"></textarea>
          </div>
        </div>`,
      showCancelButton: true,
      confirmButtonText: 'Anular salida',
      confirmButtonColor: '#d33',
      cancelButtonText: 'Volver',
      allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async () => {
        const motivo = $('anu-motivo').value.trim();
        if (!motivo) return falta('Indique el motivo');
        const r = await post(`/repuestos/piezas/${p.id}/anular-salida`, { motivo });
        if (!r.ok) return falta(r.data.error || 'No se pudo anular');
        return true;
      }
    });
    if (ok) { refrescarListas(); toast('Salida anulada'); }
    verDetalle(p.id);
  }

  async function anularRegistro(p) {
    const { value: ok } = await Swal.fire({
      title: 'Anular registro',
      icon: 'warning',
      customClass: { popup: 'rep-pop-md' },
      html: `
        <div class="rep-modal">
          <p class="rep-modal-sub">Use esta opción solo si ${escapeHtml(p.codigo)} se registró por error. El número ${pad(p.correlativo)} no se vuelve a usar.</p>
          <div class="rep-campo">
            <label for="anu-motivo">Motivo <span class="req">*</span></label>
            <textarea id="anu-motivo" class="swal2-textarea" maxlength="500"></textarea>
          </div>
        </div>`,
      showCancelButton: true,
      confirmButtonText: 'Anular registro',
      confirmButtonColor: '#d33',
      cancelButtonText: 'Volver',
      allowOutsideClick: () => !Swal.isLoading(),
      preConfirm: async () => {
        const motivo = $('anu-motivo').value.trim();
        if (!motivo) return falta('Indique el motivo');
        const r = await post(`/repuestos/piezas/${p.id}/anular`, { motivo });
        if (!r.ok) return falta(r.data.error || 'No se pudo anular');
        return true;
      }
    });
    if (ok) { refrescarListas(); toast('Registro anulado'); }
    verDetalle(p.id);
  }

  async function reimprimirActa(id) {
    Swal.fire({ title: 'Generando acta...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const { ok, data } = await api(`/repuestos/actas/${id}`);
    if (!ok) { Swal.fire('Error', data.error || 'No se pudo cargar el acta', 'error'); return; }
    const doc = await generarActaPDF(data, true);
    doc.save(nombreActa(data));
    Swal.fire({
      icon: 'success',
      title: `Acta N° ${pad(data.numero)}`,
      html: `${data.anulada ? '<p>Esta acta está <b>ANULADA</b>.</p>' : ''}<button type="button" class="btn-obs" id="btn-abrir-acta">Abrir para imprimir</button>`,
      didOpen: () => { $('btn-abrir-acta').onclick = () => window.open(doc.output('bloburl'), '_blank'); }
    });
  }

  const nombreActa = (acta) => `ACTA_${pad(acta.numero)}_${acta.snapshot?.codigo || 'REPUESTO'}.pdf`;

  function cargarImagenBase64(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext('2d').drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  // Acta de Custodia: mismo diseño que el PDF de Órdenes de Compra
  async function generarActaPDF(acta, reimpresion) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const s = acta.snapshot || {};

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const mL = 18;
    const mR = 18;
    const cW = pageW - mL - mR;
    const primary = [30, 58, 95];
    const accent = [234, 88, 12];
    const gray = [100, 116, 139];
    const dark = [15, 23, 42];

    doc.setFillColor(...primary);
    doc.rect(0, 0, pageW, 3, 'F');

    const logo = await cargarImagenBase64('img/logo.png');
    if (logo) doc.addImage(logo, 'PNG', mL, 8, 35, 18);
    const hx = logo ? mL + 40 : mL;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...primary);
    doc.text('GLOBAL MOTRIZ S.A.', hx, 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...gray);
    doc.text('Bodega · Inventario de Repuestos', hx, 22);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...accent);
    doc.text(`ACTA N° ${pad(acta.numero)}`, pageW - mR, 17, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...gray);
    doc.text(`${acta.fecha} · ${s.localidad || ''}`, pageW - mR, 23, { align: 'right' });

    doc.setDrawColor(...primary); doc.setLineWidth(0.5);
    doc.line(mL, 30, pageW - mR, 30);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(...dark);
    doc.text('ACTA DE ENTREGA Y CUSTODIA DE REPUESTO DE ALTO VALOR', pageW / 2, 39, { align: 'center' });

    const txtPdf = (v) => (v === null || v === undefined || v === '' ? '-' : String(v));
    const tabla = (titulo, filas, startY) => {
      doc.autoTable({
        startY,
        head: [[{ content: titulo, colSpan: 4 }]],
        body: filas,
        theme: 'grid',
        margin: { left: mL, right: mR },
        styles: { fontSize: 9.5, cellPadding: 2.4, lineColor: [226, 232, 240], lineWidth: 0.2, textColor: dark, valign: 'middle' },
        headStyles: { fillColor: primary, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9.5 },
        columnStyles: {
          0: { cellWidth: 34, fontStyle: 'bold', textColor: gray, fillColor: [248, 250, 252] },
          1: { cellWidth: cW / 2 - 34 },
          2: { cellWidth: 34, fontStyle: 'bold', textColor: gray, fillColor: [248, 250, 252] }
        }
      });
      return doc.lastAutoTable.finalY;
    };
    const ancho = (v) => ({ content: txtPdf(v), colSpan: 3 });

    let y = tabla('DATOS DEL REPUESTO', [
      ['Código', { content: txtPdf(s.codigo), styles: { fontStyle: 'bold', fontSize: 11 } }, 'Valor', { content: fmtMoney(acta.valor), styles: { fontStyle: 'bold' } }],
      ['Detalle', ancho(s.detalle)],
      ...(s.codigo_auxiliar ? [['Código auxiliar', ancho(s.codigo_auxiliar)]] : []),
      ['Marca / Modelo', txtPdf([s.marca, s.modelo].filter(Boolean).join(' ')), 'Categoría', txtPdf(s.categoria)],
      ['Placa de origen', txtPdf(s.placa), 'OT de origen', txtPdf(s.ot_origen)],
      ['Propiedad', txtPdf(s.propiedad), 'Estado', txtPdf(s.estado)],
      ['Localidad', txtPdf(s.localidad), 'Umbral Alto Valor', fmtMoney(acta.umbral_aplicado)],
      ...(s.detalle_estado ? [['Detalle de estado', ancho(s.detalle_estado)]] : [])
    ], 45);

    y = tabla('DATOS DE LA SALIDA', [
      ['Motivo', txtPdf(s.motivo), 'OT destino', txtPdf(s.ot_destino)],
      ['Entregado a', ancho(s.entregado_a)],
      ...(s.precio_venta !== null && s.precio_venta !== undefined ? [['Precio de venta', ancho(fmtMoney(s.precio_venta))]] : []),
      ...(s.observacion ? [['Observación', ancho(s.observacion)]] : [])
    ], y + 5);

    // Declaración de responsabilidad según el motivo
    const compromiso = {
      OT_INTERNA: `para su instalación en el vehículo de la orden de trabajo N° ${txtPdf(s.ot_destino)}, y asumo la responsabilidad por su custodia física hasta que quede instalado.`,
      VENTA: 'en calidad de comprador, y asumo desde esta fecha la responsabilidad por su custodia física.',
      DEVOLUCION: `en representación de ${txtPdf(s.entregado_a)}, a quien se devuelve la pieza, quedando GLOBAL MOTRIZ S.A. liberada de su custodia.`,
      BAJA: 'para su baja / disposición como chatarra, y asumo la responsabilidad por su custodia física hasta su disposición final.'
    };
    const declaracion = `Yo, ${acta.responsable_nombre}, con cédula de identidad N° ${acta.responsable_cedula}` +
      `${acta.responsable_cargo ? `, ${acta.responsable_cargo}` : ''}, declaro haber recibido de la bodega de GLOBAL MOTRIZ S.A. ` +
      `el repuesto descrito en esta acta, en el estado indicado, ${compromiso[acta.motivo] || 'y asumo la responsabilidad por su custodia física.'}`;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...dark);
    const lineas = doc.splitTextToSize(declaracion, cW);
    y += 9;
    doc.text(lineas, mL, y);
    y += lineas.length * 5;

    // Firmas
    if (y > 222) { doc.addPage(); y = 30; }
    const firmaY = Math.max(y + 28, 236);
    const lineW = 72;
    const x1 = mL + (cW / 2 - lineW) / 2;
    const x2 = mL + cW / 2 + (cW / 2 - lineW) / 2;
    doc.setLineWidth(0.4);
    doc.setDrawColor(...primary); doc.line(x1, firmaY, x1 + lineW, firmaY);
    doc.setDrawColor(...accent); doc.line(x2, firmaY, x2 + lineW, firmaY);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...dark);
    doc.text('ENTREGADO POR', x1 + lineW / 2, firmaY + 5, { align: 'center' });
    doc.text('RECIBIDO POR (RESPONSABLE)', x2 + lineW / 2, firmaY + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...gray);
    doc.text(`Bodega · ${acta.entregado_por}`, x1 + lineW / 2, firmaY + 10, { align: 'center' });
    const nombreLineas = doc.splitTextToSize(acta.responsable_nombre, lineW + 10);
    doc.text(nombreLineas, x2 + lineW / 2, firmaY + 10, { align: 'center' });
    const yCedula = firmaY + 10 + nombreLineas.length * 4.5;
    doc.text(`C.I. ${acta.responsable_cedula}`, x2 + lineW / 2, yCedula, { align: 'center' });
    if (acta.responsable_cargo) doc.text(acta.responsable_cargo, x2 + lineW / 2, yCedula + 4.5, { align: 'center' });

    // Pie
    doc.setFillColor(...primary);
    doc.rect(0, pageH - 12, pageW, 12, 'F');
    doc.setFontSize(7); doc.setTextColor(255, 255, 255);
    doc.text('Global Motriz S.A. — Acta generada por el Sistema de Inventario de Repuestos', pageW / 2, pageH - 7, { align: 'center' });
    doc.setTextColor(200, 200, 200);
    doc.text(`${reimpresion ? 'REIMPRESIÓN · ' : ''}Impreso: ${new Date().toLocaleString('es-EC')}`, pageW / 2, pageH - 3, { align: 'center' });

    if (acta.anulada) {
      doc.setTextColor(220, 38, 38);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text(`ACTA ANULADA el ${acta.anulada_en || ''} por ${acta.anulada_por || ''}: ${acta.anulada_motivo || ''}`, pageW / 2, 43, { align: 'center', maxWidth: cW });
      try { doc.setGState(new doc.GState({ opacity: 0.15 })); } catch { /* sin transparencia */ }
      doc.setFontSize(90);
      doc.text('ANULADA', pageW / 2 - 60, pageH / 2 + 30, { angle: 35 });
      try { doc.setGState(new doc.GState({ opacity: 1 })); } catch { /* sin transparencia */ }
    }
    return doc;
  }

  // =====================================================
  // REGISTRAR / EDITAR
  // =====================================================
  let empleadosPromesa = null;

  function cargarEmpleados() {
    if (!state.puedeRegistrar) return Promise.resolve([]);
    if (!empleadosPromesa) {
      empleadosPromesa = api('/repuestos/empleados')
        .then(r => { state.empleados = r.ok && Array.isArray(r.data) ? r.data : []; llenarSelectRevisado(); return state.empleados; })
        .catch(() => { empleadosPromesa = null; return []; });
    }
    return empleadosPromesa;
  }

  function llenarSelectRevisado() {
    const sel = $('r-revisado');
    const actual = sel.value;
    sel.innerHTML = '<option value="">Seleccione...</option>' + state.empleados.map(e =>
      `<option value="${e.id}">${escapeHtml(e.nombre_completo)}${e.cargo ? ' — ' + escapeHtml(e.cargo) : ''}</option>`).join('');
    sel.value = actual;
  }

  // -----------------------------------------------------
  // Tarjetas de repuesto: en un registro nuevo se pueden agregar varias (misma OT);
  // en una edición hay una sola. Los datos de origen y "Revisado por" son comunes.
  // -----------------------------------------------------
  const MAX_ITEMS = 50; // igual que MAX_PIEZAS_REGISTRO en el backend
  let uidItem = 0;

  const itemsFormulario = () => [...$('r-items').querySelectorAll('.rep-item')];
  const campoItem = (el, campo) => el.querySelector(`[data-campo="${campo}"]`);

  function crearItem(datos = {}) {
    const uid = ++uidItem;
    const id = (campo) => `ri-${uid}-${campo}`;
    // "Taller (TAL)": primero la palabra y entre paréntesis la sigla que va en el código
    const radios = (campo, mapa) => Object.entries(mapa).map(([k, v]) =>
      `<label><input type="radio" name="${id(campo)}" value="${k}" data-campo="${campo}">${escapeHtml(v)}<b>(${k})</b></label>`).join('');

    const el = document.createElement('div');
    el.className = 'rep-item';
    el.innerHTML = `
      <div class="rep-item-cab">
        <span class="rep-item-num"></span>
        <span class="rep-item-codigo" data-preview>___-__-___-####</span>
        <span data-alto></span>
        <button type="button" class="rep-item-quitar" data-quitar title="Quitar este repuesto del registro">✕ Quitar</button>
      </div>
      <div class="rep-item-grid">
        <div class="rep-campo rep-col-2">
          <label for="${id('detalle')}">Nombre del repuesto <span class="req">*</span></label>
          <input type="text" id="${id('detalle')}" data-campo="detalle" maxlength="500">
        </div>
        <div class="rep-campo">
          <label for="${id('codigo_auxiliar')}">Código auxiliar <span class="rep-opcional">(opcional)</span></label>
          <input type="text" id="${id('codigo_auxiliar')}" data-campo="codigo_auxiliar" maxlength="60">
        </div>
        <div class="rep-campo">
          <label for="${id('categoria')}">Categoría <span class="req">*</span></label>
          <select id="${id('categoria')}" data-campo="categoria">${opciones(state.cat.categorias, 'Seleccione...')}</select>
        </div>
        <div class="rep-campo rep-col-2">
          <label>Propiedad <span class="req">*</span></label>
          <div class="rep-seg">${radios('propiedad', state.cat.propiedades)}</div>
        </div>
        <div class="rep-campo rep-col-2">
          <label>Estado del repuesto <span class="req">*</span></label>
          <div class="rep-seg">${radios('estado', state.cat.estados)}</div>
        </div>
        <div class="rep-campo">
          <label for="${id('costo')}">Costo (USD) <span class="req">*</span></label>
          <input type="number" id="${id('costo')}" data-campo="costo" min="0" step="0.01" placeholder="0.00" inputmode="decimal">
        </div>
        <div class="rep-campo rep-col-3">
          <label for="${id('detalle_estado')}">Detalle de estado <span class="req" data-req-estado style="display:none;">*</span></label>
          <textarea id="${id('detalle_estado')}" data-campo="detalle_estado" maxlength="1000" placeholder="Descripción del estado (qué reparación necesita, por qué está aquí...)"></textarea>
        </div>
      </div>
      <div class="rep-ayuda err" data-ayuda></div>
      <div class="rep-ayuda err" data-error></div>`;
    llenarItem(el, datos);
    return el;
  }

  function leerItem(el) {
    const radio = (campo) => el.querySelector(`input[data-campo="${campo}"]:checked`)?.value || '';
    return {
      detalle: campoItem(el, 'detalle').value.trim(),
      codigo_auxiliar: campoItem(el, 'codigo_auxiliar').value.trim(),
      categoria: campoItem(el, 'categoria').value,
      propiedad: radio('propiedad'),
      estado: radio('estado'),
      detalle_estado: campoItem(el, 'detalle_estado').value.trim(),
      costo: campoItem(el, 'costo').value
    };
  }

  function llenarItem(el, d) {
    for (const c of ['detalle', 'codigo_auxiliar', 'categoria', 'detalle_estado', 'costo']) {
      if (d[c] !== undefined) campoItem(el, c).value = d[c] ?? '';
    }
    for (const c of ['propiedad', 'estado']) {
      el.querySelectorAll(`input[data-campo="${c}"]`).forEach(r => { r.checked = r.value === d[c]; });
    }
  }

  // Deja una sola tarjeta (vacía o con los datos dados)
  function reiniciarItems(datos) {
    $('r-items').innerHTML = '';
    $('r-items').appendChild(crearItem(datos));
  }

  function agregarItem() {
    const items = itemsFormulario();
    if (items.length >= MAX_ITEMS) {
      Swal.fire('Límite alcanzado', `Se pueden registrar hasta ${MAX_ITEMS} repuestos a la vez. Guarde estos y continúe en otro registro.`, 'info');
      return;
    }
    // Se repite la propiedad del anterior: los repuestos de una misma OT suelen ser del mismo dueño
    const anterior = items[items.length - 1];
    const el = crearItem(anterior ? { propiedad: leerItem(anterior).propiedad } : {});
    $('r-items').appendChild(el);
    actualizarPreview();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    campoItem(el, 'detalle').focus({ preventScroll: true });
  }

  async function quitarItem(el) {
    if (itemsFormulario().length <= 1) return;
    const d = leerItem(el);
    if (d.detalle || d.codigo_auxiliar || d.categoria || d.estado || d.detalle_estado || d.costo) {
      const { isConfirmed } = await Swal.fire({
        icon: 'question',
        title: '¿Quitar este repuesto?',
        text: d.detalle || el.querySelector('.rep-item-num').textContent,
        showCancelButton: true,
        confirmButtonText: 'Quitar',
        cancelButtonText: 'Cancelar'
      });
      if (!isConfirmed) return;
    }
    el.remove();
    actualizarPreview();
  }

  function faltantesItem(p) {
    const f = [];
    if (!p.detalle) f.push('nombre del repuesto');
    if (!p.categoria) f.push('categoría');
    if (!p.propiedad) f.push('propiedad');
    if (!p.estado) f.push('estado');
    if (['UR', 'REP'].includes(p.estado) && !p.detalle_estado) f.push('detalle de estado');
    if (p.costo === '' || !(Number(p.costo) >= 0)) f.push('costo');
    return f;
  }

  function marcarErrorItem(el, mensaje) {
    el.classList.toggle('con-error', !!mensaje);
    el.querySelector('[data-error]').textContent = mensaje || '';
  }

  function initFormulario() {
    if (!state.puedeRegistrar) return;

    // La OT se busca con la lupa (o Enter) en la localidad elegida
    $('btn-buscar-ot').onclick = buscarOT;
    $('r-ot').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscarOT(); } });
    $('r-localidad').addEventListener('change', () => {
      if ($('r-ot').value.trim()) mostrarAyudaOT(`Presione la lupa para buscar la OT en ${$('r-localidad').value}`);
    });
    $('r-placa').addEventListener('input', () => { $('r-placa').value = $('r-placa').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    $('r-marca').addEventListener('change', actualizarPreview);

    // Tarjetas de repuesto
    reiniciarItems();
    $('r-items').addEventListener('input', actualizarPreview);
    $('r-items').addEventListener('change', actualizarPreview);
    $('r-items').addEventListener('click', (e) => {
      const quitar = e.target.closest('[data-quitar]');
      if (quitar) quitarItem(quitar.closest('.rep-item'));
    });
    $('btn-agregar-item').onclick = agregarItem;

    // Nueva marca (mini formulario dentro del panel)
    let codigoEditado = false;
    $('btn-nueva-marca').onclick = () => {
      $('nueva-marca').classList.toggle('abierta');
      $('nm-msg').textContent = '';
      if ($('nueva-marca').classList.contains('abierta')) $('nm-nombre').focus();
    };
    $('nm-nombre').addEventListener('input', () => { if (!codigoEditado) $('nm-codigo').value = sugerirCodigo($('nm-nombre').value); });
    $('nm-codigo').addEventListener('input', () => { codigoEditado = true; soloLetras($('nm-codigo')); });
    $('nm-cancelar').onclick = () => {
      $('nueva-marca').classList.remove('abierta');
      $('nm-nombre').value = '';
      $('nm-codigo').value = '';
      codigoEditado = false;
    };
    $('nm-guardar').onclick = async () => {
      const nombre = $('nm-nombre').value.trim();
      const codigo = $('nm-codigo').value.trim();
      if (!nombre || codigo.length !== 3) { $('nm-msg').textContent = 'Escriba el nombre y un código de 3 letras'; return; }
      const r = await post('/repuestos/marcas', { nombre, codigo });
      if (!r.ok) { $('nm-msg').textContent = r.data.error || 'No se pudo crear la marca'; return; }
      await refrescarMarcas();
      $('r-marca').value = String(r.data.id);
      $('nm-cancelar').click();
      actualizarPreview();
      toast(`Marca ${r.data.nombre} (${r.data.codigo}) agregada`);
    };

    $('btn-guardar').onclick = guardarPieza;
    $('btn-limpiar-form').onclick = async () => {
      if (state.edicion) { const id = state.edicion.id; cancelarEdicion(); irATab('inventario'); verDetalle(id); return; }
      const n = itemsFormulario().length;
      if (n > 1) {
        const { isConfirmed } = await Swal.fire({
          icon: 'question',
          title: '¿Limpiar el formulario?',
          text: `Se borrarán los datos de origen y los ${n} repuestos ingresados.`,
          showCancelButton: true,
          confirmButtonText: 'Limpiar',
          cancelButtonText: 'Cancelar'
        });
        if (!isConfirmed) return;
      }
      limpiarFormulario();
    };
  }

  function mostrarAyudaOT(texto, tipo) {
    const ayuda = $('r-ot-estado');
    ayuda.textContent = texto;
    ayuda.className = tipo ? `rep-ayuda ${tipo}` : 'rep-ayuda';
  }

  // Lupa de la OT: busca solo en la localidad elegida y reemplaza los datos de origen
  // con los de la OT encontrada, para que no queden datos de una búsqueda anterior
  async function buscarOT() {
    const ot = $('r-ot').value.trim().toUpperCase();
    const loc = $('r-localidad').value;
    $('r-ot').value = ot;
    if (!ot) { mostrarAyudaOT('Escriba el número de OT y presione la lupa', 'warn'); $('r-ot').focus(); return; }
    if (!/^[A-Z0-9-]{1,20}$/.test(ot)) { mostrarAyudaOT('Número de OT inválido', 'err'); return; }

    mostrarAyudaOT(`Buscando la OT ${ot} en ${loc}...`);
    $('btn-buscar-ot').disabled = true;
    let r;
    try {
      r = await api(`/repuestos/ot/${encodeURIComponent(ot)}?localidad=${encodeURIComponent(loc)}`);
    } catch {
      return;
    } finally {
      $('btn-buscar-ot').disabled = false;
    }
    // Si cambiaron la OT o la localidad mientras buscaba, esta respuesta ya no aplica
    if ($('r-ot').value.trim().toUpperCase() !== ot || $('r-localidad').value !== loc) return;

    if (!r.ok) { mostrarAyudaOT(r.data.error || 'No se pudo consultar la OT', 'err'); return; }
    if (!r.data.encontrada) {
      mostrarAyudaOT(`No hay una OT ${ot} en ${loc}. Revise el número o la localidad; si la OT aún no se importa de Getsoft, complete los datos a mano.`, 'err');
      return;
    }

    const o = r.data.ordenes[0];
    $('r-placa').value = o.placa || '';
    $('r-modelo').value = o.modelo || '';
    $('r-cliente').value = o.aseguradora || o.cliente || '';
    $('r-marca').value = o.marca_id ? String(o.marca_id) : '';

    const vehiculo = [o.placa, o.marca, o.modelo].filter(Boolean).join(' ');
    const marcaFuera = o.marca && !o.marca_id;
    mostrarAyudaOT(
      `OT ${o.numero_orden} · ${o.estado} · ${o.localidad}${vehiculo ? ' — ' + vehiculo : ''}` +
      `${marcaFuera ? ` · la marca "${o.marca}" no está en el catálogo: agréguela con "+ Nueva marca"` : ''}`,
      marcaFuera || ['ANULADO', 'FACTURADO'].includes(o.estado) ? 'warn' : 'ok'
    );
    actualizarPreview();
  }

  // Código de cada tarjeta, alto valor, campos obligatorios y resumen del pie
  function actualizarPreview() {
    const editando = !!state.edicion;
    const marca = state.cat.marcas.find(m => String(m.id) === $('r-marca').value) ||
      (editando && String(state.edicion.marca_id) === $('r-marca').value ? { codigo: state.edicion.marca_codigo } : null);
    const numero = editando ? pad(state.edicion.correlativo) : '####';
    const items = itemsFormulario();
    let total = 0;
    let altos = 0;
    let codigoEdicion = '';
    let completoEdicion = false;

    items.forEach((el, i) => {
      const d = leerItem(el);
      const codigo = `${d.propiedad || '___'}-${d.estado || '__'}-${marca?.codigo || '___'}-${numero}`;
      el.querySelector('.rep-item-num').textContent = editando || items.length === 1 ? 'Repuesto' : `Repuesto ${i + 1}`;
      el.querySelector('[data-preview]').textContent = codigo;
      el.querySelector('[data-req-estado]').style.display = ['UR', 'REP'].includes(d.estado) ? '' : 'none';
      el.querySelector('[data-quitar]').style.display = editando || items.length === 1 ? 'none' : '';

      const costo = parseFloat(d.costo);
      if (costo > 0) total += costo;
      const alto = costo > state.cat.umbral;
      if (alto) altos++;
      el.querySelector('[data-alto]').innerHTML = alto ? badge('rep-alto', 'Alto valor') : '';
      el.querySelector('[data-ayuda]').textContent = alto
        ? `ALTO VALOR (más de ${fmtMoney(state.cat.umbral)}): toda salida exigirá Acta de Custodia firmada` : '';

      // Una tarjeta marcada con error se vuelve a revisar mientras la corrigen
      if (el.classList.contains('con-error')) {
        const faltan = faltantesItem(d);
        if (faltan.length) marcarErrorItem(el, `Falta: ${faltan.join(', ')}`);
        else marcarErrorItem(el, '');
      }

      if (i === 0) { codigoEdicion = codigo; completoEdicion = !!(d.propiedad && d.estado && marca); }
    });

    $('r-items-titulo').textContent = editando ? 'Repuesto' : `Repuestos de esta orden (${items.length})`;
    $('btn-agregar-item').style.display = editando ? 'none' : '';

    const preview = $('r-codigo-preview');
    const nota = $('r-codigo-nota');
    if (editando) {
      const cambia = completoEdicion && codigoEdicion !== state.edicion.codigo;
      preview.classList.remove('texto');
      preview.textContent = codigoEdicion;
      $('r-codigo-titulo').textContent = cambia ? 'Nuevo código' : 'Código';
      nota.innerHTML = cambia
        ? `<span style="color:#dc2626;font-weight:700">Cambia de ${escapeHtml(state.edicion.codigo)}: deberá reescribirlo en la pieza</span>`
        : 'El número global no cambia';
      $('btn-guardar').textContent = 'Guardar cambios';
    } else {
      const n = items.length;
      preview.classList.add('texto');
      preview.textContent = `${n} repuesto${n === 1 ? '' : 's'} · ${fmtMoney(total)}`;
      $('r-codigo-titulo').textContent = 'Por registrar';
      nota.textContent = (altos ? `${altos} de alto valor · ` : '') +
        (n === 1 ? 'El número global se asigna al guardar' : 'Los números se asignan al guardar, en el orden de la lista');
      $('btn-guardar').textContent = n === 1 ? 'Guardar repuesto' : `Guardar ${n} repuestos`;
    }
  }

  // La marca de la pieza en edición puede estar desactivada: se agrega al select para no perderla
  function asegurarMarcaEnSelect() {
    const p = state.edicion;
    if (!p || state.cat.marcas.some(m => m.id === p.marca_id)) return;
    const sel = $('r-marca');
    if (![...sel.options].some(o => o.value === String(p.marca_id))) {
      sel.insertAdjacentHTML('beforeend', `<option value="${p.marca_id}">${escapeHtml(p.marca)} (${escapeHtml(p.marca_codigo)}) — inactiva</option>`);
    }
  }

  async function prepararFormulario() {
    const p = state.edicion;
    $('tab-btn-registrar').textContent = p ? 'Editar repuesto' : 'Registrar ingreso';
    $('form-titulo').textContent = p ? `Editar ${p.codigo}` : 'Registrar ingreso de repuestos';
    $('grupo-motivo').style.display = p ? '' : 'none';
    $('r-revisado-ayuda').textContent = p ? 'Persona que revisó el estado de la pieza' : 'Persona que revisó el estado de las piezas (aplica a todos los repuestos del registro)';
    $('btn-limpiar-form').textContent = p ? 'Cancelar edición' : 'Limpiar';

    await cargarEmpleados();
    if (p && state.formEdicionId !== p.id) {
      llenarFormulario(p);
      state.formEdicionId = p.id;
    }
    actualizarPreview();
  }

  function llenarFormulario(p) {
    asegurarMarcaEnSelect();
    const set = (id, v) => { $(id).value = v ?? ''; };
    set('r-ot', p.orden_trabajo);
    set('r-localidad', p.localidad);
    set('r-placa', p.placa);
    set('r-marca', String(p.marca_id));
    set('r-modelo', p.modelo);
    set('r-cliente', p.cliente);
    set('r-proveedor', p.proveedor);
    set('r-motivo', '');
    reiniciarItems({
      detalle: p.detalle, codigo_auxiliar: p.codigo_auxiliar, categoria: p.categoria, propiedad: p.propiedad,
      estado: p.estado, detalle_estado: p.detalle_estado, costo: p.costo
    });
    $('r-ot-estado').textContent = '';

    // Revisado por: empleado de la lista, empleado ya inactivo o texto importado sin vincular
    const sel = $('r-revisado');
    sel.querySelectorAll('option[data-extra]').forEach(o => o.remove());
    if (p.revisado_por_id && !state.empleados.some(e => e.id === p.revisado_por_id)) {
      sel.insertAdjacentHTML('beforeend', `<option data-extra value="${p.revisado_por_id}">${escapeHtml(p.revisado_por)} (inactivo)</option>`);
    }
    if (!p.revisado_por_id && p.revisado_por) {
      sel.insertAdjacentHTML('afterbegin', `<option data-extra value="">${escapeHtml(p.revisado_por)} (sin vincular)</option>`);
    }
    sel.value = p.revisado_por_id ? String(p.revisado_por_id) : '';
  }

  function editarPieza(p) {
    Swal.close();
    state.edicion = p;
    state.formEdicionId = null;
    irATab('registrar');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelarEdicion() {
    if (!state.edicion) return;
    state.edicion = null;
    state.formEdicionId = null;
    $('r-revisado').querySelectorAll('option[data-extra]').forEach(o => o.remove());
    limpiarFormulario();
    prepararFormulario();
  }

  function limpiarFormulario() {
    ['r-ot', 'r-placa', 'r-marca', 'r-modelo', 'r-cliente', 'r-proveedor', 'r-revisado', 'r-motivo']
      .forEach(id => { $(id).value = ''; });
    $('r-localidad').value = state.localidad || state.cat.localidades[0];
    $('r-ot-estado').textContent = '';
    reiniciarItems();
    actualizarPreview();
    $('r-ot').focus();
  }

  // Datos comunes (origen y control) + un objeto por tarjeta de repuesto
  function leerFormulario() {
    return {
      orden_trabajo: $('r-ot').value.trim(),
      localidad: $('r-localidad').value,
      placa: $('r-placa').value.trim(),
      marca_id: $('r-marca').value,
      modelo: $('r-modelo').value.trim(),
      cliente: $('r-cliente').value.trim(),
      proveedor: $('r-proveedor').value.trim(),
      revisado_por_id: $('r-revisado').value || null,
      piezas: itemsFormulario().map(leerItem)
    };
  }

  // Devuelve las líneas de lo que falta (vacío si está completo) y marca las tarjetas incompletas
  function validarFormulario(d) {
    const lineas = [];
    const generales = [];
    if (!d.marca_id) generales.push('marca');
    if (!d.revisado_por_id && !state.edicion?.revisado_por) generales.push('revisado por');
    if (state.edicion && !$('r-motivo').value.trim()) generales.push('motivo de la edición');
    if (generales.length) lineas.push(`Complete: ${generales.join(', ')}.`);

    const els = itemsFormulario();
    d.piezas.forEach((p, i) => {
      const faltan = faltantesItem(p);
      marcarErrorItem(els[i], faltan.length ? `Falta: ${faltan.join(', ')}` : '');
      if (faltan.length) lineas.push(`${els.length === 1 ? 'Repuesto' : `Repuesto ${i + 1}`}: ${faltan.join(', ')}.`);
    });
    return lineas;
  }

  async function guardarPieza() {
    const datos = leerFormulario();
    const faltantes = validarFormulario(datos);
    if (faltantes.length) {
      $('r-items').querySelector('.rep-item.con-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      Swal.fire({ icon: 'warning', title: 'Faltan datos', html: faltantes.map(escapeHtml).join('<br>') });
      return;
    }

    const boton = $('btn-guardar');
    boton.disabled = true;
    try {
      if (state.edicion) await guardarEdicion(datos);
      else await guardarNueva(datos);
    } catch (err) {
      Swal.fire('Error', err.message || 'No se pudo guardar', 'error');
    } finally {
      boton.disabled = false;
    }
  }

  async function guardarNueva(datos) {
    const { ok, data } = await post('/repuestos/piezas', datos);
    if (!ok) {
      // Errores por repuesto: cada uno se muestra en su tarjeta
      if (Array.isArray(data.errores)) {
        const els = itemsFormulario();
        data.errores.forEach(e => {
          if (e && els[e.indice]) marcarErrorItem(els[e.indice], (e.errores || []).join(' · '));
        });
      }
      Swal.fire('No se pudo registrar', data.error || 'Error', 'error');
      return;
    }

    limpiarFormulario();
    refrescarListas();
    await mostrarCodigos(data.piezas || [data]);
    $('r-ot').focus();
  }

  // Varios repuestos: lista de códigos para escribir en cada pieza
  function mostrarCodigos(piezas) {
    if (piezas.length === 1) return mostrarCodigo(piezas[0]);
    const altos = piezas.filter(p => p.alto_valor).length;
    return Swal.fire({
      icon: 'success',
      title: `${piezas.length} repuestos registrados`,
      customClass: { popup: 'rep-pop-md' },
      html: `
        <div class="rep-modal">
          <p style="text-align:center;margin:0 0 10px;">Escriba cada código en su pieza:</p>
          <div class="rep-scroll">
            <table class="rep-mini-tabla">
              <thead><tr><th>#</th><th>Código</th><th>Repuesto</th><th></th></tr></thead>
              <tbody>${piezas.map((p, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td><span class="rep-codigo-md">${escapeHtml(p.codigo)}</span>${p.alto_valor ? `<span class="rep-sub">${badge('rep-alto', 'Alto valor')}</span>` : ''}</td>
                  <td>${escapeHtml(p.detalle)}${p.codigo_auxiliar ? `<span class="rep-sub">Aux: ${escapeHtml(p.codigo_auxiliar)}</span>` : ''}</td>
                  <td><button type="button" class="btn-obs" data-copiar="${escapeHtml(p.codigo)}">Copiar</button></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${altos ? `<div class="rep-banner-alto">${altos === 1 ? '1 repuesto es' : `${altos} repuestos son`} de ALTO VALOR: toda salida exigirá Acta de Custodia firmada.</div>` : ''}
          <div style="text-align:center;margin-top:10px;">
            <button type="button" class="btn-obs" id="btn-copiar-todos">Copiar todos los códigos</button>
          </div>
        </div>`,
      confirmButtonText: 'Listo',
      didOpen: (popup) => {
        popup.querySelectorAll('[data-copiar]').forEach(b => b.addEventListener('click', () => copiar(b.dataset.copiar)));
        $('btn-copiar-todos').onclick = () => copiar(
          piezas.map(p => `${p.codigo}\t${p.detalle}`).join('\n'), `${piezas.length} códigos copiados`);
      }
    });
  }

  function mostrarCodigo(pieza) {
    const [prop, est, marca, num] = pieza.codigo.split('-');
    return Swal.fire({
      icon: 'success',
      title: 'Repuesto registrado',
      customClass: { popup: 'rep-pop-md' },
      html: `
        <div class="rep-modal">
          <p style="text-align:center;margin:0 0 10px;">Escriba este código en la pieza:</p>
          <div class="rep-codigo-xl">${escapeHtml(pieza.codigo)}</div>
          <div class="rep-codigo-partes">
            <span><b>${escapeHtml(prop)}</b>${escapeHtml(etiqueta('propiedades', prop))}</span>
            <span><b>${escapeHtml(est)}</b>${escapeHtml(etiqueta('estados', est))}</span>
            <span><b>${escapeHtml(marca)}</b>marca</span>
            <span><b>${escapeHtml(num)}</b>número global</span>
          </div>
          ${pieza.codigo_auxiliar ? `<p class="rep-ayuda" style="text-align:center;margin-top:8px;">Código auxiliar: <b>${escapeHtml(pieza.codigo_auxiliar)}</b></p>` : ''}
          ${pieza.alto_valor ? '<div class="rep-banner-alto">Repuesto de ALTO VALOR: toda salida exigirá Acta de Custodia firmada.</div>' : ''}
          <div style="text-align:center;margin-top:10px;">
            <button type="button" class="btn-obs" id="btn-copiar-codigo">Copiar código</button>
          </div>
        </div>`,
      confirmButtonText: 'Listo',
      didOpen: () => { $('btn-copiar-codigo').onclick = () => copiar(pieza.codigo); }
    });
  }

  async function guardarEdicion(datos) {
    const p = state.edicion;
    const { piezas, ...comunes } = datos;
    const { ok, status, data } = await put(`/repuestos/piezas/${p.id}`, {
      ...comunes,
      ...piezas[0],
      motivo: $('r-motivo').value.trim(),
      version: p.version
    });
    if (!ok) {
      Swal.fire(status === 409 ? 'No se pudo guardar' : 'Error', data.error || 'No se pudo guardar', status === 409 ? 'warning' : 'error');
      return;
    }

    cancelarEdicion();
    irATab('inventario');
    refrescarListas();

    if (data.codigo_cambio) {
      await Swal.fire({
        icon: 'warning',
        title: '¡Reescriba el código en la pieza!',
        customClass: { popup: 'rep-pop-md' },
        html: `
          <div class="rep-modal">
            <p style="text-align:center;">Cambió la propiedad, el estado o la marca. El número global sigue siendo el mismo.</p>
            <div class="rep-cambio">
              <span class="viejo">${escapeHtml(data.codigo_cambio.anterior)}</span>
              <span>▼</span>
              <div class="rep-codigo-xl">${escapeHtml(data.codigo_cambio.nuevo)}</div>
            </div>
          </div>`,
        confirmButtonText: 'Entendido'
      });
    } else {
      toast('Cambios guardados');
    }
    verDetalle(p.id);
  }

  // =====================================================
  // IMPORTACIÓN DESDE EXCEL
  // =====================================================
  async function importarExcel() {
    const { value: validacion } = await Swal.fire({
      title: 'Importar repuestos desde Excel',
      customClass: { popup: 'rep-pop-md' },
      html: `
        <div class="rep-modal">
          <p>Use la plantilla del sistema o la plantilla de bodega. Columnas obligatorias: MARCA, DETALLE DEL REPUESTO,
             PROPIEDAD, ESTADO DEL REPUESTO, LOCALIDAD y COSTO.</p>
          <p><button type="button" class="rep-link" id="imp-plantilla">Descargar plantilla</button></p>
          <input type="file" id="imp-archivo" accept=".xlsx,.xls" class="swal2-file" style="width:100%;">
          <p class="rep-ayuda">Primero verá una vista previa con los errores de cada fila: nada se guarda hasta que confirme.</p>
        </div>`,
      showCancelButton: true,
      confirmButtonText: 'Revisar archivo',
      cancelButtonText: 'Cancelar',
      allowOutsideClick: () => !Swal.isLoading(),
      didOpen: () => { $('imp-plantilla').onclick = () => descargar('/repuestos/plantilla', 'plantilla-inventario-repuestos.xlsx'); },
      preConfirm: async () => {
        const archivo = $('imp-archivo').files[0];
        if (!archivo) return falta('Seleccione el archivo Excel');
        const fd = new FormData();
        fd.append('archivo', archivo);
        const r = await api('/repuestos/importar/validar', { method: 'POST', body: fd });
        if (!r.ok) return falta(r.data.error || 'No se pudo leer el archivo');
        return r.data;
      }
    });
    if (validacion) vistaPreviaImportacion(validacion);
  }

  async function vistaPreviaImportacion(v) {
    const filas = v.filas;
    const res = v.resumen;

    const htmlFilas = filas.map((f, i) => {
      const d = f.datos;
      const conError = f.errores.length > 0;
      return `
        <tr class="${conError ? 'con-error' : ''}">
          <td><input type="checkbox" class="imp-fila" data-i="${i}" ${conError ? 'disabled' : 'checked'}></td>
          <td>${f.fila_excel}</td>
          <td><b>${escapeHtml(f.codigo_patron || '—')}</b>${d.codigo_legacy ? `<span class="rep-sub">antes: ${escapeHtml(d.codigo_legacy)}</span>` : ''}</td>
          <td>${val(d.detalle)}<span class="rep-sub">${escapeHtml(etiqueta('categorias', d.categoria))}${d.codigo_auxiliar ? ` · Aux: ${escapeHtml(d.codigo_auxiliar)}` : ''}</span></td>
          <td>${val(d.marca_nombre)}<span class="rep-sub">${val(d.modelo)}</span></td>
          <td>${val(d.propiedad)} / ${val(d.estado)}</td>
          <td>${val(d.localidad)}</td>
          <td style="text-align:right;">${d.costo !== null && d.costo !== undefined ? fmtMoney(d.costo) : '—'}</td>
          <td>${f.errores.map(e => `<span class="rep-msg-err">✘ ${escapeHtml(e)}</span>`).join('')}${f.advertencias.map(a => `<span class="rep-msg-adv">⚠ ${escapeHtml(a)}</span>`).join('')}</td>
        </tr>`;
    }).join('');

    const textoBoton = (n) => `Importar ${n} repuesto${n === 1 ? '' : 's'}`;

    const { value: resultado } = await Swal.fire({
      title: 'Vista previa de la importación',
      customClass: { popup: 'rep-pop-lg' },
      html: `
        <div class="rep-modal">
          <p class="rep-modal-sub">${escapeHtml(v.archivo_nombre)} · hoja ${escapeHtml(v.hoja)}</p>
          <div class="rep-resumen-import">
            ${badge('sit-SALIDA', `${res.total} filas`)}
            ${badge('sit-DISPONIBLE', `${res.validas} válidas`)}
            ${res.con_error ? badge('sit-ANULADO', `${res.con_error} con error`) : ''}
            ${res.con_advertencia ? badge('sit-RESERVADO', `${res.con_advertencia} con advertencias`) : ''}
          </div>
          ${v.marcas_desconocidas.length ? `<div class="rep-banner-aviso">Marcas que no están en el catálogo: <b>${escapeHtml(v.marcas_desconocidas.join(', '))}</b>. Agréguelas en Configuración y vuelva a revisar el archivo.</div>` : ''}
          <div class="rep-scroll">
            <table class="rep-mini-tabla">
              <thead><tr>
                <th><input type="checkbox" id="imp-todas" ${res.validas ? 'checked' : 'disabled'} title="Seleccionar todas"></th>
                <th>Fila</th><th>Código</th><th>Detalle</th><th>Marca / Modelo</th><th>Prop. / Estado</th>
                <th>Localidad</th><th>Costo</th><th>Observaciones</th>
              </tr></thead>
              <tbody>${htmlFilas}</tbody>
            </table>
          </div>
          <p class="rep-ayuda">Desmarque las filas que no quiere importar (por ejemplo, filas de ejemplo). Las filas con error no se pueden importar.</p>
        </div>`,
      showCancelButton: true,
      confirmButtonText: textoBoton(res.validas),
      cancelButtonText: 'Cancelar',
      allowOutsideClick: () => !Swal.isLoading(),
      didOpen: () => {
        const actualizar = () => {
          const n = document.querySelectorAll('.imp-fila:checked').length;
          Swal.getConfirmButton().textContent = textoBoton(n);
          Swal.getConfirmButton().disabled = n === 0;
        };
        document.querySelectorAll('.imp-fila').forEach(ch => ch.addEventListener('change', actualizar));
        $('imp-todas').addEventListener('change', () => {
          document.querySelectorAll('.imp-fila:not(:disabled)').forEach(ch => { ch.checked = $('imp-todas').checked; });
          actualizar();
        });
        actualizar();
      },
      preConfirm: async () => {
        const seleccion = [...document.querySelectorAll('.imp-fila:checked')].map(ch => {
          const f = filas[Number(ch.dataset.i)];
          return { fila_excel: f.fila_excel, datos: f.datos };
        });
        if (!seleccion.length) return falta('No hay filas seleccionadas');
        const r = await post('/repuestos/importar', { filas: seleccion, archivo_nombre: v.archivo_nombre });
        if (!r.ok) return falta(r.data.error || 'No se pudo importar');
        return r.data;
      }
    });
    if (!resultado) return;

    refrescarListas();
    await Swal.fire({
      icon: 'success',
      title: `${resultado.creados.length} repuesto${resultado.creados.length === 1 ? '' : 's'} importado${resultado.creados.length === 1 ? '' : 's'}`,
      customClass: { popup: 'rep-pop-md' },
      html: `
        <div class="rep-modal">
          <p style="text-align:center;">Escriba en cada pieza su código:</p>
          <div class="rep-scroll">
            <table class="rep-mini-tabla">
              <thead><tr><th>Fila</th><th>Código</th><th>Detalle</th><th>Localidad</th></tr></thead>
              <tbody>${resultado.creados.map(c => `
                <tr><td>${c.fila_excel ?? ''}</td><td><b class="rep-codigo">${escapeHtml(c.codigo)}</b></td>
                    <td>${escapeHtml(c.detalle)}</td><td>${val(c.localidad)}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div style="text-align:center;margin-top:12px;">
            <button type="button" class="btn-obs" id="imp-exportar">Exportar lista de códigos (Excel)</button>
          </div>
        </div>`,
      confirmButtonText: 'Listo',
      didOpen: () => {
        $('imp-exportar').onclick = () => descargar(
          `/repuestos/exportar?importacion_id=${resultado.importacion_id}&situacion=TODAS`,
          `codigos-importacion-${resultado.importacion_id}.xlsx`);
      }
    });
  }

  // =====================================================
  // SALIDAS (historial)
  // =====================================================
  function initSalidas() {
    const recargar = () => { state.sal.page = 1; cargarSalidas(); };
    ['s-motivo', 's-localidad', 's-desde', 's-hasta', 's-anuladas'].forEach(id => $(id).addEventListener('change', recargar));
    $('s-q').addEventListener('input', debounce(recargar, 400));
    $('sal-prev').onclick = () => { if (state.sal.page > 1) { state.sal.page--; cargarSalidas(); } };
    $('sal-next').onclick = () => { if (state.sal.page < totalPaginas(state.sal)) { state.sal.page++; cargarSalidas(); } };

    $('tabla-salidas').addEventListener('click', (e) => {
      const acta = e.target.closest('[data-acta]');
      if (acta) { reimprimirActa(Number(acta.dataset.acta)); return; }
      const fila = e.target.closest('tr[data-pieza]');
      if (fila) verDetalle(Number(fila.dataset.pieza));
    });
  }

  async function cargarSalidas() {
    const tbody = $('tabla-salidas');
    tbody.innerHTML = '<tr><td colspan="9" class="empty-cell">Cargando...</td></tr>';
    const p = new URLSearchParams({ page: state.sal.page, pageSize: state.sal.pageSize });
    const campos = { q: 's-q', motivo: 's-motivo', localidad: 's-localidad', desde: 's-desde', hasta: 's-hasta' };
    for (const [k, id] of Object.entries(campos)) {
      const v = $(id).value.trim();
      if (v) p.set(k, v);
    }
    if ($('s-anuladas').checked) p.set('incluir_anuladas', '1');

    try {
      const { ok, data } = await api(`/repuestos/salidas?${p}`);
      if (!ok) throw new Error(data.error);
      state.sal.total = data.total;
      $('contador-salidas').textContent = `${data.total} salida${data.total === 1 ? '' : 's'}`;
      renderPaginacion('sal', state.sal);
      if (!data.items.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-cell">No hay salidas con estos filtros</td></tr>';
        return;
      }
      tbody.innerHTML = data.items.map(s => `
        <tr class="rep-fila${s.anulado ? ' rep-anulada' : ''}" data-pieza="${s.pieza_id}">
          <td>${escapeHtml(s.fecha)}</td>
          <td><span class="rep-codigo">${escapeHtml(s.codigo)}</span>${s.codigo_auxiliar ? `<span class="rep-sub">Aux: ${escapeHtml(s.codigo_auxiliar)}</span>` : ''}</td>
          <td class="rep-detalle-cel" title="${escapeHtml(s.detalle)}">${escapeHtml(s.detalle)}<span class="rep-sub">${escapeHtml(s.marca)} ${val(s.modelo)}</span></td>
          <td>${escapeHtml(etiqueta('motivos', s.motivo))}${s.anulado ? ' ' + badge('sit-ANULADO', 'Anulada') : ''}</td>
          <td>${s.orden_trabajo ? 'OT ' + escapeHtml(s.orden_trabajo) : '—'}</td>
          <td>${val(s.entregado_a)}</td>
          <td class="num-right">${s.precio_venta !== null && s.precio_venta !== undefined ? fmtMoney(s.precio_venta) : '—'}</td>
          <td>${s.acta_numero
            ? `N° ${pad(s.acta_numero)}${s.acta_anulada ? ' (anulada)' : ''}${state.puedeVerActas ? ` <button type="button" class="btn-obs" data-acta="${s.acta_id}">PDF</button>` : ''}`
            : '—'}</td>
          <td>${escapeHtml(s.usuario)}</td>
        </tr>`).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-cell">Error cargando salidas${err.message ? ': ' + escapeHtml(err.message) : ''}</td></tr>`;
    }
  }

  // =====================================================
  // CONFIGURACIÓN (umbral y marcas)
  // =====================================================
  let marcasConfig = [];

  function initConfiguracion() {
    if (!state.puedeRegistrar) return;
    if (!state.esAdmin) {
      $('cfg-umbral').disabled = true;
      $('btn-guardar-umbral').style.display = 'none';
      $('cfg-umbral-nota').textContent = 'Toda salida de un repuesto cuyo costo supere este valor exige el Acta de Custodia. Solo un administrador puede cambiarlo.';
    }
    $('btn-guardar-umbral').onclick = guardarUmbral;

    let codigoEditado = false;
    $('cfg-marca-nombre').addEventListener('input', () => {
      if (!codigoEditado) $('cfg-marca-codigo').value = sugerirCodigo($('cfg-marca-nombre').value);
    });
    $('cfg-marca-codigo').addEventListener('input', () => { codigoEditado = true; soloLetras($('cfg-marca-codigo')); });
    $('btn-agregar-marca').onclick = async () => {
      const nombre = $('cfg-marca-nombre').value.trim();
      const codigo = $('cfg-marca-codigo').value.trim();
      if (!nombre || codigo.length !== 3) { Swal.fire('Faltan datos', 'Escriba el nombre y un código de 3 letras', 'warning'); return; }
      const r = await post('/repuestos/marcas', { nombre, codigo });
      if (!r.ok) { Swal.fire('No se pudo agregar', r.data.error || 'Error', 'error'); return; }
      $('cfg-marca-nombre').value = '';
      $('cfg-marca-codigo').value = '';
      codigoEditado = false;
      toast(`Marca ${r.data.nombre} (${r.data.codigo}) agregada`);
      await refrescarMarcas();
      cargarConfiguracion();
    };

    $('tabla-marcas').addEventListener('click', (e) => {
      const b = e.target.closest('[data-editar-marca]');
      if (b) editarMarca(Number(b.dataset.editarMarca));
    });
  }

  async function cargarConfiguracion() {
    $('cfg-umbral').value = state.cat.umbral;
    const tbody = $('tabla-marcas');
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Cargando...</td></tr>';
    const { ok, data } = await api('/repuestos/marcas');
    if (!ok) { tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">${escapeHtml(data.error || 'Error cargando marcas')}</td></tr>`; return; }
    marcasConfig = data;
    tbody.innerHTML = data.map(m => `
      <tr>
        <td>${escapeHtml(m.nombre)}</td>
        <td><span class="rep-codigo">${escapeHtml(m.codigo)}</span></td>
        <td class="num-right">${m.usos}</td>
        <td>${m.activa ? badge('sit-DISPONIBLE', 'Activa') : badge('sit-ANULADO', 'Inactiva')}</td>
        <td>${state.esAdmin ? `<button type="button" class="btn-obs" data-editar-marca="${m.id}">Editar</button>` : ''}</td>
      </tr>`).join('');
  }

  async function guardarUmbral() {
    const valor = $('cfg-umbral').value;
    if (valor === '' || Number(valor) < 0) { Swal.fire('Valor inválido', 'Ingrese un número mayor o igual a 0', 'warning'); return; }
    const { ok, data } = await put('/repuestos/configuracion', { umbral_alto_valor: valor });
    if (!ok) { Swal.fire('Error', data.error || 'No se pudo guardar', 'error'); return; }
    state.cat.umbral = data.umbral;
    actualizarEtiquetaUmbral();
    refrescarListas();
    toast(`Umbral de Alto Valor: ${fmtMoney(data.umbral)}`);
  }

  async function editarMarca(id) {
    const m = marcasConfig.find(x => x.id === id);
    if (!m) return;
    const { value: ok } = await Swal.fire({
      title: `Editar marca ${m.nombre}`,
      customClass: { popup: 'rep-pop-md' },
      html: `
        <div class="rep-modal">
          <div class="rep-campo">
            <label for="em-nombre">Nombre</label>
            <input id="em-nombre" class="swal2-input" maxlength="60" value="${escapeHtml(m.nombre)}">
          </div>
          <div class="rep-campo">
            <label for="em-codigo">Código</label>
            <input id="em-codigo" class="swal2-input" maxlength="3" value="${escapeHtml(m.codigo)}" ${m.usos ? 'disabled' : ''}>
            ${m.usos ? `<span class="rep-ayuda">No se puede cambiar: hay ${m.usos} repuesto(s) con este código.</span>` : ''}
          </div>
          <label class="rep-check"><input type="checkbox" id="em-activa" ${m.activa ? 'checked' : ''}> Activa (aparece en los formularios)</label>
        </div>`,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      allowOutsideClick: () => !Swal.isLoading(),
      didOpen: () => $('em-codigo').addEventListener('input', () => soloLetras($('em-codigo'))),
      preConfirm: async () => {
        const body = { nombre: $('em-nombre').value.trim(), activa: $('em-activa').checked };
        if (!m.usos) body.codigo = $('em-codigo').value.trim();
        const r = await put(`/repuestos/marcas/${m.id}`, body);
        if (!r.ok) return falta(r.data.error || 'No se pudo guardar');
        return true;
      }
    });
    if (ok) {
      toast('Marca actualizada');
      await refrescarMarcas();
      cargarConfiguracion();
    }
  }

  // Lo usa la campanita de nav.js para abrir la pieza de una notificación
  window.REP = { verDetalle };
})();
