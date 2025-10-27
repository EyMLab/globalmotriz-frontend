document.addEventListener('DOMContentLoaded', () => {
  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';
  const token = localStorage.getItem('token');
  const tabla = document.getElementById('tabla-insumos');

  // === Filtros ===
  const filtroOT = document.getElementById('filtro-ot');
  const filtroInsumo = document.getElementById('filtro-insumo');
  const filtroRegistrado = document.getElementById('filtro-registrado');
  const fechaDesde = document.getElementById('fecha-desde');
  const fechaHasta = document.getElementById('fecha-hasta');

  // === Paginación ===
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const pageInfo = document.getElementById('page-info');
  const filasPorPagina = 15;
  let paginaActual = 1;

  // === Estado ===
  let insumos = [];
  let rol = null;

  // === Verificar sesión (con reintento si Render está dormido) ===
  async function verificarSesion(reintento = 0) {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: 'Bearer ' + token }
      });

      if (res.status === 401 || res.status === 403) {
        console.warn("⚠ Token expirado o inválido");
        localStorage.clear();
        window.location.href = 'index.html';
        return;
      }

      if (!res.ok) throw new Error('Error desconocido en /auth/me');

      const data = await res.json();
      rol = data.rol;
      cargarInsumos();

    } catch (err) {
      console.warn(`⚠ Intento ${reintento + 1} fallido: ${err.message}`);
      if (reintento < 2) {
        setTimeout(() => verificarSesion(reintento + 1), 1200);
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Error de conexión',
          text: 'No se pudo verificar la sesión. Inténtalo más tarde.',
          confirmButtonText: 'Aceptar'
        }).then(() => {
          localStorage.clear();
          window.location.href = 'index.html';
        });
      }
    }
  }

  verificarSesion(); // 🚀 Iniciar flujo de sesión

  // === Cargar insumos con filtros ===
  function cargarInsumos() {
    const params = new URLSearchParams();

    if (filtroOT.value.trim()) params.append('ot', filtroOT.value.trim());
    if (filtroInsumo.value.trim()) params.append('insumo', filtroInsumo.value.trim());
    if (fechaDesde.value) params.append('desde', fechaDesde.value);
    if (fechaHasta.value) params.append('hasta', fechaHasta.value);
    if (filtroRegistrado.value === 'registrados') params.append('registrado', 'true');
    if (filtroRegistrado.value === 'no-registrados') params.append('registrado', 'false');

    fetch(`${API_BASE_URL}/insumos?${params.toString()}`, {
      headers: { Authorization: 'Bearer ' + token }
    })
      .then(res => {
        if (!res.ok) throw new Error('Fallo al obtener insumos');
        return res.json();
      })
      .then(data => {
        insumos = Array.isArray(data) ? data : [];
        paginaActual = 1;
        mostrarPagina(paginaActual);
      })
      .catch(err => {
        console.error('❌ Error al cargar insumos:', err);
        tabla.innerHTML = `<tr><td colspan="9">Error al cargar insumos</td></tr>`;
      });
  }

  // === Renderizar tabla ===
  function mostrarPagina(pagina) {
    tabla.innerHTML = '';
    if (!Array.isArray(insumos)) insumos = [];

    const inicio = (pagina - 1) * filasPorPagina;
    const fin = inicio + filasPorPagina;
    const paginaDatos = insumos.slice(inicio, fin);

    if (paginaDatos.length === 0) {
      tabla.innerHTML = `<tr><td colspan="9">No hay resultados</td></tr>`;
      return;
    }

    paginaDatos.forEach(i => {
      const fila = document.createElement('tr');
      fila.innerHTML = `
        <td>${i.id}</td>
        <td>${i.orden_trabajo}</td>
        <td>${i.codigo_barras}</td>
        <td>${i.insumo}</td>
        <td>${i.tipo || 'N/A'}</td>
        <td>${Math.floor(i.cantidad || 1)} ${i.unidad || ''}</td>
        <td>${new Date(i.fecha).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}</td>
      `;

      // === Checkbox ===
      const tdCheck = document.createElement('td');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!i.registrado;

      const puedeMarcar = rol === 'admin' || rol === 'bodega';
      const puedeDesmarcar = rol === 'admin';

      if (!puedeMarcar && !puedeDesmarcar) {
        checkbox.disabled = true;
      } else {
        checkbox.addEventListener('change', () => {
          const nuevoValor = checkbox.checked;
          if (nuevoValor && !puedeMarcar) { checkbox.checked = false; return; }
          if (!nuevoValor && !puedeDesmarcar) { checkbox.checked = true; return; }

          Swal.fire({
            title: nuevoValor
              ? `¿Registrar insumo ${i.id}?`
              : `¿Quitar registro de insumo ${i.id}?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: nuevoValor ? 'Sí, registrar' : 'Sí, desmarcar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: nuevoValor ? '#3085d6' : '#d33'
          }).then(result => {
            if (result.isConfirmed) {
              cambiarRegistrado(i.id, nuevoValor, checkbox);
            } else {
              checkbox.checked = !nuevoValor;
            }
          });
        });
      }

      tdCheck.appendChild(checkbox);
      fila.appendChild(tdCheck);

      // === Botón eliminar (solo admin) ===
      const tdEliminar = document.createElement('td');
      if (rol === 'admin') {
        const btnEliminar = document.createElement('button');
        btnEliminar.textContent = 'Eliminar';
        btnEliminar.className = 'btn-eliminar';
        btnEliminar.onclick = () => {
          Swal.fire({
            title: `¿Eliminar insumo ${i.id}?`,
            text: 'Esta acción no se puede deshacer.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#d33'
          }).then(result => {
            if (result.isConfirmed) eliminarInsumo(i.id);
          });
        };
        tdEliminar.appendChild(btnEliminar);
      }
      fila.appendChild(tdEliminar);

      tabla.appendChild(fila);
    });

    pageInfo.textContent = `Página ${paginaActual} de ${Math.ceil(insumos.length / filasPorPagina)}`;
    btnPrev.disabled = paginaActual === 1;
    btnNext.disabled = paginaActual * filasPorPagina >= insumos.length;
  }

  // === Cambiar estado ===
  function cambiarRegistrado(id, nuevoValor, checkbox) {
    fetch(`${API_BASE_URL}/insumos/${id}/registrado`, {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ registrado: nuevoValor })
    })
      .then(res => {
        if (!res.ok) throw new Error('Error al actualizar');
        return res.json();
      })
      .then(() => {
        Swal.fire({
          icon: 'success',
          title: nuevoValor
            ? '✅ Insumo marcado como registrado'
            : '❎ Registro de insumo quitado',
          showConfirmButton: false,
          timer: 1200
        });
        const item = insumos.find(x => x.id === id);
        if (item) item.registrado = nuevoValor;
      })
      .catch(err => {
        console.error('❌ Error al actualizar:', err);
        checkbox.checked = !nuevoValor;
        Swal.fire('❌ Error', 'No se pudo actualizar el insumo.', 'error');
      });
  }

  // === Eliminar insumo ===
  function eliminarInsumo(id) {
    fetch(`${API_BASE_URL}/insumos/${id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token }
    })
      .then(res => {
        if (!res.ok) throw new Error('Error al eliminar');
        return res.json();
      })
      .then(() => {
        Swal.fire({
          icon: 'success',
          title: '✅ Insumo eliminado correctamente',
          showConfirmButton: false,
          timer: 1200
        });
        insumos = insumos.filter(x => x.id !== id);
        mostrarPagina(paginaActual);
      })
      .catch(err => {
        console.error('❌ Error al eliminar:', err);
        Swal.fire('❌ Error', 'No se pudo eliminar el insumo.', 'error');
      });
  }

  // === Listeners de filtros ===
  [filtroOT, filtroInsumo].forEach(el => el.addEventListener('input', cargarInsumos));
  [filtroRegistrado, fechaDesde, fechaHasta].forEach(el => el.addEventListener('change', cargarInsumos));

  // === Navegación ===
  btnPrev.addEventListener('click', () => {
    if (paginaActual > 1) {
      paginaActual--;
      mostrarPagina(paginaActual);
    }
  });

  btnNext.addEventListener('click', () => {
    const maxPage = Math.ceil(insumos.length / filasPorPagina);
    if (paginaActual < maxPage) {
      paginaActual++;
      mostrarPagina(paginaActual);
    }
  });
});
