document.addEventListener('DOMContentLoaded', () => {
  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';

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

  // === Verificar sesión y cargar datos iniciales ===
  async function verificarSesion(reintento = 0) {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        window.location.href = 'index.html';
        return;
      }

      if (!res.ok) throw new Error('Servidor no respondió correctamente.');

      const data = await res.json();
      rol = data.rol;
      if (spanUsuario) spanUsuario.textContent = `${data.usuario} (${rol})`;

      // ✅ Primero carga facturas
      aplicarFiltros();
      // ✅ Luego carga filtros (evita duplicados visuales)
      cargarFiltrosIniciales();

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

  // === Cargar filtros dinámicos (sin duplicados) ===
  function cargarFiltrosIniciales() {
    fetch(`${API_BASE_URL}/facturas/filtros`, {
      headers: { Authorization: 'Bearer ' + token }
    })
      .then(res => res.json())
      .then(data => {
        crearOpciones(filtroAsesor, [...new Set(data.asesores)]);
        crearOpciones(filtroModo, [...new Set(data.modos)]);
        crearOpciones(filtroLocalidad, [...new Set(data.localidades)]);
      })
      .catch(err => console.error('❌ Error al cargar filtros:', err));
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

  // === Eventos de filtros ===
  [filtroAsesor, filtroModo, filtroLocalidad, filtroRegistrado, fechaDesde, fechaHasta]
    .forEach(el => el.addEventListener('change', aplicarFiltros));

  // === Construir URL con filtros activos ===
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

  // === Aplicar filtros y cargar facturas ===
  function aplicarFiltros() {
    fetch(construirURLConFiltros(), { headers: { Authorization: 'Bearer ' + token } })
      .then(res => res.json())
      .then(data => {
        facturas = data;
        paginaActual = 1;
        mostrarPagina(paginaActual);
      })
      .catch(err => {
        console.error('❌ Error al cargar facturas:', err);
        tabla.innerHTML = `<tr><td colspan="9">Error al cargar facturas</td></tr>`;
      });
  }

  // === Paginación ===
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
      tdFecha.textContent = new Date(f.fecha).toLocaleString();
      fila.appendChild(tdFecha);

      const tdImagen = document.createElement('td');
      const imageUrl = `${API_BASE_URL}${f.imagen_url}`;
      tdImagen.innerHTML = `<img src="${imageUrl}" width="60" style="cursor:pointer" onclick="abrirModal('${imageUrl}')">`;
      fila.appendChild(tdImagen);

      // === Checkbox registrado según rol ===
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

      // === Observaciones ===
      const tdObs = document.createElement('td');
      tdObs.innerHTML = `<button class="btn-obs" onclick="abrirModalObservaciones(${f.id})">${
        f.observaciones?.trim() ? '📝' : '➕'
      }</button>`;
      fila.appendChild(tdObs);

      // === Eliminar solo admin ===
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

  // === Registrar / desregistrar factura ===
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

  // === Eliminar factura ===
  function eliminarFactura(id) {
    fetch(`${API_BASE_URL}/facturas/${id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token }
    })
      .then(res => res.json())
      .then(() => aplicarFiltros())
      .catch(() => Swal.fire('Error', 'No se pudo eliminar la factura.', 'error'));
  }

  // === Observaciones ===
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

  // === Modal de imagen ===
  window.abrirModal = url => {
    const modal = document.getElementById('modal-imagen');
    const img = document.getElementById('imagen-modal');
    if (modal && img) {
      modal.style.display = 'block';
      img.src = url;
    }
  };

  window.cerrarModal = () => {
    const modal = document.getElementById('modal-imagen');
    if (modal) modal.style.display = 'none';
  };
});
