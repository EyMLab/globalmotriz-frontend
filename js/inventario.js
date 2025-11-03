document.addEventListener('DOMContentLoaded', async () => {
  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';
  const token = localStorage.getItem('token');
  if (!token) return window.location.href = "index.html";

  // ✅ Variables de rol declaradas antes de usarse
  let esAdmin = false;
  let esBodega = false;
  let esAsesor = false;

  // ✅ Verificar rol
  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    const rol = data.rol;

    esAdmin  = rol === 'admin';
    esBodega = rol === 'bodega';
    esAsesor = rol === 'asesor';

    if (!esAdmin && !esBodega && !esAsesor) {
      Swal.fire("Acceso denegado", "No tienes permiso para Inventario", "error");
      return window.location.href = "dashboard.html";
    }

    // ✅ Ocultar botones de acciones para asesor
    if (esAsesor) {
      ["btnNuevo","btnImportar","btnPlantilla"].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = "none";
      });

      const thAcciones = document.querySelector(".col-acciones");
      if (thAcciones) thAcciones.style.display = "none";
    }
  } catch {
    Swal.fire("Error", "No se pudo verificar el usuario", "error");
    return window.location.href = "index.html";
  }

  // DOM
  const tbody = document.getElementById('tablaInventario');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const pageInfo = document.getElementById('page-info');
  const inputQ = document.getElementById('filtro-q');
  const selTipo = document.getElementById('filtro-tipo');
  const selEstado = document.getElementById('filtro-estado');

  // ✅ Solo Admin y Bodega activan botones
  if (!esAsesor) {
    document.getElementById("btnNuevo")?.addEventListener("click", modalNuevoInsumo);
    document.getElementById("btnImportar")?.addEventListener("click", modalImportarExcel);
    document.getElementById("btnPlantilla")?.addEventListener("click", descargarPlantilla);
  }

  // Estado
  const state = {
    page: 1,
    pageSize: 15,
    total: 0,
    q: '',
    tipo: '',
    estado: ''
  };

  // Debounce
  let debounceTimer;
  function debounce(fn, delay = 300) {
    return (...args) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fn(...args), delay);
    };
  }

  // Filtros
  inputQ.addEventListener('input', debounce(() => {
    state.q = inputQ.value.trim();
    state.page = 1;
    cargarInventario();
  }));

  selTipo.addEventListener('change', () => {
    state.tipo = selTipo.value;
    state.page = 1;
    cargarInventario();
  });

  selEstado.addEventListener('change', () => {
    state.estado = selEstado.value;
    state.page = 1;
    cargarInventario();
  });

  // Paginación
  btnPrev.addEventListener('click', () => {
    if (state.page > 1) {
      state.page--;
      cargarInventario();
    }
  });

  btnNext.addEventListener('click', () => {
    const maxPage = Math.ceil(state.total / state.pageSize);
    if (state.page < maxPage) {
      state.page++;
      cargarInventario();
    }
  });

  // ✅ Cargar Inventario
  async function cargarInventario() {
    try {
      const params = new URLSearchParams({
        page: state.page,
        pageSize: state.pageSize
      });
      if (state.q) params.append('q', state.q);
      if (state.tipo) params.append('tipo', state.tipo);
      if (state.estado) params.append('estado', state.estado);

      const res = await fetch(`${API_BASE_URL}/inventario/list?${params}`, {
        headers: { Authorization: "Bearer " + token }
      });

      if (!res.ok) throw new Error();

      const { items, page, pageSize, total } = await res.json();
      state.page = page;
      state.pageSize = pageSize;
      state.total = total;

      renderTabla(items);
      renderPaginacion();
    } catch (err) {
      Swal.fire("Error", "No se pudo obtener inventario", "error");
    }
  }

  function renderTabla(items) {
    tbody.innerHTML = '';

    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="${esAsesor ? 7 : 8}">Sin resultados</td></tr>`;
      return;
    }

    items.forEach(item => {
      const estado = item.estado || 'red'; // fallback
      const color = estado === "green" ? "green" :
                    estado === "yellow" ? "orange" : "red";

      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td>${item.codigo}</td>
        <td>${item.nombre}</td>
        <td>${item.tipo}</td>
        <td>${item.unidad ?? "-"}</td>
        <td>${item.stock ?? 0}</td>
        <td>${item.min_stock ?? 0}</td>
        <td style="font-weight:bold;color:${color}">
          ${(estado || "").toUpperCase()}
        </td>

        ${
          esAsesor
          ? ""
          : `<td>
              <button class="btn-obs" onclick="modalEditar('${item.codigo}')">Editar</button>
              <button class="btn-obs" onclick="modalStock('${item.codigo}')">Stock</button>
              ${esAdmin ? `<button class="btn-danger" onclick="modalEliminar('${item.codigo}')">Eliminar</button>` : ""}
            </td>`
        }
      `;

      tbody.appendChild(tr);
    });
  }


  function renderPaginacion() {
    const maxPage = Math.ceil(state.total / state.pageSize) || 1;
    pageInfo.textContent = `Página ${state.page} de ${maxPage}`;
    btnPrev.disabled = state.page <= 1;
    btnNext.disabled = state.page >= maxPage;
  }

  // === Modales ===

  async function modalNuevoInsumo() {
    const { value: form } = await Swal.fire({
      title: "Nuevo Insumo",
      html: `
        <input id="codigo" class="swal2-input" placeholder="Código">
        <input id="nombre" class="swal2-input" placeholder="Nombre">
        <select id="tipo" class="swal2-input">
          <option value="STOCK">STOCK</option>
          <option value="DIRECTO">DIRECTO</option>
        </select>
        <input id="unidad" class="swal2-input" placeholder="Unidad (ML, LT, UND)">
        <input id="stock" type="number" class="swal2-input" placeholder="Stock inicial">
        <input id="min_stock" type="number" class="swal2-input" placeholder="Stock mínimo">
      `,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      preConfirm: () => ({
        codigo: codigo.value.trim(),
        nombre: nombre.value.trim(),
        tipo: tipo.value,
        unidad: unidad.value.trim(),
        stock: stock.value,
        min_stock: min_stock.value
      })
    });

    if (!form) return;

    await fetch(`${API_BASE_URL}/inventario/new`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify(form)
    });

    Swal.fire("✅ Guardado", "Insumo creado", "success");
    cargarInventario();
  }

  window.modalStock = async codigo => {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: "Bearer " + token }
    });
    const data = await res.json();
    const esAdmin = data.rol === "admin";

    const { value: form } = await Swal.fire({
      title: `Actualizar stock · ${codigo}`,
      html: `
        <label>Cantidad:</label>
        <input id="qty" type="number" class="swal2-input">

        ${
          esAdmin
            ? `
            <label>Tipo:</label>
            <select id="tipo" class="swal2-input">
              <option value="sumar">Sumar</option>
              <option value="restar">Restar</option>
            </select>
            <label>Motivo (si resta):</label>
            <input id="motivo" class="swal2-input">
            `
            : `<p style="font-size:14px;color:#666;margin-top:6px;">Solo puedes sumar</p>`
        }
      `,
      showCancelButton: true,
      confirmButtonText: "Aplicar",
      preConfirm: () => {
        const qty = Number(document.getElementById("qty").value);
        const tipo = esAdmin ? document.getElementById("tipo").value : "sumar";
        const motivo = esAdmin ? document.getElementById("motivo").value.trim() : "";

        if (!qty || qty <= 0) return Swal.showValidationMessage("Cantidad inválida");
        if (tipo === "restar" && !motivo) return Swal.showValidationMessage("Motivo requerido");

        return { codigo, qty, tipo, motivo };
      }
    });

    if (!form) return;

    await fetch(`${API_BASE_URL}/inventario/stock-adjust`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify(form)
    });

    Swal.fire("✅ Stock actualizado");
    cargarInventario();
  };

  window.modalEliminar = async codigo => {
    const confirm = await Swal.fire({
      title: "Eliminar insumo",
      html: `<b>${codigo}</b><br>¿Seguro?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Sí, eliminar"
    });

    if (!confirm.isConfirmed) return;

    const res = await fetch(`${API_BASE_URL}/inventario/${codigo}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token }
    });

    const data = await res.json();
    if (!res.ok) return Swal.fire("Error", data.error, "error");

    Swal.fire("✅ Eliminado", data.message, "success");
    cargarInventario();
  };

  window.modalEditar = async codigo => {
    const res = await fetch(`${API_BASE_URL}/inventario/info/${codigo}`, {
      headers: { Authorization: "Bearer " + token }
    });

    const data = await res.json();
    const { nombre, unidad, min_stock, tipo, esAdmin } = data;

    const { value: form } = await Swal.fire({
      title: `Editar ${codigo}`,
      html: `
        <label>Nombre:</label>
        <input id="edit-nombre" class="swal2-input" value="${nombre ?? ''}">

        <label>Unidad:</label>
        <input id="edit-unidad" class="swal2-input" value="${unidad ?? ''}">

        <label>Stock Mínimo:</label>
        <input id="edit-min" type="number" class="swal2-input" value="${min_stock ?? 0}">
        
        ${
          esAdmin
            ? `
              <hr>
              <label>Tipo:</label>
              <select id="edit-tipo" class="swal2-input">
                <option value="STOCK" ${tipo==="STOCK"?"selected":""}>STOCK</option>
                <option value="DIRECTO" ${tipo==="DIRECTO"?"selected":""}>DIRECTO</option>
              </select>
              <label>Nuevo código:</label>
              <input id="edit-codigo-new" class="swal2-input">
            `
            : ""
        }
      `,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      preConfirm: () => ({
        nombre: document.getElementById("edit-nombre").value.trim(),
        unidad: document.getElementById("edit-unidad").value.trim(),
        min_stock: Number(document.getElementById("edit-min").value),
        tipo: esAdmin ? document.getElementById("edit-tipo").value : undefined,
        newCodigo: esAdmin ? document.getElementById("edit-codigo-new").value.trim() : undefined
      })
    });

    if (!form) return;

    await fetch(`${API_BASE_URL}/inventario/update/${codigo}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify(form)
    });

    Swal.fire("✅ Guardado");
    cargarInventario();
  };

  // ✅ Nueva versión segura para descargar plantilla
  // ✅ Descargar plantilla Excel
async function descargarPlantilla() {
  const res = await fetch(`${API_BASE_URL}/inventario/plantilla`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) return Swal.fire("Error", "No se pudo descargar", "error");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla_inventario.xlsx";
  a.click();
  window.URL.revokeObjectURL(url);
}

// ✅ Importar Excel
async function modalImportarExcel() {
  const { value: file } = await Swal.fire({
    title: "Importar inventario",
    html: `
      <p style="font-size:14px;margin-bottom:6px">Seleccione archivo .xlsx</p>
      <input type="file" id="fileExcel" class="swal2-file" accept=".xlsx">
    `,
    showCancelButton: true,
    confirmButtonText: "Subir",
    preConfirm: () => {
      const fileInput = document.getElementById("fileExcel");
      if (!fileInput.files.length) {
        Swal.showValidationMessage("Seleccione un archivo");
      }
      return fileInput.files[0];
    }
  });

  if (!file) return;

  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(`${API_BASE_URL}/inventario/import`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: fd
  });

  const data = await res.json();
  if (!res.ok) return Swal.fire("Error", data.error, "error");

  Swal.fire("✅ Importado", "Inventario actualizado", "success");
  cargarInventario();
}


  // ✅ Primera carga
  cargarInventario();
});
