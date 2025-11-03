document.addEventListener('DOMContentLoaded', async () => {
  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';
  const token = localStorage.getItem('token');
  if (!token) return window.location.href = "index.html";

  // Verificar rol
  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    const rol = data.rol;
    if (!['admin', 'bodega'].includes(rol)) {
      Swal.fire("Acceso denegado", "No tienes permiso para Inventario", "error");
      return window.location.href = "dashboard.html";
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

  document.getElementById("btnNuevo").addEventListener("click", modalNuevoInsumo);
  document.getElementById("btnImportar").addEventListener("click", modalImportarExcel);
  document.getElementById("btnPlantilla").addEventListener("click", descargarPlantilla);

  // Estado
  const state = {
    page: 1,
    pageSize: 15,
    total: 0,
    q: '',
    tipo: '',
    estado: ''
  };

  // Debounce para búsqueda
  let debounceTimer = null;
  function debounce(fn, delay = 300) {
    return (...args) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fn(...args), delay);
    };
  }

  // Listeners filtros (búsqueda en vivo)
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

  // Cargar datos
  async function cargarInventario() {
    try {
      const params = new URLSearchParams({
        page: state.page,
        pageSize: state.pageSize
      });
      if (state.q) params.append('q', state.q);
      if (state.tipo) params.append('tipo', state.tipo);
      if (state.estado) params.append('estado', state.estado);

      const res = await fetch(`${API_BASE_URL}/inventario/list?` + params.toString(), {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!res.ok) throw new Error('No se pudo cargar inventario');

      const { items, page, pageSize, total } = await res.json();
      state.page = page;
      state.pageSize = pageSize;
      state.total = total;

      renderTabla(items);
      renderPaginacion();

    } catch (err) {
      console.error("Error cargando inventario:", err);
      Swal.fire("Error", "No se pudo obtener inventario", "error");
    }
  }

  function renderTabla(items) {
    tbody.innerHTML = '';
    if (!items || items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8">Sin resultados</td></tr>`;
      return;
    }

    for (const item of items) {
      const color = item.estado === "green" ? "green" :
                    item.estado === "yellow" ? "orange" : "red";

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.codigo}</td>
        <td>${item.nombre}</td>
        <td>${item.tipo}</td>
        <td>${item.unidad ?? "-"}</td>
        <td>${item.stock ?? 0}</td>
        <td>${item.min_stock ?? 0}</td>
        <td style="font-weight:bold;color:${color}">${item.estado.toUpperCase()}</td>
        <td>
          <button class="btn-obs" onclick="modalEditar('${item.codigo}')">Editar</button>
          <button class="btn-obs" onclick="modalStock('${item.codigo}')">Stock</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderPaginacion() {
    const maxPage = Math.ceil(state.total / state.pageSize) || 1;
    pageInfo.textContent = `Página ${state.page} de ${maxPage}`;
    btnPrev.disabled = state.page <= 1;
    btnNext.disabled = state.page >= maxPage;
  }

  // === Acciones ===
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
        <input id="unidad" class="swal2-input" placeholder="Unidad (ej: Unidad, ML, LT)">
        <input id="stock" type="number" class="swal2-input" placeholder="Stock inicial">
        <input id="min_stock" type="number" class="swal2-input" placeholder="Stock mínimo">
      `,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      preConfirm: () => ({
        codigo: document.getElementById('codigo').value.trim(),
        nombre: document.getElementById('nombre').value.trim(),
        tipo: document.getElementById('tipo').value,
        unidad: document.getElementById('unidad').value.trim(),
        stock: document.getElementById('stock').value,
        min_stock: document.getElementById('min_stock').value
      })
    });

    if (!form) return;

    await fetch(`${API_BASE_URL}/inventario/new`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify(form)
    });

    Swal.fire("✅ Guardado", "Insumo creado", "success");
    state.page = 1;
    cargarInventario();
  }

  window.modalStock = async function(codigo) {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: "Bearer " + localStorage.getItem("token") }
    });
    const data = await res.json();
    const esAdmin = data.rol === "admin";

    const { value: form } = await Swal.fire({
      title: `Actualizar stock · ${codigo}`,
      html: `
        <label>Cantidad:</label>
        <input id="qty" type="number" class="swal2-input" placeholder="Ej: 5">

        ${
          esAdmin
          ? `
          <label>Tipo de ajuste:</label>
          <select id="tipo" class="swal2-input">
            <option value="sumar">Sumar</option>
            <option value="restar">Restar</option>
          </select>

          <label>Motivo (obligatorio si resta):</label>
          <input id="motivo" class="swal2-input" placeholder="Ej: Inventario, daño, ajuste...">
          `
          : `<p style="font-size:14px;color:#666;margin-top:8px;">
              Solo puedes agregar stock
            </p>`
        }
      `,
      showCancelButton: true,
      confirmButtonText: "Aplicar",
      preConfirm: () => {
        const qty = Number(document.getElementById("qty").value);
        const tipo = esAdmin ? document.getElementById("tipo").value : "sumar";
        const motivo = esAdmin ? document.getElementById("motivo").value.trim() : "";

        if (!qty || qty <= 0) return Swal.showValidationMessage("Cantidad inválida");
        if (tipo === "restar" && !motivo) return Swal.showValidationMessage("Motivo requerido para restar");

        return { codigo, qty, tipo, motivo };
      }
    });

    if (!form) return;

    await fetch(`${API_BASE_URL}/inventario/stock-adjust`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify(form)
    });

    Swal.fire("✅ Stock actualizado", "", "success");
    cargarInventario();
  };


  window.modalEditar = async function(codigo) {
    // 1) Obtener datos actuales del insumo
    const res = await fetch(`${API_BASE_URL}/inventario/info/${codigo}`, {
      headers: { Authorization: "Bearer " + localStorage.getItem("token") }
    });

    const data = await res.json();
    const { nombre, unidad, min_stock, tipo, esAdmin } = data; // backend enviará esAdmin

    // 2) Modal
    const { value: form } = await Swal.fire({
      title: `Editar ${codigo}`,
      html: `
        <label>Nombre:</label>
        <input id="edit-nombre" class="swal2-input" value="${nombre ?? ''}" placeholder="Nombre">

        <label>Unidad:</label>
        <input id="edit-unidad" class="swal2-input" value="${unidad ?? ''}" placeholder="Unidad (ej: ML, LT, UND)">

        <label>Stock Mínimo:</label>
        <input id="edit-min" type="number" class="swal2-input" value="${min_stock ?? 0}" placeholder="Mínimo">

        ${
          esAdmin
            ? `
              <hr>
              <div style="font-size:13px;color:#444;font-weight:bold;margin-bottom:4px;">Configuración avanzada</div>

              <label>Tipo:</label>
              <select id="edit-tipo" class="swal2-input">
                <option value="STOCK" ${tipo === "STOCK" ? "selected" : ""}>STOCK</option>
                <option value="DIRECTO" ${tipo === "DIRECTO" ? "selected" : ""}>DIRECTO</option>
              </select>

              <label>Nuevo Código (opcional):</label>
              <input id="edit-codigo-new" class="swal2-input" placeholder="Ej: INS050">
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
      }),
    });

    if (!form) return;

    // 3) Enviar cambios
    await fetch(`${API_BASE_URL}/inventario/update/${codigo}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify(form)
    });

    Swal.fire("✅ Actualizado", "Cambios guardados", "success");
    cargarInventario();
  };


  async function modalImportarExcel() {
    const { value: file } = await Swal.fire({
      title: "Importar Excel",
      input: "file",
      inputAttributes: { accept: ".xlsx,.xls" },
      showCancelButton: true
    });
    if (!file) return;

    const form = new FormData();
    form.append("file", file);

    await fetch(`${API_BASE_URL}/inventario/import`, {
      method: "POST",
      headers: { Authorization: "Bearer " + localStorage.getItem("token") },
      body: form
    });

    Swal.fire("✅ Inventario actualizado");
    state.page = 1;
    cargarInventario();
  }

  function descargarPlantilla() {
    // Plantilla con columnas: codigo,nombre,cantidad
    const csv = "codigo,nombre,cantidad\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_inventario.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Primera carga
  cargarInventario();
});
