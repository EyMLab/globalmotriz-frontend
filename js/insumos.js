document.addEventListener('DOMContentLoaded', () => {

  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';
  const token = localStorage.getItem('token');

  const tabla = document.getElementById('tabla-insumos');

  // FILTROS
  const filtroOT = document.getElementById('filtro-ot');
  const filtroInsumo = document.getElementById('filtro-insumo');
  const filtroLocalidad = document.getElementById('filtro-localidad');
  const filtroRegistrado = document.getElementById('filtro-registrado');
  const fechaDesde = document.getElementById('fecha-desde');
  const fechaHasta = document.getElementById('fecha-hasta');

  // PAGINACIÓN
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const pageInfo = document.getElementById('page-info');

  const filasPorPagina = 15;
  let paginaActual = 1;

  let insumos = [];
  let rol = null;
  let localidadUsuario = null;   // ✅ AGREGADO

  // =========================================================
  // ✅ Verificar sesión con localidad incluida
  // =========================================================
  async function verificarSesion(retry = 0) {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: 'Bearer ' + token }
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        return window.location.href = "index.html";
      }

      if (!res.ok) throw new Error("Fallo en /auth/me");

      const data = await res.json();
      rol = data.rol;
      localidadUsuario = data.localidad; // ✅ obligatorio

      // ✅ Si es asesor, solo ve su localidad
      if (rol === "asesor") {
        filtroLocalidad.value = localidadUsuario;
        filtroLocalidad.disabled = true;
      }

      cargarInsumos();

    } catch (err) {
      if (retry < 2) return setTimeout(() => verificarSesion(retry + 1), 1200);

      Swal.fire("Error", "No se pudo verificar sesión", "error");
      localStorage.clear();
      window.location.href = "index.html";
    }
  }

  verificarSesion();


  // =========================================================
  // ✅ Cargar insumos desde backend
  //    (con localidad según el rol)
  // =========================================================
  function cargarInsumos() {
    const params = new URLSearchParams();

    // ✅ ASESORES SOLO SU LOCALIDAD
    if (rol === "asesor") {
      params.append("localidad", localidadUsuario);
    } else {
      if (filtroLocalidad.value) {
        params.append("localidad", filtroLocalidad.value);
      }
    }

    if (filtroOT.value.trim()) params.append('ot', filtroOT.value.trim());
    if (filtroInsumo.value.trim()) params.append('insumo', filtroInsumo.value.trim());
    if (fechaDesde.value) params.append('desde', fechaDesde.value);
    if (fechaHasta.value) params.append('hasta', fechaHasta.value);

    if (filtroRegistrado.value === 'registrados') params.append('registrado', 'true');
    if (filtroRegistrado.value === 'no-registrados') params.append('registrado', 'false');

    fetch(`${API_BASE_URL}/insumos?${params}`, {
      headers: { Authorization: 'Bearer ' + token }
    })
      .then(res => {
        if (!res.ok) throw new Error("Error obteniendo insumos");
        return res.json();
      })
      .then(data => {
        insumos = Array.isArray(data) ? data : [];
        paginaActual = 1;
        mostrarPagina();
      })
      .catch(() => {
        tabla.innerHTML = `<tr><td colspan="11">Error al cargar insumos</td></tr>`;
      });
  }


  // =========================================================
  // ✅ Render tabla
  // =========================================================
  function mostrarPagina() {
    tabla.innerHTML = "";

    const start = (paginaActual - 1) * filasPorPagina;
    const end = start + filasPorPagina;
    const pageData = insumos.slice(start, end);

    if (!pageData.length) {
      tabla.innerHTML = `<tr><td colspan="11">Sin resultados</td></tr>`;
      return;
    }

    pageData.forEach(i => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${i.id}</td>
        <td>${i.orden_trabajo}</td>
        <td>${i.codigo_barras}</td>
        <td>${i.insumo}</td>
        <td>${i.tipo}</td>
        <td>${i.cantidad}</td>
        <td>${i.unidad ?? "-"}</td>
        <td>${new Date(i.fecha).toLocaleString('es-EC')}</td>
        <td>${i.localidad}</td>
      `;

      // =========================================================
      // ✅ Checkbox REGISTRADO
      // =========================================================
      const tdCheck = document.createElement("td");
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = !!i.registrado;

      const puedeMarcar = rol === "admin" || rol === "bodega";
      const puedeDesmarcar = rol === "admin";

      if (!puedeMarcar && !puedeDesmarcar) {
        chk.disabled = true;
      } else {
        chk.addEventListener("change", () => {
          const nuevo = chk.checked;

          if (nuevo && !puedeMarcar) return chk.checked = false;
          if (!nuevo && !puedeDesmarcar) return chk.checked = true;

          Swal.fire({
            title: nuevo ? 
              `¿Registrar insumo ${i.id}?` :
              `¿Quitar registro ${i.id}?`,
            icon: "question",
            showCancelButton: true
          }).then(r => {
            if (r.isConfirmed) actualizarRegistro(i.id, nuevo);
            else chk.checked = !nuevo;
          });
        });
      }

      tdCheck.appendChild(chk);
      tr.appendChild(tdCheck);


      // =========================================================
      // ✅ Botón eliminar SOLO ADMIN
      // =========================================================
      const tdDel = document.createElement("td");

      if (rol === "admin") {
        const btn = document.createElement("button");
        btn.textContent = "Eliminar";
        btn.classList.add("btn-eliminar");

        btn.onclick = () => {
          Swal.fire({
            title: `¿Eliminar registro ${i.id}?`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33"
          }).then(r => {
            if (r.isConfirmed) eliminarInsumo(i.id);
          });
        };

        tdDel.appendChild(btn);
      }

      tr.appendChild(tdDel);

      tabla.appendChild(tr);
    });

    // Paginación
    const totalPages = Math.ceil(insumos.length / filasPorPagina);
    pageInfo.textContent = `Página ${paginaActual} de ${totalPages}`;
    btnPrev.disabled = paginaActual === 1;
    btnNext.disabled = paginaActual >= totalPages;
  }


  // =========================================================
  // ✅ Actualizar estado registrado
  // =========================================================
  function actualizarRegistro(id, value) {
    fetch(`${API_BASE_URL}/insumos/${id}/registrado`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ registrado: value })
    })
      .then(res => {
        if (!res.ok) throw new Error();
      })
      .then(() => {
        const item = insumos.find(x => x.id === id);
        if (item) item.registrado = value;

        Swal.fire({
          icon: "success",
          title: value 
            ? "✅ Marcado como registrado" 
            : "❎ Registro quitado",
          timer: 1200,
          showConfirmButton: false
        });
      })
      .catch(() => Swal.fire("Error", "No se pudo actualizar", "error"));
  }


  // =========================================================
  // ✅ Eliminar insumo (admin ONLY)
  // =========================================================
  function eliminarInsumo(id) {
    fetch(`${API_BASE_URL}/insumos/${id}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token }
    })
      .then(res => {
        if (!res.ok) throw new Error();
      })
      .then(() => {
        insumos = insumos.filter(x => x.id !== id);
        mostrarPagina();

        Swal.fire({
          icon: "success",
          title: "✅ Eliminado",
          showConfirmButton: false,
          timer: 1200
        });
      })
      .catch(() => Swal.fire("Error", "No se pudo eliminar", "error"));
  }


  // =========================================================
  // ✅ Listeners filtros
  // =========================================================
  [filtroOT, filtroInsumo].forEach(el => el.addEventListener("input", cargarInsumos));
  [filtroLocalidad, filtroRegistrado, fechaDesde, fechaHasta]
    .forEach(el => el.addEventListener("change", cargarInsumos));

  // Paginación
  btnPrev.onclick = () => {
    if (paginaActual > 1) {
      paginaActual--;
      mostrarPagina();
    }
  };

  btnNext.onclick = () => {
    if (paginaActual * filasPorPagina < insumos.length) {
      paginaActual++;
      mostrarPagina();
    }
  };

});
