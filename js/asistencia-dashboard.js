// js/asistencia-dashboard.js
const DASH_CHARTS = {};

const COLORES = {
  puntual:    { bg: '#16a34a', bgAlpha: 'rgba(22,163,74,0.7)' },
  tolerancia: { bg: '#d97706', bgAlpha: 'rgba(217,119,6,0.7)' },
  atraso:     { bg: '#dc2626', bgAlpha: 'rgba(220,38,38,0.7)' },
  temprana:   { bg: '#dc2626', bgAlpha: 'rgba(220,38,38,0.7)' },
  tardia:     { bg: '#7c3aed', bgAlpha: 'rgba(124,58,237,0.7)' },
  auto:       { bg: '#64748b', bgAlpha: 'rgba(100,116,139,0.7)' },
};

function dashFechas() {
  const sel = document.getElementById('dash-periodo').value;
  const hoy = new Date();
  let desde, hasta;

  if (sel === 'semana') {
    const dia = hoy.getDay();
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - (dia === 0 ? 6 : dia - 1));
    desde = lunes.toISOString().split('T')[0];
    hasta = hoy.toISOString().split('T')[0];
  } else if (sel === 'mes') {
    desde = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
    hasta = hoy.toISOString().split('T')[0];
  } else if (sel === 'mes-anterior') {
    const prev = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    desde = prev.toISOString().split('T')[0];
    const lastDay = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
    hasta = lastDay.toISOString().split('T')[0];
  } else {
    desde = document.getElementById('dash-desde').value;
    hasta = document.getElementById('dash-hasta').value;
    if (!desde || !hasta) {
      desde = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
      hasta = hoy.toISOString().split('T')[0];
    }
  }
  return { desde, hasta };
}

function bindDashFiltros() {
  const sel = document.getElementById('dash-periodo');
  sel.addEventListener('change', () => {
    const custom = sel.value === 'custom';
    document.getElementById('dash-custom-desde').style.display = custom ? '' : 'none';
    document.getElementById('dash-custom-hasta').style.display = custom ? '' : 'none';
    cargarDashboard();
  });
  document.getElementById('dash-desde').addEventListener('change', cargarDashboard);
  document.getElementById('dash-hasta').addEventListener('change', cargarDashboard);
}

async function cargarDashboard() {
  const { desde, hasta } = dashFechas();
  const res = await apiFetch(`/asistencia/dashboard?desde=${desde}&hasta=${hasta}`);
  if (!res || !res.ok) return;
  const data = await safeJson(res);
  renderKPIs(data);
  renderChartEstados(data);
  renderChartAtrasos(data);
  renderChartTendencia(data);
  renderChartLocalidad(data);
  renderChartSalidas(data);
  renderTablaAusentes(data);
}

function renderKPIs(d) {
  document.getElementById('kpi-presentes').textContent =
    `${d.presentes_hoy} / ${d.total_empleados}`;
  document.getElementById('kpi-ausentes').textContent = d.ausentes_hoy;
  document.getElementById('kpi-puntualidad').textContent = `${d.periodo.pct_puntual}%`;
  document.getElementById('kpi-atrasos').textContent = d.periodo.atrasos;
  document.getElementById('kpi-tempranas').textContent = d.periodo.salidas_tempranas;
  document.getElementById('kpi-atrasos-alm').textContent = d.periodo.atrasos_almuerzo;

  const kpiPunt = document.getElementById('kpi-puntualidad');
  kpiPunt.style.color =
    d.periodo.pct_puntual >= 90 ? '#16a34a' :
    d.periodo.pct_puntual >= 70 ? '#d97706' : '#dc2626';

  const kpiAtrasos = document.getElementById('kpi-atrasos');
  kpiAtrasos.style.color = d.periodo.atrasos > 0 ? '#dc2626' : '';
}

function destroyChart(id) {
  if (DASH_CHARTS[id]) { DASH_CHARTS[id].destroy(); delete DASH_CHARTS[id]; }
}

function renderChartEstados(d) {
  destroyChart('estados');
  const labels = [];
  const values = [];
  const colors = [];

  (d.estados_entrada || []).forEach(r => {
    const lbl = r.estado.charAt(0).toUpperCase() + r.estado.slice(1);
    labels.push(lbl);
    values.push(Number(r.total));
    colors.push(COLORES[r.estado]?.bg || '#94a3b8');
  });

  if (!values.length) return;

  DASH_CHARTS.estados = new Chart(document.getElementById('chart-estados'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 12, font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? Math.round((ctx.parsed / total) * 100) : 0;
              return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

function renderChartAtrasos(d) {
  destroyChart('atrasos');
  const items = (d.top_atrasos || []).slice(0, 10).reverse();
  if (!items.length) return;

  const nombres = items.map(r => {
    const parts = r.nombre.split(' ');
    return parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1]}` : r.nombre;
  });

  DASH_CHARTS.atrasos = new Chart(document.getElementById('chart-atrasos'), {
    type: 'bar',
    data: {
      labels: nombres,
      datasets: [{
        data: items.map(r => Number(r.atrasos)),
        backgroundColor: '#dc2626',
        borderRadius: 4,
        barThickness: 18,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1, color: '#898781' }, grid: { color: '#e1e0d9' } },
        y: { ticks: { color: '#52514e', font: { size: 11 } }, grid: { display: false } }
      }
    }
  });
}

function renderChartTendencia(d) {
  destroyChart('tendencia');
  const items = d.tendencia || [];
  if (!items.length) return;

  const labels = items.map(r => {
    const parts = r.fecha.split('-');
    return `${parts[2]}/${parts[1]}`;
  });

  DASH_CHARTS.tendencia = new Chart(document.getElementById('chart-tendencia'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Puntual',
          data: items.map(r => Number(r.puntuales)),
          backgroundColor: COLORES.puntual.bgAlpha,
          borderRadius: 2,
        },
        {
          label: 'Tolerancia',
          data: items.map(r => Number(r.tolerancia)),
          backgroundColor: COLORES.tolerancia.bgAlpha,
          borderRadius: 2,
        },
        {
          label: 'Atraso',
          data: items.map(r => Number(r.atrasos)),
          backgroundColor: COLORES.atraso.bgAlpha,
          borderRadius: 2,
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 12, font: { size: 12 } } },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: '#898781', maxRotation: 45, autoSkip: true, maxTicksLimit: 15 },
          grid: { display: false }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { stepSize: 1, color: '#898781' },
          grid: { color: '#e1e0d9' }
        }
      }
    }
  });
}

function renderChartLocalidad(d) {
  destroyChart('localidad');
  const items = d.por_localidad || [];
  if (!items.length) return;

  DASH_CHARTS.localidad = new Chart(document.getElementById('chart-localidad'), {
    type: 'bar',
    data: {
      labels: items.map(r => r.localidad),
      datasets: [
        {
          label: 'Puntual',
          data: items.map(r => Number(r.puntuales)),
          backgroundColor: COLORES.puntual.bg,
          borderRadius: 4,
        },
        {
          label: 'Tolerancia',
          data: items.map(r => Number(r.tolerancia)),
          backgroundColor: COLORES.tolerancia.bg,
          borderRadius: 4,
        },
        {
          label: 'Atraso',
          data: items.map(r => Number(r.atrasos)),
          backgroundColor: COLORES.atraso.bg,
          borderRadius: 4,
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 12, font: { size: 12 } } },
      },
      scales: {
        x: { ticks: { color: '#52514e' }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { stepSize: 1, color: '#898781' }, grid: { color: '#e1e0d9' } }
      }
    }
  });
}

function renderChartSalidas(d) {
  destroyChart('salidas');
  const labels = [];
  const values = [];
  const colors = [];

  (d.estados_salida || []).forEach(r => {
    const lbl = r.estado.charAt(0).toUpperCase() + r.estado.slice(1);
    labels.push(lbl);
    values.push(Number(r.total));
    colors.push(COLORES[r.estado]?.bg || '#94a3b8');
  });

  if (!values.length) return;

  DASH_CHARTS.salidas = new Chart(document.getElementById('chart-salidas'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 12, font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? Math.round((ctx.parsed / total) * 100) : 0;
              return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

function renderTablaAusentes(d) {
  const tbody = document.getElementById('tabla-ausentes');
  const ausentes = d.ausentes || [];

  if (!ausentes.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-light);padding:16px;">
      Todos los empleados registraron entrada hoy</td></tr>`;
    return;
  }

  tbody.innerHTML = ausentes.map((emp, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${emp.nombre} ${emp.apellido}</td>
      <td>${emp.cargo || '—'}</td>
    </tr>
  `).join('');
}

bindDashFiltros();
