// =====================================================
// perfiles.js - Accesos → pestaña «Perfiles» (solo admin)
// =====================================================
// Lista los perfiles, muestra qué puede hacer cada uno, y permite crear, duplicar,
// renombrar y eliminar perfiles. Muestra también la bitácora de cambios.
//
// Los permisos de cada módulo todavía NO se editan aquí: los módulos se irán
// activando de uno en uno y hasta entonces se ven con el candado «Pendiente».
//
// También expone window.AccesosPerfiles para que usuarios.js arme el desplegable
// de Rol con los perfiles reales.

document.addEventListener('DOMContentLoaded', () => {

  if (!getToken()) return;   // usuarios.js ya manda al login

  const tablaPerfiles = document.getElementById('tabla-perfiles');
  const tablaAuditoria = document.getElementById('tabla-auditoria');
  const detalle = document.getElementById('perfil-detalle');
  const btnNuevo = document.getElementById('btn-nuevo-perfil');

  const estado = {
    perfiles: null,        // null = todavía no cargó
    sinPerfil: [],         // usuarios con un rol que no es un perfil
    catalogo: null,
    auditoria: [],
    seleccion: null        // clave del perfil cuyo detalle está abierto
  };

  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // Llama a la API y devuelve el JSON; si falla lanza un Error con el mensaje del servidor.
  async function llamar(path, options) {
    const res = await apiFetch(path, options);
    if (!res) throw new Error('Tu sesión venció. Vuelve a iniciar sesión');
    const data = await safeJson(res);
    if (!res.ok) throw new Error((data && data.error) || `No se pudo completar la acción (${res.status})`);
    return data;
  }

  // ===============================
  // Datos
  // ===============================
  async function cargarPerfiles(opciones) {
    const data = await llamar('/perfiles', opciones);
    estado.perfiles = data.perfiles || [];
    estado.sinPerfil = data.usuarios_sin_perfil || [];
    document.dispatchEvent(new CustomEvent('perfiles:cargados'));
  }

  async function cargarCatalogo() {
    if (!estado.catalogo) estado.catalogo = await llamar('/perfiles/catalogo');
  }

  async function cargarAuditoria() {
    const data = await llamar('/perfiles/auditoria?limite=100');
    estado.auditoria = data.auditoria || [];
  }

  const buscar = (clave) => (estado.perfiles || []).find(p => p.clave === clave);
  const nombreDe = (clave) => { const p = buscar(clave); return p ? p.nombre : null; };

  window.AccesosPerfiles = {
    lista: () => estado.perfiles,
    nombreDe,
    refrescar: () => cargarPerfiles()
  };

  // Carga en segundo plano para que la pestaña «Usuarios» muestre los nombres de perfil.
  // Si falla, esa pestaña sigue funcionando como siempre.
  cargarPerfiles({ silencioso: true }).catch(() => {});

  // ===============================
  // Sub-pestañas
  // ===============================
  document.querySelectorAll('.subtab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.subtab-btn[data-tab]').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.subtab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${btn.dataset.tab}`));
      if (btn.dataset.tab === 'perfiles') abrirPestana();
    });
  });

  async function abrirPestana() {
    tablaPerfiles.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
    tablaAuditoria.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
    try {
      await Promise.all([cargarPerfiles(), cargarCatalogo(), cargarAuditoria()]);
    } catch (err) {
      tablaPerfiles.innerHTML = `
        <tr><td colspan="5">
          No se pudieron cargar los perfiles (${esc(err.message)}).
          <button class="btn-obs" data-accion="reintentar">Reintentar</button>
        </td></tr>`;
      tablaAuditoria.innerHTML = '';
      return;
    }
    renderTodo();
  }

  async function recargar() {
    await Promise.all([cargarPerfiles(), cargarAuditoria()]);
    renderTodo();
  }

  function renderTodo() {
    renderPerfiles();
    renderAuditoria();
    renderDetalle();
  }

  // ===============================
  // Tabla de perfiles
  // ===============================
  // Módulos con pantalla propia a los que el perfil puede entrar
  function modulosConAcceso(perfil) {
    if (!estado.catalogo) return '—';
    const set = new Set(perfil.permisos);
    const conVer = estado.catalogo.modulos.filter(m => m.permisos.some(p => p.nivel === 'ver'));
    const entra = conVer.filter(m => set.has(m.permisos.find(p => p.nivel === 'ver').clave)).length;
    return `${entra} de ${conVer.length}`;
  }

  function renderPerfiles() {
    const perfiles = estado.perfiles || [];
    if (!perfiles.length) {
      tablaPerfiles.innerHTML = '<tr><td colspan="5">No hay perfiles</td></tr>';
      return;
    }
    tablaPerfiles.innerHTML = perfiles.map(p => {
      const marcas = [];
      if (p.es_sistema) marcas.push('<span class="perf-chip perf-chip-sistema">Sistema</span>');
      else if (!p.utilizable) marcas.push('<span class="perf-chip perf-chip-alerta" title="Todavía no se puede asignar a nadie: aún no tiene módulos activos">Aún sin módulos activos</span>');

      const acciones = [
        `<button class="btn-obs" data-accion="ver" data-clave="${esc(p.clave)}">Ver permisos</button>`,
        `<button class="btn-obs" data-accion="duplicar" data-clave="${esc(p.clave)}">Duplicar</button>`
      ];
      if (!p.es_sistema) {
        acciones.push(`<button class="btn-obs" data-accion="editar" data-clave="${esc(p.clave)}">Editar</button>`);
        acciones.push(p.usuarios > 0
          ? `<button class="btn-eliminar" disabled title="Tiene ${p.usuarios} usuario(s): cámbiales el perfil primero">Eliminar</button>`
          : `<button class="btn-eliminar" data-accion="eliminar" data-clave="${esc(p.clave)}">Eliminar</button>`);
      }

      return `
        <tr class="${estado.seleccion === p.clave ? 'perf-fila-activa' : ''}">
          <td class="perf-celda-perfil">
            <span class="perf-nombre">${esc(p.nombre)}</span> ${marcas.join('')}
            <span class="perf-clave">${esc(p.clave)}</span>
          </td>
          <td class="perf-desc">${p.descripcion ? esc(p.descripcion) : '<span class="perf-vacio">—</span>'}</td>
          <td class="num-right">${p.usuarios}</td>
          <td class="num-right">${modulosConAcceso(p)}</td>
          <td class="user-actions">${acciones.join('')}</td>
        </tr>`;
    }).join('');

    // Aviso si hay usuarios con un rol que ya no es un perfil
    if (estado.sinPerfil.length) {
      const total = estado.sinPerfil.reduce((s, x) => s + x.usuarios, 0);
      const roles = estado.sinPerfil.map(x => `${esc(x.rol)} (${x.usuarios})`).join(', ');
      tablaPerfiles.insertAdjacentHTML('beforeend', `
        <tr><td colspan="5"><span class="perf-chip perf-chip-alerta">Atención</span>
        ${total} usuario(s) tienen un rol que no es un perfil: ${roles}. Asígnales un perfil desde la pestaña Usuarios.</td></tr>`);
    }
  }

  tablaPerfiles.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-accion]');
    if (!btn) return;
    const { accion, clave } = btn.dataset;
    if (accion === 'reintentar') return abrirPestana();
    if (accion === 'ver') return mostrarDetalle(clave);
    if (accion === 'duplicar') return modalPerfil({ base: buscar(clave) });
    if (accion === 'editar') return modalEditar(buscar(clave));
    if (accion === 'eliminar') return eliminarPerfil(buscar(clave));
  });

  // ===============================
  // Detalle: qué puede hacer el perfil
  // ===============================
  function mostrarDetalle(clave) {
    estado.seleccion = clave;
    renderPerfiles();
    renderDetalle();
    detalle.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function filaModulo(m, set) {
    const ver = m.permisos.find(p => p.nivel === 'ver');
    const editar = m.permisos.find(p => p.nivel === 'editar');

    let acceso;
    let ayudaEditar = '';
    let nivel = null;
    if (ver) {
      nivel = !set.has(ver.clave) ? 'ninguno' : (editar && set.has(editar.clave) ? 'editar' : 'ver');
      const texto = { ninguno: 'Sin acceso', ver: 'Solo ver', editar: 'Ver y editar' }[nivel];
      acceso = `<span class="perf-nivel perf-nivel-${nivel}">${texto}</span>`;
      if (nivel === 'editar') ayudaEditar = `<span class="perf-ayuda-fila">${esc(editar.etiqueta)}</span>`;
    } else {
      const alguno = m.permisos.some(p => set.has(p.clave));
      acceso = `<span class="perf-nivel perf-nivel-${alguno ? 'editar' : 'ninguno'}">${alguno ? 'Sí' : 'No'}</span>`;
    }

    // Casillas «extra» y limitaciones que tiene el perfil
    const chips = m.permisos
      .filter(p => set.has(p.clave) && (p.nivel === 'extra' || p.nivel === 'restriccion' || p.nivel === 'solo_admin'))
      .map(p => `<span class="perf-chip${p.nivel === 'restriccion' ? ' perf-chip-limite' : ''}">${esc(p.etiqueta)}</span>`)
      .join('');

    const marca = m.fijo
      ? '<span class="perf-chip perf-chip-sistema" title="Solo el administrador puede tenerlo">Solo administrador</span>'
      : (m.migrado ? '' :
        '<span class="perf-pendiente" title="Este módulo todavía usa los permisos de siempre. Se podrá cambiar desde aquí cuando se active.">🔒 Pendiente</span>');

    return `
      <tr class="${nivel === 'ninguno' ? 'perf-fila-sin' : ''}">
        <td><strong>${esc(m.nombre)}</strong>${marca}</td>
        <td>${acceso}${ayudaEditar}</td>
        <td class="perf-chips">${chips || '<span class="perf-vacio">—</span>'}</td>
      </tr>`;
  }

  function renderDetalle() {
    const p = estado.seleccion && buscar(estado.seleccion);
    if (!p || !estado.catalogo) {
      detalle.hidden = true;
      detalle.innerHTML = '';
      return;
    }
    const set = new Set(p.permisos);
    const porGrupo = {};
    estado.catalogo.modulos.forEach(m => { (porGrupo[m.grupo] = porGrupo[m.grupo] || []).push(m); });

    const filas = estado.catalogo.grupos.map(g => `
      <tr class="perf-grupo"><td colspan="3">${esc(g)}</td></tr>
      ${(porGrupo[g] || []).map(m => filaModulo(m, set)).join('')}`).join('');

    let nota = '';
    if (p.es_sistema) {
      nota = '<p class="perf-nota">Administrador: acceso total a todo el sistema. No se puede cambiar.</p>';
    } else if (!p.utilizable) {
      nota = '<p class="perf-nota perf-nota-alerta">Este perfil es nuevo: todavía no puede entrar a ningún módulo. Empezará a servir a medida que se vayan activando los módulos.</p>';
    }

    detalle.innerHTML = `
      <div class="perf-detalle-cab">
        <h3>Permisos de «${esc(p.nombre)}»</h3>
        <button class="btn-obs" id="perf-cerrar">Cerrar</button>
      </div>
      ${nota}
      <div class="tabla-estandar-wrap">
        <table class="tabla-estandar perf-wrap">
          <thead><tr><th>Módulo</th><th>Acceso</th><th>Además puede / limitaciones</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;
    detalle.hidden = false;
    document.getElementById('perf-cerrar').onclick = () => {
      estado.seleccion = null;
      renderPerfiles();
      renderDetalle();
    };
  }

  // ===============================
  // Bitácora
  // ===============================
  const ACCIONES = {
    crear_perfil: 'Creó un perfil',
    editar_perfil: 'Editó un perfil',
    eliminar_perfil: 'Eliminó un perfil',
    crear_usuario: 'Creó un usuario',
    cambiar_perfil_usuario: 'Cambió el perfil de un usuario',
    eliminar_usuario: 'Eliminó un usuario'
  };

  function textoDetalle(a) {
    const d = a.detalle || {};
    const nombre = (clave) => esc(nombreDe(clave) || clave);
    switch (a.accion) {
      case 'crear_perfil':
        return `«${esc(d.nombre)}»` + (d.copiado_de ? ` (copiado de ${nombre(d.copiado_de)}, ${d.permisos} permisos)` : '');
      case 'editar_perfil': {
        const partes = [];
        if (d.nombre) partes.push(`Nombre: «${esc(d.nombre.de)}» → «${esc(d.nombre.a)}»`);
        if (d.descripcion) partes.push('Descripción cambiada');
        return partes.join(' · ');
      }
      case 'eliminar_perfil':
        return `«${esc(d.nombre)}» (tenía ${(d.permisos || []).length} permisos)`;
      case 'crear_usuario':
        return `${esc(d.usuario)} con el perfil ${nombre(a.perfil_clave)} (${esc(d.localidad)})`;
      case 'cambiar_perfil_usuario':
        return `${esc(d.usuario)}: ${nombre(d.de)} → ${nombre(d.a)}`;
      case 'eliminar_usuario':
        return `${esc(d.usuario)} (tenía el perfil ${nombre(a.perfil_clave)})`;
      default:
        return '';
    }
  }

  function renderAuditoria() {
    if (!estado.auditoria.length) {
      tablaAuditoria.innerHTML = '<tr><td colspan="4">Todavía no hay cambios registrados</td></tr>';
      return;
    }
    tablaAuditoria.innerHTML = estado.auditoria.map(a => `
      <tr>
        <td>${esc(new Date(a.fecha).toLocaleString('es-EC'))}</td>
        <td>${esc(a.usuario)}</td>
        <td>${esc(ACCIONES[a.accion] || a.accion)}</td>
        <td>${textoDetalle(a)}</td>
      </tr>`).join('');
  }

  // ===============================
  // Crear / duplicar
  // ===============================
  btnNuevo.onclick = () => modalPerfil({});

  async function modalPerfil({ base }) {
    const opciones = (estado.perfiles || []).map(p =>
      `<option value="${esc(p.clave)}" ${base && base.clave === p.clave ? 'selected' : ''}>${esc(p.nombre)}</option>`
    ).join('');

    const r = await Swal.fire({
      title: base ? `Duplicar «${base.nombre}»` : 'Nuevo perfil',
      html: `
        <div class="form-group">
          <label>Nombre del perfil</label>
          <input id="perf-nombre" class="swal2-input" maxlength="60" placeholder="Ej: Jefe de taller" value="${esc(base ? `Copia de ${base.nombre}`.slice(0, 60) : '')}">
        </div>
        <div class="form-group">
          <label>Descripción (opcional)</label>
          <input id="perf-descripcion" class="swal2-input" maxlength="300" placeholder="Para qué sirve este perfil" value="${esc(base ? base.descripcion : '')}">
        </div>
        <div class="form-group">
          <label>Copiar los permisos de</label>
          <select id="perf-copiar" class="swal2-select">
            <option value="">— Empezar en blanco —</option>
            ${opciones}
          </select>
        </div>
        <p class="perf-nota-modal">Un perfil nuevo empieza a servir a medida que se activan los módulos (se hace de uno en uno).</p>
      `,
      showCancelButton: true,
      confirmButtonText: base ? 'Duplicar' : 'Crear',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      preConfirm: () => {
        const nombre = document.getElementById('perf-nombre').value.trim();
        if (nombre.length < 2) {
          Swal.showValidationMessage('El nombre debe tener al menos 2 caracteres');
          return false;
        }
        return {
          nombre,
          descripcion: document.getElementById('perf-descripcion').value.trim(),
          copiar_de: document.getElementById('perf-copiar').value || undefined
        };
      }
    });
    if (!r.isConfirmed) return;

    try {
      const data = await llamar('/perfiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r.value)
      });
      estado.seleccion = data.perfil.clave;
      Swal.fire({ icon: 'success', title: 'Perfil creado', text: data.perfil.nombre, timer: 1400, showConfirmButton: false });
      await recargar();      // la lista se actualiza sin esperar a que se cierre el aviso
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  }

  // ===============================
  // Editar nombre y descripción
  // ===============================
  async function modalEditar(p) {
    if (!p) return;
    const r = await Swal.fire({
      title: 'Editar perfil',
      html: `
        <div class="form-group">
          <label>Nombre del perfil</label>
          <input id="perf-nombre" class="swal2-input" maxlength="60" value="${esc(p.nombre)}">
        </div>
        <div class="form-group">
          <label>Descripción</label>
          <input id="perf-descripcion" class="swal2-input" maxlength="300" value="${esc(p.descripcion)}">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      preConfirm: () => {
        const nombre = document.getElementById('perf-nombre').value.trim();
        if (nombre.length < 2) {
          Swal.showValidationMessage('El nombre debe tener al menos 2 caracteres');
          return false;
        }
        return { nombre, descripcion: document.getElementById('perf-descripcion').value.trim() };
      }
    });
    if (!r.isConfirmed) return;

    try {
      await llamar(`/perfiles/${encodeURIComponent(p.clave)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r.value)
      });
      Swal.fire({ icon: 'success', title: 'Perfil actualizado', timer: 1200, showConfirmButton: false });
      await recargar();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  }

  // ===============================
  // Eliminar
  // ===============================
  async function eliminarPerfil(p) {
    if (!p) return;
    const r = await Swal.fire({
      title: `¿Eliminar el perfil «${p.nombre}»?`,
      text: 'Esta acción no se puede deshacer',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!r.isConfirmed) return;

    try {
      await llamar(`/perfiles/${encodeURIComponent(p.clave)}`, { method: 'DELETE' });
      if (estado.seleccion === p.clave) estado.seleccion = null;
      Swal.fire({ icon: 'success', title: 'Perfil eliminado', timer: 1200, showConfirmButton: false });
      await recargar();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  }

});
