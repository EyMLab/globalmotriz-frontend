document.addEventListener('DOMContentLoaded', () => {
  if (!getToken()) {
    redirectLogin();
    return;
  }

  const state = {
    page: 1,
    pageSize: 20,
    total: 0,
    localidad: '',
    desde: '',
    hasta: ''
  };

  const tbody = document.getElementById('tablaHistorial');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const pageInfo = document.getElementById('page-info');
  const btnBuscar = document.getElementById('btn-buscar');

  const hoy = new Date().toISOString().split('T')[0];
  const inputHasta = document.getElementById('h-hasta');
  if (inputHasta) inputHasta.value = hoy;
  
  async function apiFetchJson(path) {
    try {
      const res = await apiFetch(path);
      if (!res) return null;
      return await safeJson(res);
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  async function cargarHistorial() {
    state.localidad = document.getElementById('h-localidad').value;
    state.desde = document.getElementById('h-desde').value;
    state.hasta = document.getElementById('h-hasta').value;

    const params = new URLSearchParams({
      page: state.page,
      pageSize: state.pageSize,
      localidad: state.localidad,
      fechaDesde: state.desde,
      fechaHasta: state.hasta
    });

    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px;">Cargando historial...</td></tr>';
    const data = await apiFetchJson(`/inventario/historial?${params.toString()}`);

    if (data) {
      state.total = data.total;
      state.page = data.page; 
      renderTabla(data.items);
      renderPaginacion();
    } else {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:red;">Error al cargar datos</td></tr>';
    }
  }

  function renderTabla(items) {
    tbody.innerHTML = '';
    if (!items || items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#666;">No hay movimientos registrados.</td></tr>';
      return;
    }

    items.forEach(item => {
      const motivo = (item.motivo || '').toUpperCase();
      let estiloTipo = 'font-weight:600; color:#555;';
      let icono = 'Ajuste';

      if (motivo.includes('IMPORTACIÓN') || motivo.includes('CARGA MASIVA') || motivo.includes('ENTRADA') ||
          motivo.includes('RECEPCIÓN') || motivo.includes('RECEPCION') || motivo.includes('OC #')) {
        estiloTipo = 'color:#16a34a; font-weight:700;';
        icono = 'Carga';
      } else if (motivo.includes('SALIDA') || motivo.includes('RESTAR')) {
        estiloTipo = 'color:#dc2626; font-weight:700;';
        icono = 'Salida';
      } else if (motivo.includes('TRASLADO')) {
        estiloTipo = 'color:#2563eb; font-weight:700;';
        icono = 'Traslado';
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-size:0.9rem;">${item.fecha}</td>
        <td>${item.usuario || 'Sistema'}</td>
        <td style="font-weight:600;">${item.codigo}</td>
        <td style="text-align:left;">${item.insumo || '<span style="color:#999;">Desconocido</span>'}</td>
        <td style="${estiloTipo}">${icono}</td>
        <td style="font-weight:600;">${item.cantidad}</td>
        <td>${item.localidad}</td>
        <td style="text-align:left; font-size:0.85rem; color:#444;">${item.motivo}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderPaginacion() {
    const max = Math.ceil(state.total / state.pageSize) || 1;
    pageInfo.textContent = `Página ${state.page} de ${max}`;
    btnPrev.disabled = state.page <= 1;
    btnNext.disabled = state.page >= max;
  }

  if (btnBuscar) btnBuscar.onclick = () => { state.page = 1; cargarHistorial(); };
  if (btnPrev) btnPrev.onclick = () => { if (state.page > 1) { state.page--; cargarHistorial(); } };
  if (btnNext) btnNext.onclick = () => { if (state.page < Math.ceil(state.total / state.pageSize)) { state.page++; cargarHistorial(); } };

  cargarHistorial();
});