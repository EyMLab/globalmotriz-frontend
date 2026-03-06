// js/finanzas.js

document.addEventListener('DOMContentLoaded', () => {

  if (!getToken()) {
    redirectLogin();
    return;
  }

  // =========================================================
  // Estado global
  // =========================================================
  let tipoCajaActual = 'GENERAL';
  const LIMITES = { GENERAL: 150, COMBUSTIBLE: 100 };

  // =========================================================
  // Tab switching
  // =========================================================
  const subtabBtns = document.querySelectorAll('.subtab-btn[data-tab]');
  const subtabPanels = document.querySelectorAll('.subtab-panel');

  subtabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      subtabBtns.forEach(b => b.classList.remove('active'));
      subtabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`panel-${tab}`)?.classList.add('active');
    });
  });

  // =========================================================
  // Toggle tipo caja
  // =========================================================
  document.querySelectorAll('.btn-tipo').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-tipo').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tipoCajaActual = btn.dataset.tipo;
      cargarCajaChica(tipoCajaActual);
    });
  });

  // =========================================================
  // Selector de mes para cierre
  // =========================================================
  const inputMes = document.getElementById('input-mes');
  const hoy = new Date();
  const mesDefault = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  inputMes.value = mesDefault;

  inputMes.addEventListener('change', () => {
    cargarCierreCaja(inputMes.value);
  });

  // =========================================================
  // Carga inicial
  // =========================================================
  cargarCajaChica(tipoCajaActual);
  cargarCierreCaja(mesDefault);

  // =========================================================
  // CAJA CHICA - Cargar
  // =========================================================
  async function cargarCajaChica(tipo) {
    const tbody = document.getElementById('tabla-caja-chica');
    tbody.innerHTML = `<tr><td colspan="9">Cargando...</td></tr>`;

    try {
      const res = await apiFetch(`/finanzas/caja-chica?tipo=${tipo}`);
      const data = await safeJson(res);

      if (!res.ok) throw new Error(data?.error || 'Error al cargar');

      renderBalance(data.saldo, data.limite);
      renderTablaCajaChica(data.historial);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9">Error: ${err.message}</td></tr>`;
    }
  }

  function renderBalance(saldo, limite) {
    const pct = Math.min(100, Math.max(0, (saldo / limite) * 100));
    const clase = pct > 50 ? 'verde' : pct > 20 ? 'amarillo' : 'rojo';

    document.getElementById('balance-saldo').textContent = `$${saldo.toFixed(2)}`;
    document.getElementById('balance-limite').textContent = `Límite: $${limite.toFixed(2)}`;

    const fill = document.getElementById('balance-fill');
    fill.style.width = `${pct}%`;
    fill.className = `balance-bar-fill ${clase}`;
  }

  function renderTablaCajaChica(historial) {
    const tbody = document.getElementById('tabla-caja-chica');

    if (!historial.length) {
      tbody.innerHTML = `<tr><td colspan="9">Sin registros</td></tr>`;
      return;
    }

    tbody.innerHTML = historial.map(r => {
      const fecha = new Date(r.fecha).toLocaleDateString('es-EC');
      const esRepo = r.es_reposicion;
      return `<tr style="${esRepo ? 'background:#eff6ff;' : ''}">
        <td>${fecha}</td>
        <td>${esRepo ? '<span class="badge-repo">REPOSICIÓN</span>' : r.tipo_doc}</td>
        <td>${r.num_documento || '—'}</td>
        <td>${r.proveedor || '—'}</td>
        <td>${r.concepto || '—'}</td>
        <td>${esRepo ? '—' : r.tipo_iva + '%'}</td>
        <td>${esRepo ? '—' : '$' + parseFloat(r.monto_base).toFixed(2)}</td>
        <td>${esRepo ? '—' : '$' + parseFloat(r.iva).toFixed(2)}</td>
        <td><strong>$${parseFloat(r.total).toFixed(2)}</strong></td>
      </tr>`;
    }).join('');
  }

  // =========================================================
  // CAJA CHICA - Modal Registrar Gasto
  // =========================================================
  window.modalRegistrarGasto = async function () {
    const hoyStr = new Date().toISOString().split('T')[0];

    const { value: form } = await Swal.fire({
      title: `Registrar Gasto - ${tipoCajaActual}`,
      width: 520,
      html: `
        <div class="form-row">
          <div class="form-group">
            <label>Fecha</label>
            <input id="gc-fecha" type="date" class="swal2-input" value="${hoyStr}">
          </div>
          <div class="form-group">
            <label>Tipo Documento</label>
            <select id="gc-tipo-doc" class="swal2-select">
              <option value="FACTURA">Factura</option>
              <option value="RECIBO">Recibo</option>
              <option value="NOTA DE VENTA">Nota de Venta</option>
              <option value="OTRO">Otro</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>N° Documento</label>
          <input id="gc-num-doc" class="swal2-input" placeholder="Ej: 001-001-000123">
        </div>
        <div class="form-group">
          <label>Proveedor <span style="color:#94a3b8;font-weight:400">(obligatorio)</span></label>
          <input id="gc-proveedor" class="swal2-input" placeholder="Nombre del proveedor">
        </div>
        <div class="form-group">
          <label>Concepto <span style="color:#94a3b8;font-weight:400">(obligatorio)</span></label>
          <input id="gc-concepto" class="swal2-input" placeholder="Descripción del gasto">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Tipo IVA</label>
            <div style="display:flex;gap:16px;margin-top:6px;">
              <label><input type="radio" name="gc-iva" value="0" checked> 0%</label>
              <label><input type="radio" name="gc-iva" value="15"> 15%</label>
            </div>
          </div>
          <div class="form-group">
            <label>Monto Base ($)</label>
            <input id="gc-base" type="number" min="0" step="0.01" class="swal2-input" placeholder="0.00">
          </div>
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-top:8px;font-size:0.9rem;">
          IVA: <strong id="gc-iva-calc">$0.00</strong> &nbsp;|&nbsp; Total: <strong id="gc-total-calc">$0.00</strong>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Registrar',
      cancelButtonText: 'Cancelar',
      didOpen: () => {
        const baseInput = document.getElementById('gc-base');
        const ivaCalc = document.getElementById('gc-iva-calc');
        const totalCalc = document.getElementById('gc-total-calc');

        function recalcular() {
          const base = parseFloat(baseInput.value) || 0;
          const ivaRate = parseInt(document.querySelector('input[name="gc-iva"]:checked')?.value || '0');
          const iva = parseFloat((base * ivaRate / 100).toFixed(2));
          const total = parseFloat((base + iva).toFixed(2));
          ivaCalc.textContent = `$${iva.toFixed(2)}`;
          totalCalc.textContent = `$${total.toFixed(2)}`;
        }

        baseInput.addEventListener('input', recalcular);
        document.querySelectorAll('input[name="gc-iva"]').forEach(r => r.addEventListener('change', recalcular));
      },
      preConfirm: () => {
        const fecha = document.getElementById('gc-fecha').value;
        const proveedor = document.getElementById('gc-proveedor').value.trim();
        const concepto = document.getElementById('gc-concepto').value.trim();
        const base = parseFloat(document.getElementById('gc-base').value) || 0;
        const ivaRate = parseInt(document.querySelector('input[name="gc-iva"]:checked')?.value || '0');

        if (!fecha) { Swal.showValidationMessage('Fecha es obligatoria'); return false; }
        if (!proveedor) { Swal.showValidationMessage('Proveedor es obligatorio'); return false; }
        if (!concepto) { Swal.showValidationMessage('Concepto es obligatorio'); return false; }
        if (base <= 0) { Swal.showValidationMessage('Monto base debe ser mayor a 0'); return false; }

        const iva = parseFloat((base * ivaRate / 100).toFixed(2));
        const total = parseFloat((base + iva).toFixed(2));

        return {
          tipo: tipoCajaActual,
          fecha,
          es_reposicion: false,
          tipo_doc: document.getElementById('gc-tipo-doc').value,
          num_documento: document.getElementById('gc-num-doc').value.trim() || null,
          proveedor,
          concepto,
          tipo_iva: ivaRate,
          monto_base: base,
          iva,
          total
        };
      }
    });

    if (!form) return;

    try {
      const res = await apiFetch('/finanzas/caja-chica', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || 'Error al registrar');
      await Swal.fire('Gasto registrado', '', 'success');
      cargarCajaChica(tipoCajaActual);
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  };

  // =========================================================
  // CAJA CHICA - Modal Reposición
  // =========================================================
  window.modalReposicion = async function () {
    const hoyStr = new Date().toISOString().split('T')[0];

    const { value: form } = await Swal.fire({
      title: `Reposición - ${tipoCajaActual}`,
      html: `
        <div class="form-group">
          <label>Fecha</label>
          <input id="repo-fecha" type="date" class="swal2-input" value="${hoyStr}">
        </div>
        <div class="form-group">
          <label>Monto de reposición ($)</label>
          <input id="repo-monto" type="number" min="0.01" step="0.01" class="swal2-input" placeholder="0.00">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Registrar reposición',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const fecha = document.getElementById('repo-fecha').value;
        const monto = parseFloat(document.getElementById('repo-monto').value);
        if (!fecha) { Swal.showValidationMessage('Fecha es obligatoria'); return false; }
        if (!monto || monto <= 0) { Swal.showValidationMessage('Monto debe ser mayor a 0'); return false; }
        return { tipo: tipoCajaActual, fecha, es_reposicion: true, total: monto };
      }
    });

    if (!form) return;

    try {
      const res = await apiFetch('/finanzas/caja-chica', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || 'Error');
      await Swal.fire('Reposición registrada', '', 'success');
      cargarCajaChica(tipoCajaActual);
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  };

  // =========================================================
  // CIERRE DE CAJA - Cargar
  // =========================================================
  async function cargarCierreCaja(mes) {
    const tbody = document.getElementById('tabla-cierre');
    tbody.innerHTML = `<tr><td colspan="11">Cargando...</td></tr>`;
    document.getElementById('fila-totales-cierre').style.display = 'none';

    try {
      const res = await apiFetch(`/finanzas/cierre-caja?mes=${mes}`);
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || 'Error');

      renderTablaCierre(data.cobros, data.totales);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="11">Error: ${err.message}</td></tr>`;
    }
  }

  function renderTablaCierre(cobros, totales) {
    const tbody = document.getElementById('tabla-cierre');

    if (!cobros.length) {
      tbody.innerHTML = `<tr><td colspan="11">Sin cobros en este mes</td></tr>`;
      return;
    }

    tbody.innerHTML = cobros.map(r => {
      const fecha = new Date(r.fecha).toLocaleDateString('es-EC');
      return `<tr>
        <td>${fecha}</td>
        <td><span class="badge-estado ${r.tipo === 'SEGURO' ? 'badge-pendiente' : 'badge-finalizado'}">${r.tipo}</span></td>
        <td>${r.cliente}</td>
        <td><strong>$${parseFloat(r.total).toFixed(2)}</strong></td>
        <td>$${parseFloat(r.pago_ahorros).toFixed(2)}</td>
        <td>$${parseFloat(r.pago_transferencia).toFixed(2)}</td>
        <td>$${parseFloat(r.pago_cheques).toFixed(2)}</td>
        <td>$${parseFloat(r.pago_tarjeta).toFixed(2)}</td>
        <td>$${parseFloat(r.pago_efectivo).toFixed(2)}</td>
        <td>${r.factura_num || '—'}</td>
        <td title="${r.observaciones || ''}">${r.observaciones ? r.observaciones.substring(0, 20) + (r.observaciones.length > 20 ? '…' : '') : '—'}</td>
      </tr>`;
    }).join('');

    // Mostrar fila totales
    if (totales) {
      document.getElementById('tot-total').textContent = `$${totales.total.toFixed(2)}`;
      document.getElementById('tot-ahorros').textContent = `$${totales.pago_ahorros.toFixed(2)}`;
      document.getElementById('tot-transfer').textContent = `$${totales.pago_transferencia.toFixed(2)}`;
      document.getElementById('tot-cheques').textContent = `$${totales.pago_cheques.toFixed(2)}`;
      document.getElementById('tot-tarjeta').textContent = `$${totales.pago_tarjeta.toFixed(2)}`;
      document.getElementById('tot-efectivo').textContent = `$${totales.pago_efectivo.toFixed(2)}`;
      document.getElementById('fila-totales-cierre').style.display = '';
    }
  }

  // =========================================================
  // CIERRE DE CAJA - Modal Registrar Cobro
  // =========================================================
  window.modalRegistrarCobro = async function () {
    const hoyStr = new Date().toISOString().split('T')[0];

    const { value: form } = await Swal.fire({
      title: 'Registrar Cobro',
      width: 560,
      html: `
        <div class="form-row">
          <div class="form-group">
            <label>Fecha</label>
            <input id="cc-fecha" type="date" class="swal2-input" value="${hoyStr}">
          </div>
          <div class="form-group">
            <label>Tipo</label>
            <div style="display:flex;gap:16px;margin-top:6px;">
              <label><input type="radio" name="cc-tipo" value="PARTICULAR" checked> Particular</label>
              <label><input type="radio" name="cc-tipo" value="SEGURO"> Seguro</label>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>Cliente <span style="color:#94a3b8;font-weight:400">(obligatorio)</span></label>
          <input id="cc-cliente" class="swal2-input" placeholder="Nombre del cliente">
        </div>
        <div class="form-row" id="cc-seguro-fields" style="display:none;">
          <div class="form-group">
            <label>Valor Deducible ($)</label>
            <input id="cc-deducible" type="number" min="0" step="0.01" class="swal2-input" placeholder="0.00">
          </div>
          <div class="form-group">
            <label>Valor Asegurado ($)</label>
            <input id="cc-asegurado" type="number" min="0" step="0.01" class="swal2-input" placeholder="0.00">
          </div>
        </div>
        <div class="form-group">
          <label>Total ($) <span style="color:#94a3b8;font-weight:400">(obligatorio)</span></label>
          <input id="cc-total" type="number" min="0.01" step="0.01" class="swal2-input" placeholder="0.00">
        </div>
        <div style="margin:10px 0 4px;font-weight:500;font-size:0.88rem;color:#334155;">Formas de pago</div>
        <div class="form-row">
          <div class="form-group">
            <label>Ahorros</label>
            <input id="cc-ahorros" type="number" min="0" step="0.01" class="swal2-input" placeholder="0.00" value="0">
          </div>
          <div class="form-group">
            <label>Transferencia</label>
            <input id="cc-transfer" type="number" min="0" step="0.01" class="swal2-input" placeholder="0.00" value="0">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Cheques</label>
            <input id="cc-cheques" type="number" min="0" step="0.01" class="swal2-input" placeholder="0.00" value="0">
          </div>
          <div class="form-group">
            <label>Tarjeta</label>
            <input id="cc-tarjeta" type="number" min="0" step="0.01" class="swal2-input" placeholder="0.00" value="0">
          </div>
        </div>
        <div class="form-group">
          <label>Efectivo</label>
          <input id="cc-efectivo" type="number" min="0" step="0.01" class="swal2-input" placeholder="0.00" value="0">
        </div>
        <div id="cc-cuadre" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 14px;margin-top:6px;font-size:0.88rem;">
          Cuadre: <strong id="cc-cuadre-txt">—</strong>
        </div>
        <div class="form-row" style="margin-top:8px;">
          <div class="form-group">
            <label>Factura N°</label>
            <input id="cc-factura" class="swal2-input" placeholder="Ej: 001-001-000456">
          </div>
          <div class="form-group">
            <label>Observaciones</label>
            <input id="cc-obs" class="swal2-input" placeholder="Opcional">
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Registrar',
      cancelButtonText: 'Cancelar',
      didOpen: () => {
        // Mostrar/ocultar campos seguro
        document.querySelectorAll('input[name="cc-tipo"]').forEach(r => {
          r.addEventListener('change', () => {
            const esSeguro = document.querySelector('input[name="cc-tipo"]:checked').value === 'SEGURO';
            document.getElementById('cc-seguro-fields').style.display = esSeguro ? '' : 'none';
          });
        });

        // Calcular cuadre en tiempo real
        const pagosIds = ['cc-ahorros', 'cc-transfer', 'cc-cheques', 'cc-tarjeta', 'cc-efectivo'];
        function calcCuadre() {
          const total = parseFloat(document.getElementById('cc-total').value) || 0;
          const sumPagos = pagosIds.reduce((s, id) => s + (parseFloat(document.getElementById(id).value) || 0), 0);
          const diff = parseFloat((sumPagos - total).toFixed(2));
          const cuadreTxt = document.getElementById('cc-cuadre-txt');
          if (total === 0) {
            cuadreTxt.innerHTML = '—';
            return;
          }
          if (Math.abs(diff) < 0.01) {
            cuadreTxt.innerHTML = '<span class="cuadre-ok">✓ Cuadra</span>';
          } else {
            cuadreTxt.innerHTML = `<span class="cuadre-diff">⚠ Diferencia: $${Math.abs(diff).toFixed(2)} ${diff > 0 ? '(exceso)' : '(falta)'}</span>`;
          }
        }

        document.getElementById('cc-total').addEventListener('input', calcCuadre);
        pagosIds.forEach(id => document.getElementById(id).addEventListener('input', calcCuadre));
      },
      preConfirm: () => {
        const fecha = document.getElementById('cc-fecha').value;
        const tipo = document.querySelector('input[name="cc-tipo"]:checked').value;
        const cliente = document.getElementById('cc-cliente').value.trim();
        const total = parseFloat(document.getElementById('cc-total').value);

        if (!fecha) { Swal.showValidationMessage('Fecha es obligatoria'); return false; }
        if (!cliente) { Swal.showValidationMessage('Cliente es obligatorio'); return false; }
        if (!total || total <= 0) { Swal.showValidationMessage('Total debe ser mayor a 0'); return false; }

        return {
          fecha,
          tipo,
          cliente,
          valor_deducible: parseFloat(document.getElementById('cc-deducible')?.value) || 0,
          valor_asegurado: parseFloat(document.getElementById('cc-asegurado')?.value) || 0,
          total,
          pago_ahorros: parseFloat(document.getElementById('cc-ahorros').value) || 0,
          pago_transferencia: parseFloat(document.getElementById('cc-transfer').value) || 0,
          pago_cheques: parseFloat(document.getElementById('cc-cheques').value) || 0,
          pago_tarjeta: parseFloat(document.getElementById('cc-tarjeta').value) || 0,
          pago_efectivo: parseFloat(document.getElementById('cc-efectivo').value) || 0,
          factura_num: document.getElementById('cc-factura').value.trim() || null,
          observaciones: document.getElementById('cc-obs').value.trim() || null
        };
      }
    });

    if (!form) return;

    try {
      const res = await apiFetch('/finanzas/cierre-caja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || 'Error al registrar');
      await Swal.fire('Cobro registrado', '', 'success');
      cargarCierreCaja(inputMes.value);
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  };

});
