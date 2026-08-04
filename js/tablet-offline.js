// ======================================================
// tablet-offline.js — IndexedDB + cola offline + sync
// ======================================================

const TABLET_API = 'https://globalmotriz-backend.onrender.com';
const DB_NAME = 'TabletInsumosDB';
const DB_VERSION = 1;

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('empleados')) {
        db.createObjectStore('empleados', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('catalogo')) {
        const store = db.createObjectStore('catalogo', { keyPath: 'codigo' });
        store.createIndex('nombre', 'nombre', { unique: false });
      }
      if (!db.objectStoreNames.contains('cola_pendientes')) {
        db.createObjectStore('cola_pendientes', { keyPath: 'local_id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'key' });
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

// --- Helpers genéricos ---

async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(data);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbClear(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbPutBulk(storeName, items) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    items.forEach(item => store.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Config ---

async function getConfig(key, defaultVal = null) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('config', 'readonly');
    const req = tx.objectStore('config').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : defaultVal);
    req.onerror = () => resolve(defaultVal);
  });
}

async function setConfig(key, value) {
  await dbPut('config', { key, value });
}

// --- Empleados ---

async function syncEmpleados(deviceKey) {
  const res = await fetch(`${TABLET_API}/empleados/lista-tablet`, {
    headers: { 'x-device-key': deviceKey }
  });

  if (!res.ok) throw new Error('Error al obtener empleados');

  const empleados = await res.json();
  await dbClear('empleados');
  await dbPutBulk('empleados', empleados);
  await setConfig('lastSyncEmpleados', new Date().toISOString());
  return empleados.length;
}

async function buscarEmpleadoPorTag(uid) {
  const empleados = await dbGetAll('empleados');
  return empleados.find(e => e.tag_uid && e.tag_uid.toUpperCase() === uid.toUpperCase()) || null;
}

async function getEmpleados() {
  return dbGetAll('empleados');
}

// --- Catálogo ---

async function syncCatalogo(deviceKey, localidad) {
  const res = await fetch(`${TABLET_API}/inventario/catalogo-completo?localidad=${encodeURIComponent(localidad)}`, {
    headers: { 'x-device-key': deviceKey }
  });

  if (!res.ok) throw new Error('Error al obtener catálogo');

  const catalogo = await res.json();
  await dbClear('catalogo');
  await dbPutBulk('catalogo', catalogo);
  await setConfig('lastSyncCatalogo', new Date().toISOString());
  return catalogo.length;
}

async function buscarInsumos(query) {
  const catalogo = await dbGetAll('catalogo');
  if (!query || !query.trim()) return catalogo;

  const q = query.trim().toLowerCase();
  return catalogo.filter(item =>
    item.codigo.toLowerCase().includes(q) ||
    item.nombre.toLowerCase().includes(q)
  );
}

async function getInsumo(codigo) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('catalogo', 'readonly');
    const req = tx.objectStore('catalogo').get(codigo);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

async function decrementarStockLocal(codigo, cantidad) {
  const insumo = await getInsumo(codigo);
  if (insumo && insumo.codigo !== 'INS999') {
    insumo.stock_actual = Math.max(0, Number(insumo.stock_actual) - cantidad);
    await dbPut('catalogo', insumo);
  }
}

// --- Cola de pendientes ---

async function agregarPendiente(registro) {
  const pendiente = {
    ...registro,
    fecha_local: new Date().toISOString(),
    status: 'pendiente'
  };
  await dbPut('cola_pendientes', pendiente);
  return contarPendientes();
}

async function getPendientes() {
  return dbGetAll('cola_pendientes');
}

async function contarPendientes() {
  const pendientes = await dbGetAll('cola_pendientes');
  return pendientes.length;
}

async function limpiarPendientes() {
  await dbClear('cola_pendientes');
}

// --- Envío batch (online, múltiples items) ---

async function enviarRegistrosBatch(registros, deviceKey) {
  const res = await fetch(`${TABLET_API}/insumos/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-key': deviceKey
    },
    body: JSON.stringify({ registros })
  });

  if (!res.ok) throw new Error('Error al enviar registros');
  return res.json();
}

// --- Envío directo (online) ---

async function enviarRegistroDirecto(registro, deviceKey) {
  const res = await fetch(`${TABLET_API}/insumos/scan-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-key': deviceKey
    },
    body: JSON.stringify(registro)
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Error al enviar registro');
  }

  return data;
}

// --- Sync de pendientes ---

async function syncPendientes(deviceKey) {
  const pendientes = await getPendientes();
  if (pendientes.length === 0) return { total: 0, exitosos: 0, fallidos: 0 };

  const registros = pendientes.map(p => ({
    orden_trabajo: p.orden_trabajo,
    codigo_barras: p.codigo_barras,
    cantidad: p.cantidad,
    localidad: p.localidad,
    empleado_id: p.empleado_id,
    fecha_local: p.fecha_local
  }));

  const res = await fetch(`${TABLET_API}/insumos/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-key': deviceKey
    },
    body: JSON.stringify({ registros })
  });

  if (!res.ok) throw new Error('Error al sincronizar pendientes');

  const data = await res.json();
  await limpiarPendientes();
  return data;
}

// --- Sync completo ---

async function syncCompleto(deviceKey, localidad) {
  const resultados = { empleados: 0, catalogo: 0, pendientes: null };

  try {
    const pendientes = await contarPendientes();
    if (pendientes > 0) {
      resultados.pendientes = await syncPendientes(deviceKey);
    }
  } catch (e) {
    console.error('Error sync pendientes:', e);
  }

  try {
    resultados.empleados = await syncEmpleados(deviceKey);
  } catch (e) {
    console.error('Error sync empleados:', e);
  }

  try {
    resultados.catalogo = await syncCatalogo(deviceKey, localidad);
  } catch (e) {
    console.error('Error sync catálogo:', e);
  }

  await setConfig('lastSync', new Date().toISOString());
  return resultados;
}

// --- Estado de conexión ---

function estaOnline() {
  return navigator.onLine;
}
