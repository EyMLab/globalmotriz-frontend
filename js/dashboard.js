document.addEventListener('DOMContentLoaded', () => {
  const FILAS_POR_PAGINA = 10;

  // =========================
  // DOM
  // =========================
  const loader = document.getElementById('loader');
  const contenido = document.getElementById('contenido-dashboard');

  const tabla = document.getElementById('tabla-facturas');
  const filtroAsesor = document.getElementById('filtro-asesor');
  const filtroModo = document.getElementById('filtro-modo');
  const filtroLocalidad = document.getElementById('filtro-localidad');
  const filtroRegistrado = document.getElementById('filtro-registrado');
  const fechaDesde = document.getElementById('fecha-desde');
  const fechaHasta = document.getElementById('fecha-hasta');

  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const pageInfo = document.getElementById('page-info');

  if (!getToken()) {
    redirectLogin();
    return;
  }

  // =========================
  // Estado
  // =========================
  let facturas = [];
  let paginaActual = 1;
  let rol = null;

  // =========================
  // UI helpers
  // =========================
  function setLoaderVisible(visible) {
    if (loader) loader.style.display = visible ? 'flex' : 'none';
    if (contenido) contenido.style.display = visible ? 'none' : 'block';
  }

  function setLoaderText(text) {
    if (!loader) return;
    const p = loader.querySelector('p');
    if (p) p.textContent = text;
  }

  // =========================
  // Init
  // =========================
  setLoaderVisible(true);
  setLoaderText('Conectando con el servidor...');

  init();

  async function init() {
    await verificarSesionConReintentos(2);
  }

  async function verificarSesionConReintentos(maxReintentos = 2) {
    for (let intento = 0; intento <= maxReintentos; intento++) {
      const ok = await verificarSesion();
      if (ok) return;

      if (intento < maxReintentos) {
        await esperar(1500);
      }
    }

    await Swal.fire('Error', 'No se pudo conectar con el servidor.', 'error');
    redirectToLogin(true);
  }

  function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function verificarSesion() {
    const inicio = Date.now();

    try {
      const res = await apiFetch('/auth/me');
      if (!res) return false;

      const duracion = Date.now() - inicio;
      if (duracion > 1500) setLoaderText('Conectando con el servidor...');

      if (!res.ok) return false;

      const data = await safeJson(res);
      if (!data) return false;

      rol = data.rol;

      // Solo admin puede ver Facturas
      if (rol !== 'admin') {
        window.location.href = 'inventario.html';
        return false;
      }

      // (El navbar real muestra #usuario-info; este span quedó de legado)
      const spanUsuario = document.getElementById('nombre-usuario');
      if (spanUsuario) spanUsuario.textContent = `${data.usuario} (${rol})`;

      await cargarFiltrosIniciales();
      await aplicarFiltros();

      setLoaderVisible(false);
      return true;

    } catch (err) {
      return false;
    }
  }

  // =========================
  // Filtros
  // =========================
  async function cargarFiltrosIniciales() {
    const res = await apiFetch('/facturas/filtros');
    const data = await safeJson(res);

    if (!res || !res.ok || !data) return;

    crearOpciones(filtroAsesor, unique(data.asesores || []));
    crearOpciones(filtroModo, unique(data.modos || []));
    crearOpciones(filtroLocalidad, unique(data.localidades || []));
  }

  function unique(arr) {
    return [...new Set(arr)].filter(Boolean);
  }

  function crearOpciones(select, items) {
    if (!select) return;
    select.innerHTML = '<option value="">Todos</option>';

    items.forEach(item => {
      const o = document.createElement('option');
      o.value = item;
      o.textContent = item;
      select.appendChild(o);
    });
  }

  const filtros = [filtroAsesor, filtroModo, filtroLocalidad, filtroRegistrado, fechaDesde, fechaHasta];
  filtros.forEach(el => el && el.addEventListener('change', () => aplicarFiltros()));

  function construirURLConFiltros() {
    const params = new URLSearchParams();

    if (filtroAsesor?.value) params.append('asesor', filtroAsesor.value);
    if (filtroModo?.value) params.append('modo_pago', filtroModo.value);
    if (filtroLocalidad?.value) params.append('localidad', filtroLocalidad.value);

    if (filtroRegistrado?.value === 'registradas') params.append('registrado', 'true');
    else if (filtroRegistrado?.value === 'no-registradas') params.append('registrado', 'false');

    if (fechaDesde?.value) params.append('desde', fechaDesde.value);
    if (fechaHasta?.value) params.append('hasta', fechaHasta.value);

    const qs = params.toString();
    return `/facturas${qs ? `?${qs}` : ''}`;
  }

  async function aplicarFiltros() {
    const res = await apiFetch(construirURLConFiltros());
    const data = await safeJson(res);

    if (!res || !res.ok || !Array.isArray(data)) {
      facturas = [];
    } else {
      facturas = data;
    }

    paginaActual = 1;
    renderPagina(paginaActual);
  }

  // =========================
  // Render tabla + paginación
  // =========================
  function renderPagina(pagina) {
    if (!tabla) return;

    tabla.innerHTML = '';

    const inicio = (pagina - 1) * FILAS_POR_PAGINA;
    const paginaDatos = facturas.slice(inicio, inicio + FILAS_POR_PAGINA);

    if (paginaDatos.length === 0) {
      tabla.innerHTML = `<tr><td colspan="9">No hay resultados</td></tr>`;
      actualizarPaginacion();
      return;
    }

    paginaDatos.forEach(f => {
      tabla.appendChild(renderFilaFactura(f));
    });

    actualizarPaginacion();
  }

  function actualizarPaginacion() {
    const totalPaginas = Math.max(1, Math.ceil(facturas.length / FILAS_POR_PAGINA));
    if (pageInfo) pageInfo.textContent = `Página ${paginaActual} / ${totalPaginas}`;

    if (btnPrev) btnPrev.disabled = paginaActual === 1;
    if (btnNext) btnNext.disabled = paginaActual * FILAS_POR_PAGINA >= facturas.length;
  }

  function renderFilaFactura(f) {
    const fila = document.createElement('tr');

    // id, asesor, modo_pago, localidad
    ['id', 'asesor', 'modo_pago', 'localidad'].forEach(campo => {
      const td = document.createElement('td');
      td.textContent = f?.[campo] ?? '';
      fila.appendChild(td);
    });

    // fecha
    const tdFecha = document.createElement('td');
    tdFecha.textContent = formatFechaEC(f?.fecha);
    fila.appendChild(tdFecha);

    // imagen
    const tdImagen = document.createElement('td');
    const imgUrl = normalizarImageUrl(f?.imagen_url);

    tdImagen.innerHTML = `<img src="${imgUrl}" width="60" style="cursor:pointer" onclick="abrirModal('${escapeQuotes(imgUrl)}')">`;
    fila.appendChild(tdImagen);

    // registrado checkbox según rol
    const tdRegistrado = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(f?.registrado);

    const puedeMarcar = rol === 'admin' || rol === 'bodega';
    const puedeDesmarcar = rol === 'admin';

    if (!puedeMarcar && !puedeDesmarcar) {
      checkbox.disabled = true;
    } else {
      checkbox.addEventListener('change', () => onToggleRegistrado(f, checkbox, puedeMarcar, puedeDesmarcar));
    }

    tdRegistrado.appendChild(checkbox);
    fila.appendChild(tdRegistrado);

    // observaciones
    const tdObs = document.createElement('td');
    const tieneObs = Boolean(f?.observaciones?.trim());
    tdObs.innerHTML = `<button class="btn-obs" onclick="abrirModalObservaciones(${f.id})">${tieneObs ? '📝' : '➕'}</button>`;
    fila.appendChild(tdObs);

    // acciones (eliminar solo admin)
    const tdEliminar = document.createElement('td');
    if (rol === 'admin') {
      tdEliminar.innerHTML = `<button class="btn-eliminar" onclick="eliminarFactura(${f.id})">Eliminar</button>`;
    }
    fila.appendChild(tdEliminar);

    return fila;
  }

  function formatFechaEC(fecha) {
    if (!fecha) return '';
    try {
      return new Date(fecha).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });
    } catch {
      return '';
    }
  }

  function normalizarImageUrl(url) {
    const u = String(url || '');
    if (!u) return '';
    return u.startsWith('http') ? u : `${API_BASE_URL}${u}`;
  }

  function escapeQuotes(str) {
    return String(str).replace(/'/g, "\\'");
  }

  async function onToggleRegistrado(factura, checkbox, puedeMarcar, puedeDesmarcar) {
    const nuevo = checkbox.checked;

    // bloqueo por permisos (mantiene mismo comportamiento)
    if ((nuevo && !puedeMarcar) || (!nuevo && !puedeDesmarcar)) {
      checkbox.checked = !nuevo;
      return;
    }

    const titulo = nuevo ? `¿Registrar factura ${factura.id}?` : `¿Quitar registro ${factura.id}?`;

    const r = await Swal.fire({
      title: titulo,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Confirmar',
      cancelButtonText: 'Cancelar'
    });

    if (!r.isConfirmed) {
      checkbox.checked = !nuevo;
      return;
    }

    await cambiarRegistrado(factura.id, nuevo, checkbox);
  }

  async function cambiarRegistrado(id, valor, checkbox) {
    try {
      const res = await apiFetch(`/facturas/${id}/registrado`, {
        method: 'PATCH',
        body: JSON.stringify({ registrado: valor })
      });

      const data = await safeJson(res);
      if (!res || !res.ok) {
        throw new Error(data?.error || 'No se pudo actualizar.');
      }

      await aplicarFiltros();

    } catch (err) {
      checkbox.checked = !valor;
      Swal.fire('❌ Error', err?.message || 'No se pudo actualizar.', 'error');
    }
  }

  // =========================
  // Paginación eventos
  // =========================
  if (btnPrev) btnPrev.addEventListener('click', () => {
    if (paginaActual > 1) {
      paginaActual--;
      renderPagina(paginaActual);
    }
  });

  if (btnNext) btnNext.addEventListener('click', () => {
    if (paginaActual * FILAS_POR_PAGINA < facturas.length) {
      paginaActual++;
      renderPagina(paginaActual);
    }
  });

  // =========================
  // Funciones globales requeridas por onclick en HTML generado
  // =========================

  // ELIMINAR FACTURA
  window.eliminarFactura = async function (id) {
    const r = await Swal.fire({
      title: `¿Eliminar factura ${id}?`,
      text: 'La imagen también será eliminada del servidor.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (!r.isConfirmed) return;

    try {
      const res = await apiFetch(`/facturas/${id}`, { method: 'DELETE' });
      const data = await safeJson(res);

      if (!res || !res.ok) {
        throw new Error(data?.error || 'No se pudo eliminar la factura.');
      }

      await Swal.fire('✅ Eliminada', data?.message || 'Factura eliminada', 'success');
      await aplicarFiltros();

    } catch (err) {
      Swal.fire('❌ Error', err?.message || 'No se pudo eliminar la factura.', 'error');
    }
  };

  // OBSERVACIONES
  window.abrirModalObservaciones = async function (id) {
    try {
      const res = await apiFetch(`/facturas/${id}/observaciones`);
      const data = await safeJson(res);

      if (!res || !res.ok) {
        throw new Error(data?.error || 'No se pudieron cargar observaciones.');
      }

      const obsActuales = data?.observaciones || '';

      const result = await Swal.fire({
        title: `Observaciones (${id})`,
        input: 'textarea',
        inputPlaceholder: 'Escribe aquí...',
        inputLabel: obsActuales ? `Existentes:\n${obsActuales}` : 'Agregar observación',
        showCancelButton: true,
        confirmButtonText: 'Guardar'
      });

      if (!result.isConfirmed) return;

      const texto = String(result.value || '').trim();
      if (!texto) return;

      const res2 = await apiFetch(`/facturas/${id}/observaciones`, {
        method: 'PATCH',
        body: JSON.stringify({ texto })
      });

      const data2 = await safeJson(res2);

      if (!res2 || !res2.ok) {
        throw new Error(data2?.error || 'No se pudo guardar.');
      }

      await Swal.fire('✅ Guardado', 'Observación añadida correctamente', 'success');
      await aplicarFiltros();

    } catch (err) {
      Swal.fire('❌ Error', err?.message || 'No se pudo procesar observaciones.', 'error');
    }
  };

  // MODAL IMAGEN + ZOOM
  window.abrirModal = function (url) {
    const modal = document.getElementById('modal-imagen');
    const img = document.getElementById('imagen-modal');

    if (!modal || !img) return;

    modal.style.display = 'block';
    img.src = url;

    // reset zoom
    setZoom(img, 1);
  };

  window.cerrarModal = function () {
    const modal = document.getElementById('modal-imagen');
    if (modal) modal.style.display = 'none';
  };

  // Zoom listeners (se inicializan una sola vez)
  initZoomModal();

  function initZoomModal() {
    const modal = document.getElementById('modal-imagen');
    const img = document.getElementById('imagen-modal');
    if (!modal || !img) return;

    let zoom = 1;

    img.addEventListener('wheel', (e) => {
      e.preventDefault();

      const rect = img.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      const xPercent = (offsetX / rect.width) * 100;
      const yPercent = (offsetY / rect.height) * 100;

      img.style.transformOrigin = `${xPercent}% ${yPercent}%`;

      zoom += e.deltaY * -0.0015;
      zoom = Math.min(Math.max(zoom, 1), 4);

      setZoom(img, zoom);
    });

    img.addEventListener('dblclick', () => {
      zoom = zoom > 1 ? 1 : 3;
      setZoom(img, zoom);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') window.cerrarModal();
    });

    function setZoom(imgEl, z) {
      imgEl.dataset.zoom = String(z);
      imgEl.style.transform = `scale(${z})`;
    }
  }

  function setZoom(imgEl, z) {
    imgEl.dataset.zoom = String(z);
    imgEl.style.transform = `scale(${z})`;
  }
});
