document.addEventListener('DOMContentLoaded', () => {

  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';
  const token = localStorage.getItem('token');
  const FILAS_POR_PAGINA = 15;

  if (!token) {
    localStorage.clear();
    window.location.href = 'index.html';
    return;
  }

  // =========================
  // DOM
  // =========================
  const tabla = document.getElementById('tabla-insumos');

  const filtroOT = document.getElementById('filtro-ot');
  const filtroInsumo = document.getElementById('filtro-insumo');
  const filtroLocalidad = document.getElementById('filtro-localidad');
  const filtroRegistrado = document.getElementById('filtro-registrado');
  const fechaDesde = document.getElementById('fecha-desde');
  const fechaHasta = document.getElementById('fecha-hasta');

  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const pageInfo = document.getElementById('page-info');

  // =========================
  // Estado
  // =========================
  let insumos = [];
  let paginaActual = 1;
  let rol = null;
  let localidadUsuario = null;

  // =========================
  // Helpers
  // =========================
  function redirectLogin() {
    localStorage.clear();
    window.location.href = 'index.html';
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });

    if (res.status === 401 || res.status === 403) {
      redirectLogin();
      return null;
    }

    return res;
  }

  async function safeJson(res) {
    try { return await res.json(); } catch { return null; }
  }

  // =========================
  // Verificar sesión
  // =========================
  verificarSesion();

  async function verificarSesion(reintentos = 2) {
    try {
      const res = await apiFetch('/auth/me');
      if (!res || !res.ok) throw new Error();

      const data = await safeJson(res);
      rol = data.rol;
      localidadUsuario = data.localidad;

      if (rol === 'asesor') {
        filtroLocalidad.value = localidadUsuario;
        filtroLocalidad.disabled = true;
      }

      await cargarInsumos();

    } catch {
      if (reintentos > 0) {
        setTimeout(() => verificarSesion(reintentos - 1), 1200);
      } else {
        Swal.fire('Error', 'No se pudo verificar sesión', 'error');
        redirectLogin();
      }
    }
  }

  // =========================
  // Cargar insumos
  // =========================
  async function cargarInsumos() {
    const params = new URLSearchParams();

    if (rol === 'asesor') {
      params.append('localidad', localidadUsuario);
    } else if (filtroLocalidad.value) {
      params.append('localidad', filtroLocalidad.value);
    }

    if (filtroOT.value.trim()) params.append('ot', filtroOT.value.trim());
    if (filtroInsumo.value.trim()) params.append('insumo', filtroInsumo.value.trim());
    if (fechaDesde.value) params.append('desde', fechaDesde.value);
    if (fechaHasta.value) params.append('hasta', fechaHasta.value);

    if (filtroRegistrado.value === 'registrados') params.append('registrado', 'true');
    if (filtroRegistrado.value === 'no-registrados') params.append('registrado', 'false');

    try {
      const res = await apiFetch(`/insumos?${params.toString()}`);
      const data = await safeJson(res);

      if (!res || !res.ok || !Array.isArray(data)) {
        throw new Error();
      }

      insumos = data;
      paginaActual = 1;
      renderPagina();

    } catch {
      tabla.innerHTML = `<tr><td colspan="11">Error al cargar insumos</td></tr>`;
    }
  }

  // =========================
  // Render tabla
  // =========================
  function renderPagina() {
    tabla.innerHTML = '';

    const inicio = (paginaActual - 1) * FILAS_POR_PAGINA;
    const pageData = insumos.slice(inicio, inicio + FILAS_POR_PAGINA);

    if (!pageData.length) {
      tabla.innerHTML = `<tr><td colspan="11">Sin resultados</td></tr>`;
      actualizarPaginacion();
      return;
    }

    pageData.forEach(i => {
      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td>${i.id}</td>
        <td>${i.orden_trabajo}</td>
        <td>${i.empleado ?? '—'}</td>
        <td>${i.codigo_barras}</td>
        <td>${i.insumo}</td>
        <td>${i.tipo}</td>
        <td>${i.cantidad}</td>
        <td>${i.unidad ?? '-'}</td>
        <td>${new Date(i.fecha).toLocaleString('es-EC')}</td>
        <td>${i.localidad}</td>
      `;

      tr.appendChild(renderCheckbox(i));
      tr.appendChild(renderEliminar(i));

      tabla.appendChild(tr);
    });

    actualizarPaginacion();
  }

  function actualizarPaginacion() {
    const totalPages = Math.max(1, Math.ceil(insumos.length / FILAS_POR_PAGINA));
    pageInfo.textContent = `Página ${paginaActual} de ${totalPages}`;
    btnPrev.disabled = paginaActual === 1;
    btnNext.disabled = paginaActual >= totalPages;
  }

  // =========================
  // Checkbox registrado
  // =========================
  function renderCheckbox(item) {
    const td = document.createElement('td');
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = !!item.registrado;

    const puedeMarcar = rol === 'admin' || rol === 'bodega';
    const puedeDesmarcar = rol === 'admin';

    if (!puedeMarcar && !puedeDesmarcar) {
      chk.disabled = true;
    } else {
      chk.addEventListener('change', () => {
        const nuevo = chk.checked;

        if ((nuevo && !puedeMarcar) || (!nuevo && !puedeDesmarcar)) {
          chk.checked = !nuevo;
          return;
        }

        Swal.fire({
          title: nuevo ? `¿Registrar insumo ${item.id}?` : `¿Quitar registro ${item.id}?`,
          icon: 'question',
          showCancelButton: true
        }).then(r => {
          if (r.isConfirmed) actualizarRegistro(item.id, nuevo);
          else chk.checked = !nuevo;
        });
      });
    }

    td.appendChild(chk);
    return td;
  }

  async function actualizarRegistro(id, value) {
    try {
      const res = await apiFetch(`/insumos/${id}/registrado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrado: value })
      });

      if (!res || !res.ok) throw new Error();

      const item = insumos.find(x => x.id === id);
      if (item) item.registrado = value;

      Swal.fire({
        icon: 'success',
        title: value ? '✅ Marcado como registrado' : '❎ Registro quitado',
        timer: 1200,
        showConfirmButton: false
      });

    } catch {
      Swal.fire('Error', 'No se pudo actualizar', 'error');
    }
  }

  // =========================
  // Eliminar (solo admin)
  // =========================
  function renderEliminar(item) {
    const td = document.createElement('td');

    if (rol !== 'admin') return td;

    const btn = document.createElement('button');
    btn.textContent = 'Eliminar';
    btn.className = 'btn-eliminar';

    btn.onclick = () => {
      Swal.fire({
        title: `¿Eliminar registro ${item.id}?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33'
      }).then(r => {
        if (r.isConfirmed) eliminarInsumo(item.id);
      });
    };

    td.appendChild(btn);
    return td;
  }

  async function eliminarInsumo(id) {
    try {
      const res = await apiFetch(`/insumos/${id}`, { method: 'DELETE' });
      if (!res || !res.ok) throw new Error();

      insumos = insumos.filter(x => x.id !== id);
      renderPagina();

      Swal.fire({
        icon: 'success',
        title: '✅ Eliminado',
        timer: 1200,
        showConfirmButton: false
      });

    } catch {
      Swal.fire('Error', 'No se pudo eliminar', 'error');
    }
  }

  // =========================
  // Listeners
  // =========================
  [filtroOT, filtroInsumo].forEach(el => el.addEventListener('input', cargarInsumos));
  [filtroLocalidad, filtroRegistrado, fechaDesde, fechaHasta]
    .forEach(el => el.addEventListener('change', cargarInsumos));

  btnPrev.onclick = () => {
    if (paginaActual > 1) {
      paginaActual--;
      renderPagina();
    }
  };

  btnNext.onclick = () => {
    if (paginaActual * FILAS_POR_PAGINA < insumos.length) {
      paginaActual++;
      renderPagina();
    }
  };

});
