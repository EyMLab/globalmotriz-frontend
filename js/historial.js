document.addEventListener('DOMContentLoaded', () => {
  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';
  const token = localStorage.getItem('token');

  if (!token) {
    window.location.href = 'index.html';
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

  // Referencias DOM
  const tbody = document.getElementById('tablaHistorial');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const pageInfo = document.getElementById('page-info');
  const btnBuscar = document.getElementById('btn-buscar');

  // Establecer fecha "Hasta" como hoy por defecto
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('h-hasta').value = hoy;
  
  // --- HELPERS ---
  async function apiFetch(path) {
    try {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        window.location.href = 'index.html';
        return null;
      }
      return await res.json();
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  // --- CARGA DE DATOS ---
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

    const data = await apiFetch(`/inventario/historial?${params.toString()}`);

    if (data) {
      state.total = data.total;
      state.page = data.page; // Sincronizar página actual
      renderTabla(data.items);
      renderPaginacion();
    } else {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:red;">Error al cargar datos</td></tr>';
    }
  }

  // --- RENDERIZADO ---
  function renderTabla(items) {
    tbody.innerHTML = '';
    
    if (!items || items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#666;">No hay movimientos registrados en este periodo.</td></tr>';
      return;
    }

    items.forEach(item => {
      const motivo = (item.motivo || '').toUpperCase();
      let estiloTipo = 'font-weight:600; color:#555;';
      let icono = 'Ajuste';

      // Lógica de colores según el motivo
      if (motivo.includes('IMPORTACIÓN') || motivo.includes('CARGA MASIVA') || motivo.includes('ENTRADA')) {
        estiloTipo = 'color:#16a34a; font-weight:700;'; // Verde
        icono = 'Carga';
      } 
      else if (motivo.includes('SALIDA') || motivo.includes('RESTAR')) {
        estiloTipo = 'color:#dc2626; font-weight:700;'; // Rojo
        icono = 'Salida';
      } 
      else if (motivo.includes('TRASLADO')) {
        estiloTipo = 'color:#2563eb; font-weight:700;'; // Azul
        icono = 'Traslado';
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-size:0.9rem;">${item.fecha}</td>
        <td><span style="background:#f1f5f9; padding:2px 8px; border-radius:4px; font-size:0.85rem;">${item.usuario || 'Sistema'}</span></td>
        <td style="font-weight:600;">${item.codigo}</td>
        <td style="text-align:left;">${item.insumo || '<span style="color:#999;">Desconocido</span>'}</td>
        <td style="${estiloTipo}">${icono}</td>
        <td style="font-size:1.1rem; font-weight:bold;">${item.cantidad}</td>
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

  // --- EVENTOS ---
  btnBuscar.onclick = () => {
    state.page = 1;
    cargarHistorial();
  };

  btnPrev.onclick = () => {
    if (state.page > 1) {
      state.page--;
      cargarHistorial();
    }
  };

  btnNext.onclick = () => {
    const max = Math.ceil(state.total / state.pageSize);
    if (state.page < max) {
      state.page++;
      cargarHistorial();
    }
  };

  // Carga inicial
  cargarHistorial();
});