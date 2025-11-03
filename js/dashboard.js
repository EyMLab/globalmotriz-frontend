document.addEventListener('DOMContentLoaded', () => {
  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';

  // === LOADER Y CONTENIDO ===
  const loader = document.getElementById('loader');
  const contenido = document.getElementById('contenido-dashboard');
  if (loader) loader.style.display = 'flex';
  if (contenido) contenido.style.display = 'none';

  // === Elementos del DOM ===
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
  const spanUsuario = document.getElementById('nombre-usuario');
  const filasPorPagina = 10;

  let facturas = [];
  let paginaActual = 1;
  let rol = null;
  const token = localStorage.getItem('token');

  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  function mostrarContenido() {
    if (loader) loader.style.display = 'none';
    if (contenido) contenido.style.display = 'block';
  }

  async function verificarSesion(reintento = 0) {
    const inicio = Date.now();
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });

      const duracion = Date.now() - inicio;
      if (duracion > 1500) {
        loader.querySelector('p').textContent = "Conectando con el servidor...";
      }

      if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        window.location.href = 'index.html';
        return;
      }

      if (!res.ok) throw new Error();

      const data = await res.json();
      rol = data.rol;
      if (spanUsuario) spanUsuario.textContent = `${data.usuario} (${rol})`;

      await cargarFiltrosIniciales();
      await aplicarFiltros();
      mostrarContenido();

    } catch (err) {
      if (reintento < 2) {
        setTimeout(() => verificarSesion(reintento + 1), 1500);
      } else {
        Swal.fire('Error', 'No se pudo conectar con el servidor.', 'error');
        localStorage.clear();
        window.location.href = 'index.html';
      }
    }
  }

  verificarSesion();

  async function cargarFiltrosIniciales() {
    const res = await fetch(`${API_BASE_URL}/facturas/filtros`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    crearOpciones(filtroAsesor, [...new Set(data.asesores)]);
    crearOpciones(filtroModo, [...new Set(data.modos)]);
    crearOpciones(filtroLocalidad, [...new Set(data.localidades)]);
  }

  function crearOpciones(select, data) {
    select.innerHTML = '<option value="">Todos</option>';
    data.forEach(item => {
      const o = document.createElement('option');
      o.value = item;
      o.textContent = item;
      select.appendChild(o);
    });
  }

  [filtroAsesor, filtroModo, filtroLocalidad, filtroRegistrado, fechaDesde, fechaHasta]
    .forEach(el => el.addEventListener('change', aplicarFiltros));

  function construirURLConFiltros() {
    const params = new URLSearchParams();
    if (filtroAsesor.value) params.append('asesor', filtroAsesor.value);
    if (filtroModo.value) params.append('modo_pago', filtroModo.value);
    if (filtroLocalidad.value) params.append('localidad', filtroLocalidad.value);
    if (filtroRegistrado.value === 'registradas') params.append('registrado', 'true');
    else if (filtroRegistrado.value === 'no-registradas') params.append('registrado', 'false');
    if (fechaDesde.value) params.append('desde', fechaDesde.value);
    if (fechaHasta.value) params.append('hasta', fechaHasta.value);

    return `${API_BASE_URL}/facturas?${params.toString()}`;
  }

  async function aplicarFiltros() {
    const res = await fetch(construirURLConFiltros(), { headers: { Authorization: 'Bearer ' + token }});
    facturas = await res.json();
    paginaActual = 1;
    mostrarPagina(paginaActual);
  }

  function mostrarPagina(pagina) {
    tabla.innerHTML = '';
    const inicio = (pagina - 1) * filasPorPagina;
    const paginaDatos = facturas.slice(inicio, inicio + filasPorPagina);

    if (paginaDatos.length === 0) {
      tabla.innerHTML = `<tr><td colspan="9">No hay resultados</td></tr>`;
      return;
    }

    paginaDatos.forEach(f => {
      const fila = document.createElement('tr');

      ['id', 'asesor', 'modo_pago', 'localidad'].forEach(campo => {
        const td = document.createElement('td');
        td.textContent = f[campo];
        fila.appendChild(td);
      });

      const tdFecha = document.createElement('td');
      tdFecha.textContent = new Date(f.fecha).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });
      fila.appendChild(tdFecha);

      const tdImagen = document.createElement('td');
      let imageUrl = f.imagen_url;
      if (!imageUrl.startsWith('http')) imageUrl = API_BASE_URL + imageUrl;

      tdImagen.innerHTML = `<img src="${imageUrl}" width="60" style="cursor:pointer" onclick="abrirModal('${imageUrl}')">`;
      fila.appendChild(tdImagen);

      const tdRegistrado = document.createElement('td');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = f.registrado;

      const puedeMarcar = rol === 'admin' || rol === 'bodega';
      const puedeDesmarcar = rol === 'admin';

      if (!puedeMarcar && !puedeDesmarcar) {
        checkbox.disabled = true;
      } else {
        checkbox.addEventListener('change', () => {
          const nuevo = checkbox.checked;
          if ((nuevo && !puedeMarcar) || (!nuevo && !puedeDesmarcar)) {
            checkbox.checked = !nuevo;
            return;
          }
          Swal.fire({
            title: nuevo ? `¿Registrar factura ${f.id}?` : `¿Quitar registro ${f.id}?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Confirmar',
            cancelButtonText: 'Cancelar'
          }).then(r => r.isConfirmed ? cambiarRegistrado(f.id, nuevo, checkbox) : checkbox.checked = !nuevo);
        });
      }
      tdRegistrado.appendChild(checkbox);
      fila.appendChild(tdRegistrado);

      const tdObs = document.createElement('td');
      tdObs.innerHTML = `<button class="btn-obs" onclick="abrirModalObservaciones(${f.id})">${f.observaciones?.trim() ? '📝' : '➕'}</button>`;
      fila.appendChild(tdObs);

      const tdEliminar = document.createElement('td');
      if (rol === 'admin') {
        tdEliminar.innerHTML = `<button class="btn-eliminar" onclick="eliminarFactura(${f.id})">Eliminar</button>`;
      }
      fila.appendChild(tdEliminar);

      tabla.appendChild(fila);
    });

    pageInfo.textContent = `Página ${paginaActual} / ${Math.ceil(facturas.length / filasPorPagina)}`;
    btnPrev.disabled = paginaActual === 1;
    btnNext.disabled = paginaActual * filasPorPagina >= facturas.length;
  }

  btnPrev.addEventListener('click', () => paginaActual > 1 && mostrarPagina(--paginaActual));
  btnNext.addEventListener('click', () => paginaActual * filasPorPagina < facturas.length && mostrarPagina(++paginaActual));

  function cambiarRegistrado(id, valor, checkbox) {
    fetch(`${API_BASE_URL}/facturas/${id}/registrado`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ registrado: valor })
    })
      .then(res => res.json())
      .then(() => aplicarFiltros())
      .catch(() => {
        checkbox.checked = !valor;
        Swal.fire('❌ Error', 'No se pudo actualizar.', 'error');
      });
  }

  // === ✅ ELIMINAR FACTURA CON CONFIRMACIÓN SWEETALERT ===
  window.eliminarFactura = function(id) {
    Swal.fire({
      title: `¿Eliminar factura ${id}?`,
      text: "La imagen también será eliminada del servidor.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar"
    }).then((result) => {
      if (!result.isConfirmed) return;

      fetch(`${API_BASE_URL}/facturas/${id}`, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token }
      })
      .then(res => res.json())
      .then(data => {
        Swal.fire("✅ Eliminada", data.message, "success");
        aplicarFiltros();
      })
      .catch(() => Swal.fire("❌ Error", "No se pudo eliminar la factura.", "error"));
    });
  };

  // === OBSERVACIONES ===
  window.abrirModalObservaciones = function (id) {
    fetch(`${API_BASE_URL}/facturas/${id}/observaciones`, {
      headers: { Authorization: 'Bearer ' + token }
    })
      .then(res => res.json())
      .then(data => {
        const obsActuales = data.observaciones || '';
        Swal.fire({
          title: `Observaciones (${id})`,
          input: 'textarea',
          inputPlaceholder: 'Escribe aquí...',
          inputLabel: obsActuales ? 'Existentes:\n' + obsActuales : 'Agregar observación',
          showCancelButton: true,
          confirmButtonText: 'Guardar'
        }).then(result => {
          if (result.isConfirmed && result.value.trim() !== '') {
            fetch(`${API_BASE_URL}/facturas/${id}/observaciones`, {
              method: 'PATCH',
              headers: {
                Authorization: 'Bearer ' + token,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ texto: result.value.trim() })
            })
              .then(res => res.json())
              .then(() => {
                Swal.fire('✅ Guardado', 'Observación añadida correctamente', 'success');
                aplicarFiltros();
              })
              .catch(() => Swal.fire('❌ Error', 'No se pudo guardar.', 'error'));
          }
        });
      })
      .catch(() => Swal.fire('❌ Error', 'No se pudieron cargar observaciones.', 'error'));
  };

  // === MODAL IMAGEN + ZOOM ===
  window.abrirModal = (url) => {
    const modal = document.getElementById('modal-imagen');
    const img = document.getElementById('imagen-modal');
    if (modal && img) {
      modal.style.display = 'block';
      img.src = url;
      img.dataset.zoom = 1;
      img.style.transform = "scale(1)";
    }
  };

  window.cerrarModal = () => {
    const modal = document.getElementById('modal-imagen');
    if (modal) modal.style.display = 'none';
  };

  (() => {
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
      img.style.transform = `scale(${zoom})`;
    });

    img.addEventListener('dblclick', () => {
      zoom = zoom > 1 ? 1 : 3;
      img.style.transform = `scale(${zoom})`;
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === "Escape") window.cerrarModal();
    });
  })();

});
