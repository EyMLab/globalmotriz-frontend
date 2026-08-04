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
let wsUrl = '';
let ws = null;
let wsReconnectTimer = null;
let inactivityTimer = null;
const INACTIVITY_TIMEOUT = 60000;
const RESULT_TIMEOUT = 5000;
let syncInterval = null;

// --- Elementos DOM ---
const el = (id) => document.getElementById(id);

// --- Inicialización ---
document.addEventListener('DOMContentLoaded', async () => {
  await openDB();

  localidad = await getConfig('localidad');
  deviceKey = await getConfig('deviceKey', 'devkey123');
  wsUrl = await getConfig('wsUrl', '');

  if (!localidad) {
    showScreen('config');
  } else {
    el('label-localidad').textContent = localidad;
    showScreen('espera');
    initWebSocket();
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

  resetInactivityTimer();
}

// --- Configuración ---

function setupConfigScreen() {
  el('btn-guardar-config').addEventListener('click', async () => {
    const loc = el('cfg-localidad').value;
    const dk = el('cfg-device-key').value.trim() || 'devkey123';
    const wsu = el('cfg-ws-url').value.trim();

    if (!loc) return;

    await setConfig('localidad', loc);
    await setConfig('deviceKey', dk);
    await setConfig('wsUrl', wsu);

    localidad = loc;
    deviceKey = dk;
    wsUrl = wsu;

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
      initWebSocket();
      scheduleSync();
    }, 1500);
  });

  el('btn-config-bar').addEventListener('click', async () => {
    el('cfg-localidad').value = localidad || 'MATRIZ';
    el('cfg-device-key').value = deviceKey || 'devkey123';
    el('cfg-ws-url').value = wsUrl || '';
    el('cfg-status').textContent = '';
    showScreen('config');
  });
}

// --- WebSocket (ESP32 Gateway) ---

function initWebSocket() {
  if (!wsUrl) {
    el('label-ws').textContent = 'WS: no configurado';
    return;
  }

  connectWebSocket();
}

function connectWebSocket() {
  if (ws && ws.readyState <= 1) return;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      el('dot-ws').className = 'status-dot ws-connected';
      el('label-ws').textContent = 'WS: conectado';
      if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
      }
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'tag' && data.uid) {
          handleTagRead(data.uid);
        }
      } catch { /* ignorar mensajes no JSON */ }
    };

    ws.onclose = () => {
      el('dot-ws').className = 'status-dot ws-disconnected';
      el('label-ws').textContent = 'WS: desconectado';
      scheduleWsReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };

  } catch {
    scheduleWsReconnect();
  }
}

function scheduleWsReconnect() {
  if (wsReconnectTimer) return;
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    connectWebSocket();
  }, 3000);
}

// --- Tag leído (WebSocket o simulación) ---

async function handleTagRead(uid) {
  if (currentScreen !== 'espera') return;

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

// --- Simulación de TAG ---

function setupSimulacion() {
  el('btn-simular-tag').addEventListener('click', async () => {
    const empleados = await getEmpleados();

    if (empleados.length === 0) {
      alert('No hay empleados en cache. Sincronice primero desde Configuración.');
      return;
    }

    const lista = el('modal-empleados-lista');
    lista.innerHTML = '';

    empleados.forEach(emp => {
      const div = document.createElement('div');
      div.className = 'modal-empleado-item';
      div.innerHTML = `
        <div>
          <div class="emp-nombre">${emp.nombre} ${emp.apellido}</div>
          <div class="emp-cargo">${emp.cargo || '—'}</div>
        </div>
      `;
      div.addEventListener('click', () => {
        el('modal-simular').classList.remove('active');
        empleadoActual = emp;
        showBienvenida();
      });
      lista.appendChild(div);
    });

    el('modal-simular').classList.add('active');
  });

  el('modal-cerrar').addEventListener('click', () => {
    el('modal-simular').classList.remove('active');
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
    const stock = Number(item.stock_actual);
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

  const stock = Number(insumoActual.stock_actual);
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

    const stock = Number(insumoActual.stock_actual);
    const qty = Number(cantidadActual);
    const es999 = insumoActual.codigo === 'INS999';

    if (!es999 && qty > stock) {
      el('cant-stock-info').textContent = `Sin stock suficiente (disponible: ${stock})`;
      el('cant-stock-info').style.color = 'var(--red)';
      setTimeout(() => {
        el('cant-stock-info').style.color = '';
        el('cant-stock-info').textContent = `Disponible: ${stock} ${insumoActual.unidad || ''}`;
      }, 2000);
      return;
    }

    const esStock = insumoActual.tipo === 'STOCK' || es999;
    if (esStock) {
      otActual = '0000';
      showResumen();
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

function handleOTInput(val) {
  if (val === 'borrar') {
    otActual = otActual.slice(0, -1);
    updateOTDisplay();
    return;
  }

  if (val === 'ok') {
    if (otActual.length !== 4) return;
    showResumen();
    return;
  }

  if (otActual.length < 4) {
    otActual += val;
    updateOTDisplay();
  }
}

// --- Resumen ---

function showResumen() {
  el('res-empleado').textContent = `${empleadoActual.nombre} ${empleadoActual.apellido}`;
  el('res-insumo').textContent = insumoActual.nombre;
  el('res-codigo').textContent = insumoActual.codigo;
  el('res-cantidad').textContent = `${cantidadActual} ${insumoActual.unidad || ''}`;
  el('res-ot').textContent = otActual;
  el('res-localidad').textContent = localidad;
  showScreen('resumen');
}

// --- Enviar registro ---

async function enviarRegistro() {
  const registro = {
    orden_trabajo: otActual,
    codigo_barras: insumoActual.codigo,
    cantidad: Number(cantidadActual),
    localidad: localidad,
    empleado_id: empleadoActual.id
  };

  if (estaOnline()) {
    try {
      await enviarRegistroDirecto(registro, deviceKey);
      await decrementarStockLocal(insumoActual.codigo, Number(cantidadActual));
      showResultado('ok', 'Registro exitoso', `${insumoActual.nombre} x${cantidadActual}`);
    } catch (e) {
      await guardarOffline(registro);
    }
  } else {
    await guardarOffline(registro);
  }
}

async function guardarOffline(registro) {
  const pendientes = await agregarPendiente(registro);
  await decrementarStockLocal(registro.codigo_barras, registro.cantidad);
  updatePendientesBadge(pendientes);
  showResultado('offline', 'Guardado offline', `${pendientes} registro(s) pendiente(s)`);
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

// --- Event listeners ---

function setupEventListeners() {
  setupConfigScreen();
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

  // Resumen
  el('btn-resumen-confirmar').addEventListener('click', () => enviarRegistro());
  el('btn-resumen-cancelar').addEventListener('click', () => reiniciar());

  // Cancelar flotante
  el('btn-cancelar-flotante').addEventListener('click', () => reiniciar());

  // Actualizar pendientes al cargar
  updatePendientesBadge();
}

// --- Service Worker ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw-tablet.js').catch(() => {});
}
