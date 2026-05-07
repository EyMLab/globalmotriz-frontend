// js/asistencia.js
let paginaActual = 1;
const LIMITE = 50;
let totalRegistros = 0;

// Cache de objectURLs para revocar cuando se cierre el modal
let urlFotoActual = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!getToken()) { redirectLogin(); return; }

  const res = await apiFetch('/auth/me');
  if (!res || !res.ok) { redirectLogin(); return; }

  const data = await safeJson(res);
  if (data.rol !== 'admin') {
    window.location.href = 'dashboard.html';
    return;
  }

  // Fecha de hoy como valor por defecto en "hasta"
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('fecha-hasta').value = hoy;

  await cargarFiltroEmpleados();
  await cargarRegistros();
  bindFiltros();
  bindPaginacion();
  bindModal();
});

// =========================================================
// Cargar dropdown de empleados
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
// Cargar registros con filtros
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
  const desde    = document.getElementById('fecha-desde').value;
  const hasta    = document.getElementById('fecha-hasta').value;
  const empleado = document.getElementById('filtro-empleado').value;
  const tipo     = document.getElementById('filtro-tipo').value;
  const localidad = document.getElementById('filtro-localidad').value;

  if (desde)     params.append('desde', desde);
  if (hasta)     params.append('hasta', hasta);
  if (empleado)  params.append('empleado_id', empleado);
  if (tipo)      params.append('tipo', tipo);
  if (localidad) params.append('localidad', localidad);

  return params;
}

// =========================================================
// Renderizar tabla
// =========================================================
function renderTabla(registros) {
  const tbody = document.getElementById('tabla-asistencia');

  if (!registros.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-light);">Sin registros para los filtros seleccionados</td></tr>';
    return;
  }

  tbody.innerHTML = registros.map(r => {
    const fecha = new Date(r.creado_en).toLocaleString('es-EC', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    const tipoBadge = r.tipo === 'entrada'
      ? `<span style="color:#16a34a;font-weight:600;">&#8593; Entrada</span>`
      : `<span style="color:#dc2626;font-weight:600;">&#8595; Salida</span>`;

    const fotoCol = r.tiene_foto
      ? `<img src="img/foto-placeholder.png"
              data-id="${r.id}"
              class="thumb-asistencia"
              style="width:44px;height:44px;object-fit:cover;border-radius:6px;cursor:pointer;border:1px solid #e2e8f0;"
              title="Ver foto"
              alt="Foto">`
      : `<span style="color:var(--text-light);font-size:12px;">Sin foto</span>`;

    return `
      <tr>
        <td>${r.id}</td>
        <td>${r.nombre}</td>
        <td>${r.localidad || '—'}</td>
        <td>${tipoBadge}</td>
        <td>${fecha}</td>
        <td>${fotoCol}</td>
      </tr>
    `;
  }).join('');

  // Bind de clics en thumbnails — carga la foto via fetch protegido
  tbody.querySelectorAll('.thumb-asistencia').forEach(img => {
    img.addEventListener('click', () => abrirFoto(img.dataset.id, img));
  });
}

// =========================================================
// Foto: cargar via proxy seguro y mostrar en modal
// =========================================================
async function abrirFoto(id, thumbEl) {
  const modal = document.getElementById('modal-foto-asistencia');
  const imgModal = document.getElementById('foto-modal-img');

  imgModal.src = '';
  modal.style.display = 'flex';

  // Si el thumb ya tiene la URL cacheada, reusar
  if (thumbEl.dataset.blobUrl) {
    imgModal.src = thumbEl.dataset.blobUrl;
    return;
  }

  try {
    const res = await apiFetch(`/asistencia/foto/${id}`);
    if (!res || !res.ok) {
      Swal.fire('Error', 'No se pudo cargar la foto.', 'error');
      modal.style.display = 'none';
      return;
    }

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    // Guardar en el thumbnail para no volver a descargar
    thumbEl.dataset.blobUrl = objectUrl;
    thumbEl.src = objectUrl;

    // Mostrar en modal
    imgModal.src = objectUrl;
    urlFotoActual = objectUrl;

  } catch (err) {
    Swal.fire('Error', 'No se pudo cargar la foto.', 'error');
    modal.style.display = 'none';
  }
}

// =========================================================
// Paginación
// =========================================================
function actualizarPaginacion() {
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / LIMITE));
  document.getElementById('page-info').textContent = `Página ${paginaActual} de ${totalPaginas} (${totalRegistros} registros)`;
  document.getElementById('btn-prev').disabled = paginaActual <= 1;
  document.getElementById('btn-next').disabled = paginaActual >= totalPaginas;
}

function bindPaginacion() {
  document.getElementById('btn-prev').addEventListener('click', () => {
    if (paginaActual > 1) { paginaActual--; cargarRegistros(); }
  });

  document.getElementById('btn-next').addEventListener('click', () => {
    const totalPaginas = Math.ceil(totalRegistros / LIMITE);
    if (paginaActual < totalPaginas) { paginaActual++; cargarRegistros(); }
  });
}

// =========================================================
// Filtros — reset de página al cambiar
// =========================================================
function bindFiltros() {
  const ids = ['filtro-empleado', 'filtro-tipo', 'filtro-localidad', 'fecha-desde', 'fecha-hasta'];
  ids.forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      paginaActual = 1;
      cargarRegistros();
    });
  });
}

// =========================================================
// Modal
// =========================================================
function bindModal() {
  const modal = document.getElementById('modal-foto-asistencia');
  document.getElementById('btn-cerrar-modal').addEventListener('click', cerrarModal);
  modal.addEventListener('click', e => {
    if (e.target === modal) cerrarModal();
  });
}

function cerrarModal() {
  document.getElementById('modal-foto-asistencia').style.display = 'none';
  document.getElementById('foto-modal-img').src = '';
}
