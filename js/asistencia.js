// js/asistencia.js
let paginaActual = 1;
const LIMITE = 50;
let totalRegistros = 0;

const TIPO_BADGE = {
  'entrada':          `<span style="color:#16a34a;font-weight:600;">↑ Entrada</span>`,
  'salida':           `<span style="color:#dc2626;font-weight:600;">↓ Salida</span>`,
  'salida_almuerzo':  `<span style="color:#d97706;font-weight:600;">🍽 Salida almuerzo</span>`,
  'regreso_almuerzo': `<span style="color:#2563eb;font-weight:600;">↩ Regreso almuerzo</span>`,
};

const ESTADO_BADGE = {
  'puntual':     `<span class="badge-estado badge-puntual">Puntual</span>`,
  'tolerancia':  `<span class="badge-estado badge-tolerancia">Tolerancia</span>`,
  'atraso':      `<span class="badge-estado badge-atraso">Atraso</span>`,
  'temprana':    `<span class="badge-estado badge-temprana">Temprana</span>`,
  'tardia':      `<span class="badge-estado badge-tardia">Tardía</span>`,
  'auto':        `<span class="badge-estado badge-auto">Auto</span>`,
};

// =========================================================
// Init
// =========================================================
document.addEventListener('DOMContentLoaded', async () => {
  if (!getToken()) { redirectLogin(); return; }

  const res = await apiFetch('/auth/me');
  if (!res || !res.ok) { redirectLogin(); return; }

  const data = await safeJson(res);
  if (!['admin', 'asesor', 'control'].includes(data.rol)) {
    window.location.href = 'inventario.html';
    return;
  }

  const esAdmin = data.rol === 'admin';

  if (!esAdmin) {
    document.getElementById('btn-config').style.display = 'none';
  }

  document.getElementById('fecha-hasta').value = new Date().toISOString().split('T')[0];

  await cargarFiltroEmpleados();
  await cargarRegistros();
  bindFiltros();
  bindPaginacion();
  bindModalFoto();
  if (esAdmin) bindModalConfig();
  bindExportar();
});

// =========================================================
// Dropdown empleados
// =========================================================
async function cargarFiltroEmpleados() {
  const res = await apiFetch('/asistencia/empleados');
  if (!res || !res.ok) return;

  const empleados = await safeJson(res);
  const select = document.getElementById('filtro-empleado');
  empleados.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = `${e.nombre} ${e.apellido}`;
    select.appendChild(opt);
  });
}

// =========================================================
// Cargar registros
// =========================================================
async function cargarRegistros() {
  const params = construirParams();
  params.append('page', paginaActual);
  params.append('limit', LIMITE);

  const res = await apiFetch(`/asistencia/registros?${params.toString()}`);
  if (!res || !res.ok) {
    Swal.fire('Error', 'No se pudieron cargar los registros.', 'error');
    return;
  }

  const data = await safeJson(res);
  totalRegistros = data.total || 0;
  renderTabla(data.registros || []);
  actualizarPaginacion();
}

function construirParams() {
  const params = new URLSearchParams();
  const desde     = document.getElementById('fecha-desde').value;
  const hasta     = document.getElementById('fecha-hasta').value;
  const empleado  = document.getElementById('filtro-empleado').value;
  const tipo      = document.getElementById('filtro-tipo').value;
  const estado    = document.getElementById('filtro-estado').value;
  const localidad = document.getElementById('filtro-localidad').value;

  if (desde)     params.append('desde', desde);
  if (hasta)     params.append('hasta', hasta);
  if (empleado)  params.append('empleado_id', empleado);
  if (tipo)      params.append('tipo', tipo);
  if (estado)    params.append('estado', estado);
  if (localidad) params.append('localidad', localidad);

  return params;
}

// =========================================================
// Tabla
// =========================================================
function renderTabla(registros) {
  const tbody = document.getElementById('tabla-asistencia');

  if (!registros.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-light);padding:24px;">
      Sin registros para los filtros seleccionados</td></tr>`;
    return;
  }

  tbody.innerHTML = registros.map(r => {
    const fecha = new Date(r.creado_en).toLocaleString('es-EC', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    const badge   = TIPO_BADGE[r.tipo] || `<span>${r.tipo}</span>`;
    const estadoBadge = r.estado ? (ESTADO_BADGE[r.estado] || `<span>${r.estado}</span>`) : '<span style="color:var(--text-light);">—</span>';
    const fotoCol = r.tiene_foto
      ? `<button data-id="${r.id}" class="btn-ver-foto"
           style="background:var(--primary);color:#fff;border:none;border-radius:6px;
                  padding:4px 10px;cursor:pointer;font-size:13px;">📷 Ver</button>`
      : `<span style="color:var(--text-light);font-size:12px;">Sin foto</span>`;

    return `
      <tr>
        <td>${r.id}</td>
        <td>${r.nombre}</td>
        <td>${r.localidad || '—'}</td>
        <td>${badge}</td>
        <td>${estadoBadge}</td>
        <td>${fecha}</td>
        <td>${fotoCol}</td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.btn-ver-foto').forEach(btn => {
    btn.addEventListener('click', () => abrirFoto(btn.dataset.id, btn));
  });
}

// =========================================================
// Paginación
// =========================================================
function actualizarPaginacion() {
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / LIMITE));
  document.getElementById('page-info').textContent =
    `Página ${paginaActual} de ${totalPaginas} (${totalRegistros} registros)`;
  document.getElementById('btn-prev').disabled = paginaActual <= 1;
  document.getElementById('btn-next').disabled = paginaActual >= totalPaginas;
}

function bindPaginacion() {
  document.getElementById('btn-prev').addEventListener('click', () => {
    if (paginaActual > 1) { paginaActual--; cargarRegistros(); }
  });
  document.getElementById('btn-next').addEventListener('click', () => {
    if (paginaActual < Math.ceil(totalRegistros / LIMITE)) { paginaActual++; cargarRegistros(); }
  });
}

function bindFiltros() {
  ['filtro-empleado','filtro-tipo','filtro-estado','filtro-localidad','fecha-desde','fecha-hasta'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      paginaActual = 1;
      cargarRegistros();
    });
  });
}

// =========================================================
// Modal foto
// =========================================================
function bindModalFoto() {
  const modal = document.getElementById('modal-foto-asistencia');
  document.getElementById('btn-cerrar-modal').addEventListener('click', cerrarModalFoto);
  modal.addEventListener('click', e => { if (e.target === modal) cerrarModalFoto(); });
}

async function abrirFoto(id, btn) {
  const modal    = document.getElementById('modal-foto-asistencia');
  const imgModal = document.getElementById('foto-modal-img');

  imgModal.src = '';
  modal.style.display = 'flex';

  if (btn.dataset.blobUrl) {
    imgModal.src = btn.dataset.blobUrl;
    return;
  }

  try {
    const res = await apiFetch(`/asistencia/foto/${id}`);
    if (!res || !res.ok) {
      Swal.fire('Error', 'No se pudo cargar la foto.', 'error');
      modal.style.display = 'none';
      return;
    }
    const blob      = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    btn.dataset.blobUrl = objectUrl;
    imgModal.src        = objectUrl;
  } catch {
    Swal.fire('Error', 'No se pudo cargar la foto.', 'error');
    modal.style.display = 'none';
  }
}

function cerrarModalFoto() {
  document.getElementById('modal-foto-asistencia').style.display = 'none';
  document.getElementById('foto-modal-img').src = '';
}

// =========================================================
// Modal Configuración de horarios
// =========================================================
function bindModalConfig() {
  document.getElementById('btn-config').addEventListener('click', abrirModalConfig);
  document.getElementById('btn-cerrar-config').addEventListener('click', cerrarModalConfig);
  document.getElementById('btn-guardar-config').addEventListener('click', guardarConfig);

  document.getElementById('modal-config').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-config')) cerrarModalConfig();
  });

  ['matriz', 'sucursal'].forEach(loc => {
    document.getElementById(`cfg-${loc}-activo`).addEventListener('change', e => {
      toggleHorarios(loc, e.target.checked);
    });
  });
}

function toggleHorarios(loc, activo) {
  const row  = document.getElementById(`cfg-${loc}-horarios`);
  const hint = document.getElementById(`hint-${loc}`);
  if (activo) {
    row.classList.remove('disabled');
    hint.style.display = 'none';
  } else {
    row.classList.add('disabled');
    hint.style.display = 'block';
  }
}

async function abrirModalConfig() {
  const modal = document.getElementById('modal-config');
  modal.style.display = 'flex';

  const res = await apiFetch('/asistencia/configuracion');
  if (!res || !res.ok) {
    Swal.fire('Error', 'No se pudo cargar la configuración.', 'error');
    return;
  }

  const configs = await safeJson(res);
  configs.forEach(cfg => {
    const loc = cfg.localidad.toLowerCase();

    const el = (id) => document.getElementById(`cfg-${loc}-${id}`);

    if (el('hora-entrada'))   el('hora-entrada').value   = cfg.hora_entrada   || '08:00';
    if (el('tol-entrada'))    el('tol-entrada').value     = cfg.tolerancia_entrada ?? 10;
    if (el('hora-salida'))    el('hora-salida').value     = cfg.hora_salida    || '17:30';
    if (el('tol-salida'))     el('tol-salida').value      = cfg.tolerancia_salida ?? 30;
    if (el('inicio'))         el('inicio').value          = cfg.almuerzo_inicio || '12:30';
    if (el('fin'))            el('fin').value             = cfg.almuerzo_fin    || '14:30';
    if (el('dur-almuerzo'))   el('dur-almuerzo').value    = cfg.duracion_almuerzo ?? 60;
    if (el('tol-almuerzo'))   el('tol-almuerzo').value    = cfg.tolerancia_almuerzo ?? 10;

    const elActivo = el('activo');
    if (elActivo) {
      elActivo.checked = cfg.almuerzo_activo;
      toggleHorarios(loc, cfg.almuerzo_activo);
    }
  });
}

function cerrarModalConfig() {
  document.getElementById('modal-config').style.display = 'none';
}

async function guardarConfig() {
  const localidades = ['matriz', 'sucursal'].map(loc => {
    const el = (id) => document.getElementById(`cfg-${loc}-${id}`);
    return {
      key:                 loc.toUpperCase(),
      hora_entrada:        el('hora-entrada').value,
      tolerancia_entrada:  Number(el('tol-entrada').value) || 10,
      hora_salida:         el('hora-salida').value,
      tolerancia_salida:   Number(el('tol-salida').value) || 30,
      almuerzo_inicio:     el('inicio').value,
      almuerzo_fin:        el('fin').value,
      almuerzo_activo:     el('activo').checked,
      duracion_almuerzo:   Number(el('dur-almuerzo').value) || 60,
      tolerancia_almuerzo: Number(el('tol-almuerzo').value) || 10,
    };
  });

  for (const loc of localidades) {
    if (!loc.hora_entrada || !loc.hora_salida) {
      Swal.fire('Atención', `Completa los horarios de jornada de ${loc.key}.`, 'warning');
      return;
    }
    if (loc.hora_entrada >= loc.hora_salida) {
      Swal.fire('Atención', `En ${loc.key}: la hora de entrada debe ser menor a la de salida.`, 'warning');
      return;
    }
    if (loc.almuerzo_activo) {
      if (!loc.almuerzo_inicio || !loc.almuerzo_fin) {
        Swal.fire('Atención', `Completa los horarios de almuerzo de ${loc.key}.`, 'warning');
        return;
      }
      if (loc.almuerzo_inicio >= loc.almuerzo_fin) {
        Swal.fire('Atención', `En ${loc.key}: la ventana de almuerzo inicio debe ser menor al fin.`, 'warning');
        return;
      }
    }
  }

  const btn = document.getElementById('btn-guardar-config');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    const resultados = await Promise.all(
      localidades.map(loc =>
        apiFetch(`/asistencia/configuracion/${loc.key}`, {
          method: 'PUT',
          body: JSON.stringify({
            almuerzo_inicio:     loc.almuerzo_inicio,
            almuerzo_fin:        loc.almuerzo_fin,
            almuerzo_activo:     loc.almuerzo_activo,
            hora_entrada:        loc.hora_entrada,
            tolerancia_entrada:  loc.tolerancia_entrada,
            hora_salida:         loc.hora_salida,
            tolerancia_salida:   loc.tolerancia_salida,
            duracion_almuerzo:   loc.duracion_almuerzo,
            tolerancia_almuerzo: loc.tolerancia_almuerzo,
          })
        })
      )
    );

    const hayError = resultados.some(r => !r || !r.ok);
    if (hayError) throw new Error('Error al guardar');

    Swal.fire({ icon: 'success', title: 'Guardado', text: 'Configuración actualizada correctamente.', timer: 2000, showConfirmButton: false });
    cerrarModalConfig();

  } catch {
    Swal.fire('Error', 'No se pudo guardar la configuración.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar cambios';
  }
}

// =========================================================
// Exportar Excel
// =========================================================
function bindExportar() {
  document.getElementById('btn-exportar').addEventListener('click', exportarExcel);
}

async function exportarExcel() {
  const params = construirParams();
  const btn = document.getElementById('btn-exportar');
  btn.disabled = true;
  btn.textContent = 'Generando...';

  try {
    const res = await apiFetch(`/asistencia/reporte?${params.toString()}`);
    if (!res || !res.ok) {
      Swal.fire('Error', 'No se pudo generar el reporte.', 'error');
      return;
    }

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `Asistencia_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    Swal.fire('Error', 'No se pudo generar el reporte.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '📥 Excel';
  }
}
