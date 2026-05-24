// js/asistencia.js
let paginaActual = 1;
const LIMITE = 50;
let totalRegistros = 0;

// =========================================================
// Mapa de tipos → badge visual
// =========================================================
const TIPO_BADGE = {
  'entrada':          `<span style="color:#16a34a;font-weight:600;">↑ Entrada</span>`,
  'salida':           `<span style="color:#dc2626;font-weight:600;">↓ Salida</span>`,
  'salida_almuerzo':  `<span style="color:#d97706;font-weight:600;">🍽 Salida almuerzo</span>`,
  'regreso_almuerzo': `<span style="color:#2563eb;font-weight:600;">↩ Regreso almuerzo</span>`,
};

// =========================================================
// Init
// =========================================================
document.addEventListener('DOMContentLoaded', async () => {
  if (!getToken()) { redirectLogin(); return; }

  const res = await apiFetch('/auth/me');
  if (!res || !res.ok) { redirectLogin(); return; }

  const data = await safeJson(res);
  if (data.rol !== 'admin') {
    window.location.href = 'dashboard.html';
    return;
  }

  document.getElementById('fecha-hasta').value = new Date().toISOString().split('T')[0];

  await cargarFiltroEmpleados();
  await cargarRegistros();
  bindFiltros();
  bindPaginacion();
  bindModalFoto();
  bindModalConfig();
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
  const localidad = document.getElementById('filtro-localidad').value;

  if (desde)     params.append('desde', desde);
  if (hasta)     params.append('hasta', hasta);
  if (empleado)  params.append('empleado_id', empleado);
  if (tipo)      params.append('tipo', tipo);
  if (localidad) params.append('localidad', localidad);

  return params;
}

// =========================================================
// Tabla
// =========================================================
function renderTabla(registros) {
  const tbody = document.getElementById('tabla-asistencia');

  if (!registros.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-light);padding:24px;">
      Sin registros para los filtros seleccionados</td></tr>`;
    return;
  }

  tbody.innerHTML = registros.map(r => {
    const fecha = new Date(r.creado_en).toLocaleString('es-EC', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    const badge   = TIPO_BADGE[r.tipo] || `<span>${r.tipo}</span>`;
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
  ['filtro-empleado','filtro-tipo','filtro-localidad','fecha-desde','fecha-hasta'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      paginaActual = 1;
      cargarRegistros();
    });
  });
}

// =========================================================
// Modal foto — proxy seguro con caché por sesión
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

  // Caché en el botón para no re-descargar
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
    const elInicio = document.getElementById(`cfg-${loc}-inicio`);
    const elFin    = document.getElementById(`cfg-${loc}-fin`);
    if (elInicio) elInicio.value = cfg.almuerzo_inicio;
    if (elFin)    elFin.value    = cfg.almuerzo_fin;
  });
}

function cerrarModalConfig() {
  document.getElementById('modal-config').style.display = 'none';
}

async function guardarConfig() {
  const localidades = [
    { key: 'MATRIZ',   inicio: document.getElementById('cfg-matriz-inicio').value,   fin: document.getElementById('cfg-matriz-fin').value },
    { key: 'SUCURSAL', inicio: document.getElementById('cfg-sucursal-inicio').value, fin: document.getElementById('cfg-sucursal-fin').value },
  ];

  // Validar que todos tengan valores
  for (const loc of localidades) {
    if (!loc.inicio || !loc.fin) {
      Swal.fire('Atención', `Completa los horarios de ${loc.key}.`, 'warning');
      return;
    }
    if (loc.inicio >= loc.fin) {
      Swal.fire('Atención', `En ${loc.key}: la hora de inicio debe ser menor a la de fin.`, 'warning');
      return;
    }
  }

  const btn = document.getElementById('btn-guardar-config');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    // Guardar ambas localidades en paralelo
    const resultados = await Promise.all(
      localidades.map(loc =>
        apiFetch(`/asistencia/configuracion/${loc.key}`, {
          method: 'PUT',
          body: JSON.stringify({ almuerzo_inicio: loc.inicio, almuerzo_fin: loc.fin })
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
