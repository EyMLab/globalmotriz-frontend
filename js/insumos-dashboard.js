document.addEventListener('DOMContentLoaded', () => {

  if (!getToken()) {
    redirectLogin();
    return;
  }

  let _dashboardRenderizado = false;
  const _charts = {};

  const btnDashboard = document.querySelector('.subtab-btn[data-tab="dashboard"]');
  if (btnDashboard) {
    btnDashboard.addEventListener('click', () => {
      if (!_dashboardRenderizado) {
        cargarDashboard();
        _dashboardRenderizado = true;
      }
    });
  }

  function fmtNum(n) {
    return Number(n || 0).toLocaleString('es-EC');
  }

  function fmtMes(yyyymm) {
    if (!yyyymm) return '—';
    const [y, m] = yyyymm.split('-');
    const meses = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${meses[parseInt(m)]} ${y}`;
  }

  function fmtFecha(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  async function cargarDashboard() {
    try {
      const res = await apiFetch('/insumos/dashboard');
      if (!res || !res.ok) throw new Error();
      const data = await safeJson(res);
      if (!data) throw new Error();

      renderKpis(data);
      renderChartTopInsumos(data.topInsumos || []);
      renderChartTopEmpleados(data.topEmpleados || []);
      renderChartTopOrdenes(data.topOrdenes || []);
      renderChartConsumoMes(data.porMes || []);
      renderChartLocalidad(data.porLocalidad || []);
      renderChartRegistrado(data.porRegistrado || []);

    } catch {
      Swal.fire('Error', 'No se pudo cargar el dashboard de consumo', 'error');
    }
  }

  function renderKpis(data) {
    document.getElementById('bdk-total-entregas').textContent = fmtNum(data.totalEntregas);
    document.getElementById('bdk-insumos-distintos').textContent = fmtNum(data.insumosDistintos);
    document.getElementById('bdk-empleados-distintos').textContent = fmtNum(data.empleadosDistintos);

    const dia = data.diaMayorConsumo;
    document.getElementById('bdk-dia-mayor').textContent = dia
      ? `${fmtFecha(dia.dia)} (${fmtNum(dia.total_cantidad)})`
      : '—';
  }

  function destruirChart(key) {
    if (_charts[key]) { _charts[key].destroy(); _charts[key] = null; }
  }

  function renderChartTopInsumos(items) {
    const ctx = document.getElementById('chart-top-insumos')?.getContext('2d');
    if (!ctx) return;
    destruirChart('topInsumos');
    _charts.topInsumos = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: items.map(i => i.insumo),
        datasets: [{
          label: 'Cantidad consumida',
          data: items.map(i => Number(i.total_cantidad)),
          backgroundColor: '#2B7A9E',
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } }
      }
    });
  }

  function renderChartTopEmpleados(items) {
    const ctx = document.getElementById('chart-top-empleados')?.getContext('2d');
    if (!ctx) return;
    destruirChart('topEmpleados');
    _charts.topEmpleados = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: items.map(i => i.empleado),
        datasets: [{
          label: 'Veces que retiró',
          data: items.map(i => Number(i.veces)),
          backgroundColor: '#5BC0BE',
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } }
      }
    });
  }

  function renderChartTopOrdenes(items) {
    const ctx = document.getElementById('chart-top-ordenes')?.getContext('2d');
    if (!ctx) return;
    destruirChart('topOrdenes');
    _charts.topOrdenes = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: items.map(i => `OT ${i.orden_trabajo}`),
        datasets: [{
          label: 'Insumos retirados',
          data: items.map(i => Number(i.veces)),
          backgroundColor: '#d97706',
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } }
      }
    });
  }

  function renderChartConsumoMes(items) {
    const ctx = document.getElementById('chart-consumo-mes')?.getContext('2d');
    if (!ctx) return;
    destruirChart('consumoMes');
    _charts.consumoMes = new Chart(ctx, {
      type: 'line',
      data: {
        labels: items.map(i => fmtMes(i.mes)),
        datasets: [{
          label: 'Cantidad consumida',
          data: items.map(i => Number(i.total_cantidad)),
          borderColor: '#2B7A9E',
          backgroundColor: 'rgba(43,122,158,0.15)',
          fill: true,
          tension: 0.25
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  function renderChartLocalidad(items) {
    const ctx = document.getElementById('chart-localidad')?.getContext('2d');
    if (!ctx) return;
    destruirChart('localidad');
    _charts.localidad = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: items.map(i => i.localidad || 'Sin localidad'),
        datasets: [{
          data: items.map(i => Number(i.total_cantidad)),
          backgroundColor: ['#2B7A9E', '#5BC0BE', '#d97706'],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  function renderChartRegistrado(items) {
    const ctx = document.getElementById('chart-registrado')?.getContext('2d');
    if (!ctx) return;
    destruirChart('registrado');
    const labels = items.map(i => i.registrado ? 'Registrados' : 'No registrados');
    _charts.registrado = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: items.map(i => Number(i.veces)),
          backgroundColor: ['#16a34a', '#dc2626'],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

});
