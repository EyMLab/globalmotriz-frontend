// ======================================================
// tablet-app.js — Lógica principal de la PWA tablet
// ======================================================

// --- Estado global ---
let currentScreen = 'config';
let empleadoActual = null;   // {id, nombre, apellido, cargo, tag_uid}
let insumoActual = null;     // {codigo, nombre, tipo, unidad, stock_actual, stock_minimo}
let cantidadActual = '';
let otActual = '';
let localidad = '';
let deviceKey = '';
let rfidBuffer = '';
let rfidTimer = null;
let inactivityTimer = null;
const INACTIVITY_TIMEOUT = 60000;
const RESULT_TIMEOUT = 5000;
let syncInterval = null;
let listaItems = [];

// --- Elementos DOM ---
const el = (id) => document.getElementById(id);

// --- Inicialización ---
document.addEventListener('DOMContentLoaded', async () => {
  await openDB();

  localidad = await getConfig('localidad');
  deviceKey = await getConfig('deviceKey', 'devkey123');

  if (!localidad) {
    showScreen('config');
  } else {
    el('label-localidad').textContent = localidad;
    showScreen('espera');
    initRfidListener();
    scheduleSync();
  }

  setupEventListeners();
  updateConnectionStatus();

  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
});

// --- Pantallas ---

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screenEl = document.getElementById(`screen-${name}`);
  if (screenEl) screenEl.classList.add('active');
  currentScreen = name;

  const cancelBtn = el('btn-cancelar-flotante');
  const showCancel = ['buscar', 'cantidad', 'ot'].includes(name);
  cancelBtn.classList.toggle('visible', showCancel);

  el('btn-ver-pedido').classList.toggle('visible', name === 'buscar' && listaItems.length > 0);

  resetInactivityTimer();
}

// --- Configuración ---

function setupConfigScreen() {
  el('btn-guardar-config').addEventListener('click', async () => {
    const loc = el('cfg-localidad').value;
    const dk = el('cfg-device-key').value.trim() || 'devkey123';

    if (!loc) return;

    await setConfig('localidad', loc);
    await setConfig('deviceKey', dk);

    localidad = loc;
    deviceKey = dk;

    el('label-localidad').textContent = localidad;
    el('cfg-status').textContent = 'Sincronizando datos...';
    el('btn-guardar-config').disabled = true;

    try {
      if (estaOnline()) {
        const result = await syncCompleto(deviceKey, localidad);
        el('cfg-status').textContent =
          `Sincronizado: ${result.empleados} empleados, ${result.catalogo} insumos`;
      } else {
        el('cfg-status').textContent = 'Guardado. Se sincronizará cuando haya internet.';
      }
    } catch (e) {
      el('cfg-status').textContent = 'Error al sincronizar: ' + e.message;
    }

    el('btn-guardar-config').disabled = false;

    setTimeout(() => {
      showScreen('espera');
      initRfidListener();
      scheduleSync();
    }, 1500);
  });

  el('btn-config-bar').addEventListener('click', () => {
    el('admin-clave').value = '';
    el('admin-error').style.display = 'none';
    el('modal-admin').classList.add('active');
    setTimeout(() => el('admin-clave').focus(), 100);
  });
}

// --- Lector RFID vía BLE HID (teclado Bluetooth) ---

function initRfidListener() {
  el('dot-ws').className = 'status-dot bt-idle';
  el('label-ws').textContent = 'BT';

  window.addEventListener('keydown', handleRfidKeydown);
}

function handleRfidKeydown(e) {
  if (currentScreen !== 'espera') {
    rfidBuffer = '';
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    if (rfidBuffer.length >= 4) {
      const uid = rfidBuffer;
      rfidBuffer = '';
      clearTimeout(rfidTimer);
      handleTagRead(uid);
    }
    return;
  }

  if (e.key.length === 1) {
    e.preventDefault();
    rfidBuffer += e.key.toUpperCase();
    clearTimeout(rfidTimer);
    rfidTimer = setTimeout(() => { rfidBuffer = ''; }, 500);
  }
}

// --- Tag leído (WebSocket o simulación) ---

async function handleTagRead(uid) {
  if (currentScreen !== 'espera') return;

  el('dot-ws').className = 'status-dot ws-connected';
  el('label-ws').textContent = 'BT: tag';
  setTimeout(() => {
    el('dot-ws').className = 'status-dot bt-idle';
    el('label-ws').textContent = 'BT';
  }, 3000);

  const empleado = await buscarEmpleadoPorTag(uid);

  if (!empleado) {
    showResultado('error', 'TAG no registrado', `UID: ${uid}`);
    return;
  }

  empleadoActual = empleado;
  showBienvenida();
}

function showBienvenida() {
  el('nombre-empleado').textContent = `${empleadoActual.nombre} ${empleadoActual.apellido}`;
  showScreen('bienvenida');

  setTimeout(() => {
    if (currentScreen === 'bienvenida') {
      showBuscarInsumo();
    }
  }, 2000);
}

// --- Admin modal (proteger config) ---

function setupAdminModal() {
  el('admin-ok').addEventListener('click', () => {
    const clave = el('admin-clave').value.trim();
    if (clave === deviceKey) {
      el('modal-admin').classList.remove('active');
      el('cfg-localidad').value = localidad || 'MATRIZ';
      el('cfg-device-key').value = deviceKey || 'devkey123';
      el('cfg-status').textContent = '';
      showScreen('config');
    } else {
      el('admin-error').style.display = '';
    }
  });

  el('admin-cancelar').addEventListener('click', () => {
    el('modal-admin').classList.remove('active');
  });

  el('admin-clave').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el('admin-ok').click();
  });
}

// --- Buscar insumo ---

function showBuscarInsumo() {
  el('buscar-empleado-nombre').textContent = `${empleadoActual.nombre} ${empleadoActual.apellido}`;
  el('buscar-input').value = '';
  el('resultados-lista').innerHTML = '';
  showScreen('buscar');
  el('buscar-input').focus();
  renderResultados('');
  updateListaBadge();
}

function getStockReservado(codigo) {
  return listaItems
    .filter(item => item.insumo.codigo === codigo)
    .reduce((sum, item) => sum + item.cantidad, 0);
}

function agregarALista() {
  listaItems.push({
    insumo: { ...insumoActual },
    cantidad: Number(cantidadActual),
    ot: otActual
  });
  showToast(`${insumoActual.nombre} x${cantidadActual} agregado`);
  insumoActual = null;
  cantidadActual = '';
  otActual = '';
  showBuscarInsumo();
}

function showToast(message) {
  const toast = el('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2000);
}

function updateListaBadge() {
  el('pedido-count').textContent = listaItems.length;
  el('btn-ver-pedido').classList.toggle('visible', currentScreen === 'buscar' && listaItems.length > 0);
}

async function renderResultados(query) {
  const resultados = await buscarInsumos(query);
  const lista = el('resultados-lista');
  lista.innerHTML = '';

  if (resultados.length === 0) {
    lista.innerHTML = '<p style="text-align:center;color:var(--text-dim);padding:24px">No se encontraron insumos</p>';
    return;
  }

  resultados.forEach(item => {
    const stock = Number(item.stock_actual) - getStockReservado(item.codigo);
    const min = Number(item.stock_minimo);
    let stockClass = 'stock-green';
    if (stock <= min) stockClass = 'stock-red';
    else if (stock <= min * 1.2) stockClass = 'stock-yellow';

    const div = document.createElement('div');
    div.className = 'resultado-item';
    div.innerHTML = `
      <div class="resultado-info">
        <div class="codigo">${item.codigo}</div>
        <div class="nombre">${item.nombre}</div>
        <div class="tipo-unidad">${item.tipo} · ${item.unidad || '—'}</div>
      </div>
      <div class="resultado-stock ${stockClass}">
        <div class="stock-num">${stock}</div>
        <div class="stock-label">disponible</div>
      </div>
    `;
    div.addEventListener('click', () => {
      insumoActual = item;
      showCantidad();
    });
    lista.appendChild(div);
  });
}

function setupBuscador() {
  let debounceTimer;
  el('buscar-input').addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      renderResultados(e.target.value);
    }, 200);
    resetInactivityTimer();
  });
}

// --- Cantidad ---

function showCantidad() {
  cantidadActual = '';
  el('cant-insumo-nombre').textContent = `${insumoActual.codigo} — ${insumoActual.nombre}`;

  const stock = Number(insumoActual.stock_actual) - getStockReservado(insumoActual.codigo);
  const es999 = insumoActual.codigo === 'INS999';
  el('cant-stock-info').textContent = es999 ? 'Stock ilimitado' : `Disponible: ${stock} ${insumoActual.unidad || ''}`;

  updateCantDisplay();
  showScreen('cantidad');
}

function updateCantDisplay() {
  el('cant-display').textContent = cantidadActual || '_';
}

function handleCantInput(val) {
  if (val === 'borrar') {
    cantidadActual = cantidadActual.slice(0, -1);
    updateCantDisplay();
    return;
  }

  if (val === 'ok') {
    if (!cantidadActual || Number(cantidadActual) <= 0) return;

    const stockDisponible = Number(insumoActual.stock_actual) - getStockReservado(insumoActual.codigo);
    const qty = Number(cantidadActual);
    const es999 = insumoActual.codigo === 'INS999';

    if (!es999 && qty > stockDisponible) {
      el('cant-stock-info').textContent = `Sin stock suficiente (disponible: ${stockDisponible})`;
      el('cant-stock-info').style.color = 'var(--red)';
      setTimeout(() => {
        el('cant-stock-info').style.color = '';
        el('cant-stock-info').textContent = `Disponible: ${stockDisponible} ${insumoActual.unidad || ''}`;
      }, 2000);
      return;
    }

    const esStock = insumoActual.tipo === 'STOCK' || es999;
    if (esStock) {
      otActual = '0000';
      agregarALista();
    } else {
      showOT();
    }
    return;
  }

  if (cantidadActual.length < 4) {
    cantidadActual += val;
    updateCantDisplay();
  }
}

// --- Orden de Trabajo ---

function showOT() {
  otActual = '';
  updateOTDisplay();
  showScreen('ot');
}

function updateOTDisplay() {
  const chars = otActual.padEnd(4, '_').split('');
  el('ot-display').textContent = chars.join(' ');
}

async function handleOTInput(val) {
  if (val === 'borrar') {
    otActual = otActual.slice(0, -1);
    updateOTDisplay();
    return;
  }

  if (val === 'ok') {
    if (otActual.length !== 4) return;

    const check = await validarOtLocal(otActual);
    if (!check.permitido) {
      el('ot-display').textContent = `RECHAZADO`;
      el('ot-display').style.color = 'var(--red)';
      const msg = check.encontrada === false
        ? `Orden ${otActual} no existe`
        : `Orden ${otActual} está ${check.estado}`;
      showToast(msg);
      setTimeout(() => {
        otActual = '';
        updateOTDisplay();
        el('ot-display').style.color = '';
      }, 3000);
      return;
    }

    agregarALista();
    return;
  }

  if (otActual.length < 4) {
    otActual += val;
    updateOTDisplay();
  }
}

// --- Resumen ---

function showPedido() {
  if (listaItems.length === 0) return;
  el('res-empleado').textContent = `${empleadoActual.nombre} ${empleadoActual.apellido}`;
  el('res-localidad').textContent = localidad;

  const lista = el('lista-pedido');
  lista.innerHTML = '';

  listaItems.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'pedido-item';
    div.innerHTML = `
      <div class="pedido-item-info">
        <span class="pedido-codigo">${item.insumo.codigo}</span>
        <span class="pedido-nombre">${item.insumo.nombre}</span>
      </div>
      <div class="pedido-item-detalle">
        <span class="pedido-cant">x${item.cantidad}</span>
        <span class="pedido-ot">OT: ${item.ot}</span>
      </div>
      <button class="pedido-item-remove" data-index="${index}">✕</button>
    `;
    lista.appendChild(div);
  });

  lista.querySelectorAll('.pedido-item-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      eliminarDeLista(Number(e.target.dataset.index));
    });
  });

  showScreen('resumen');
}

function eliminarDeLista(index) {
  listaItems.splice(index, 1);
  if (listaItems.length === 0) {
    showBuscarInsumo();
  } else {
    showPedido();
  }
}

// --- Enviar registro ---

async function enviarRegistro() {
  if (listaItems.length === 0) return;

  const registros = listaItems.map(item => ({
    orden_trabajo: item.ot,
    codigo_barras: item.insumo.codigo,
    cantidad: item.cantidad,
    localidad: localidad,
    empleado_id: empleadoActual.id
  }));

  const totalItems = listaItems.length;
  const resumen = listaItems.map(i => `${i.insumo.nombre} x${i.cantidad}`).join(', ');

  if (estaOnline()) {
    try {
      await enviarRegistrosBatch(registros, deviceKey);
      for (const item of listaItems) {
        await decrementarStockLocal(item.insumo.codigo, item.cantidad);
      }
      listaItems = [];
      showResultado('ok', 'Pedido registrado', `${totalItems} item(s): ${resumen}`);
    } catch (e) {
      await guardarTodoOffline(registros);
    }
  } else {
    await guardarTodoOffline(registros);
  }
}

async function guardarTodoOffline(registros) {
  for (const reg of registros) {
    await agregarPendiente(reg);
    await decrementarStockLocal(reg.codigo_barras, reg.cantidad);
  }
  listaItems = [];
  const pendientes = await contarPendientes();
  updatePendientesBadge(pendientes);
  showResultado('offline', 'Guardado offline', `${registros.length} item(s), ${pendientes} pendiente(s)`);
}

// --- Resultado ---

function showResultado(tipo, titulo, mensaje) {
  const icons = { ok: '&#9989;', offline: '&#128992;', error: '&#10060;' };
  const resultEl = document.getElementById('screen-resultado');
  resultEl.className = `screen screen-resultado resultado-${tipo}`;

  el('resultado-icon').innerHTML = icons[tipo] || '';
  el('resultado-titulo').textContent = titulo;
  el('resultado-mensaje').textContent = mensaje;
  showScreen('resultado');

  setTimeout(() => {
    if (currentScreen === 'resultado') {
      reiniciar();
    }
  }, RESULT_TIMEOUT);
}

// --- Reiniciar flujo ---

function reiniciar() {
  empleadoActual = null;
  insumoActual = null;
  cantidadActual = '';
  otActual = '';
  listaItems = [];
  showScreen('espera');
}

// --- Inactividad ---

function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);

  if (['buscar', 'cantidad', 'ot', 'resumen'].includes(currentScreen)) {
    inactivityTimer = setTimeout(() => {
      reiniciar();
    }, INACTIVITY_TIMEOUT);
  }
}

// --- Conexión ---

function updateConnectionStatus() {
  const online = estaOnline();
  el('dot-internet').className = `status-dot ${online ? 'online' : 'offline'}`;
  el('label-internet').textContent = online ? 'Online' : 'Offline';
}

async function onOnline() {
  updateConnectionStatus();
  try {
    const pendientes = await contarPendientes();
    if (pendientes > 0 && deviceKey) {
      const result = await syncPendientes(deviceKey);
      updatePendientesBadge(0);
      console.log('Sync automático:', result);
    }
    if (deviceKey && localidad) {
      await syncCatalogo(deviceKey, localidad);
    }
  } catch (e) {
    console.error('Error en sync automático:', e);
  }
}

function onOffline() {
  updateConnectionStatus();
}

async function updatePendientesBadge(count) {
  if (count === undefined) count = await contarPendientes();
  const badge = el('pendientes-badge');
  if (count > 0) {
    badge.textContent = `${count} pendiente${count > 1 ? 's' : ''}`;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

// --- Sync periódico ---

function scheduleSync() {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(async () => {
    if (estaOnline() && deviceKey && localidad) {
      try {
        const pendientes = await contarPendientes();
        if (pendientes > 0) {
          await syncPendientes(deviceKey);
          updatePendientesBadge(0);
        }
        await syncCatalogo(deviceKey, localidad);
      } catch (e) {
        console.error('Sync periódico falló:', e);
      }
    }
  }, 5 * 60 * 1000);
}

// --- Simulación de TAG (modo prueba) ---

function setupSimulacion() {
  el('btn-simular').addEventListener('click', async () => {
    const empleados = await getEmpleados();
    const select = el('sim-empleado');
    select.innerHTML = '';
    empleados.forEach(emp => {
      const opt = document.createElement('option');
      opt.value = emp.tag_uid || '';
      opt.textContent = `${emp.nombre} ${emp.apellido} — ${emp.cargo || 'Sin cargo'}`;
      select.appendChild(opt);
    });
    el('modal-simular').classList.add('active');
  });

  el('sim-ok').addEventListener('click', () => {
    const uid = el('sim-empleado').value;
    el('modal-simular').classList.remove('active');
    if (uid) handleTagRead(uid);
  });

  el('sim-cancelar').addEventListener('click', () => {
    el('modal-simular').classList.remove('active');
  });
}

// --- Event listeners ---

function setupEventListeners() {
  setupConfigScreen();
  setupAdminModal();
  setupSimulacion();
  setupBuscador();

  // Numpad cantidad
  el('numpad-cantidad').addEventListener('click', (e) => {
    const btn = e.target.closest('.numpad-btn');
    if (btn) {
      handleCantInput(btn.dataset.val);
      resetInactivityTimer();
    }
  });

  // Numpad OT
  el('numpad-ot').addEventListener('click', (e) => {
    const btn = e.target.closest('.numpad-btn');
    if (btn) {
      handleOTInput(btn.dataset.val);
      resetInactivityTimer();
    }
  });

  // Pedido
  el('btn-resumen-confirmar').addEventListener('click', () => enviarRegistro());
  el('btn-resumen-cancelar').addEventListener('click', () => reiniciar());
  el('btn-agregar-mas').addEventListener('click', () => showBuscarInsumo());
  el('btn-ver-pedido').addEventListener('click', () => showPedido());

  // Cancelar flotante: en cantidad/ot vuelve a buscar; en buscar cancela todo
  el('btn-cancelar-flotante').addEventListener('click', () => {
    if (['cantidad', 'ot'].includes(currentScreen)) {
      insumoActual = null;
      cantidadActual = '';
      otActual = '';
      showBuscarInsumo();
    } else {
      reiniciar();
    }
  });

  // Actualizar pendientes al cargar
  updatePendientesBadge();
}

// --- Service Worker ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw-tablet.js').catch(() => {});
}
