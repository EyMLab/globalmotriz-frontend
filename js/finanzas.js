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

  // Helper: formatea "YYYY-MM-DD" sin bug de timezone
  function fmtFecha(str) {
    if (!str) return '—';
    const [y, m, d] = str.split('T')[0].split('-');
    return `${parseInt(d)}/${parseInt(m)}/${y}`;
  }

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

  // Click en observaciones largas → mostrar texto completo
  document.getElementById('tabla-cierre').addEventListener('click', e => {
    const td = e.target.closest('td.obs-expandible');
    if (!td) return;
    Swal.fire({ title: 'Observaciones', text: td.dataset.obs, confirmButtonText: 'Cerrar', width: 500 });
  });

  // =========================================================
  // Carga inicial
  // =========================================================
  cargarCajaChica(tipoCajaActual);
  cargarCierreCaja(mesDefault);
  cargarDeducibles();

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
      const fecha = fmtFecha(r.fecha);
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
      const fecha = fmtFecha(r.fecha);
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
        <td class="${r.observaciones ? 'obs-expandible' : ''}" data-obs="${(r.observaciones || '').replace(/"/g, '&quot;')}" style="${r.observaciones ? 'cursor:pointer;' : ''}" title="${r.observaciones || ''}">${r.observaciones ? r.observaciones.substring(0, 30) + (r.observaciones.length > 30 ? '…' : '') : '—'}</td>
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
            <label>Corriente</label>
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
        <div style="margin-top:8px;">
          <div class="form-group" style="width:100%;">
            <label>N° Factura/OT</label>
            <div style="display:flex;gap:8px;align-items:center;">
              <select id="cc-doc-tipo" class="swal2-select" style="flex:0 0 150px;margin:0;">
                <option value="F">Factura (F-)</option>
                <option value="OT">Orden (OT-)</option>
              </select>
              <span id="cc-doc-prefijo" style="font-weight:700;color:#1E5570;white-space:nowrap;min-width:28px;">F-</span>
              <input id="cc-factura-num" class="swal2-input" style="flex:1;margin:0;" placeholder="001-001-000456">
            </div>
          </div>
          <div class="form-group" style="width:100%;margin-top:8px;">
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

        // Prefijo automático Factura/OT
        document.getElementById('cc-doc-tipo').addEventListener('change', function () {
          document.getElementById('cc-doc-prefijo').textContent = this.value + '-';
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
          factura_num: (() => {
            const num = document.getElementById('cc-factura-num').value.trim();
            if (!num) return null;
            const prefijo = document.getElementById('cc-doc-tipo').value;
            return `${prefijo}-${num}`;
          })(),
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

  // =========================================================
  // Utilidad: cargar logo como base64
  // =========================================================
  function cargarImagenBase64(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext('2d').drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  // =========================================================
  // PDF helpers compartidos
  // =========================================================
  const COLOR_PRIMARY  = [30, 85, 112];   // #1E5570
  const COLOR_ACCENT   = [234, 88, 12];   // naranja
  const COLOR_GRAY     = [100, 116, 139];
  const COLOR_DARK     = [15, 23, 42];
  const COLOR_BLUE_ROW = [219, 234, 254]; // fondo reposición

  async function construirCabeceraPDF(doc, titulo, subtitulo) {
    const pageW  = doc.internal.pageSize.getWidth();
    const marginL = 14;

    // Franja superior
    doc.setFillColor(...COLOR_PRIMARY);
    doc.rect(0, 0, pageW, 3, 'F');

    // Logo
    let logoX = marginL;
    try {
      const logoImg = await cargarImagenBase64('img/logo.png');
      if (logoImg) {
        doc.addImage(logoImg, 'PNG', marginL, 6, 30, 15);
        logoX = marginL + 34;
      }
    } catch { /* sin logo */ }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...COLOR_PRIMARY);
    doc.text('GLOBAL MOTRIZ S.A.', logoX, 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR_GRAY);
    doc.text('Sistema de Gestión Financiera', logoX, 18);

    // Título derecha
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...COLOR_ACCENT);
    doc.text(titulo, pageW - marginL, 12, { align: 'right' });

    if (subtitulo) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...COLOR_GRAY);
      doc.text(subtitulo, pageW - marginL, 18, { align: 'right' });
    }

    // Línea separadora
    doc.setDrawColor(...COLOR_PRIMARY);
    doc.setLineWidth(0.4);
    doc.line(marginL, 24, pageW - marginL, 24);

    return 28; // Y inicial para contenido
  }

  // =========================================================
  // PDF - CAJA CHICA (desde última reposición)
  // =========================================================
  window.descargarReporteCajaChica = async function () {
    try {
      const res = await apiFetch(`/finanzas/caja-chica/reporte?tipo=${tipoCajaActual}`);
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || 'Error al obtener datos');

      if (!data.registros.length) {
        return Swal.fire('Sin datos', 'No hay registros para generar el reporte.', 'info');
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('l', 'mm', 'a4'); // landscape
      const pageW  = doc.internal.pageSize.getWidth();
      const marginL = 14;
      const marginR = 14;

      const fechaDesde = data.fecha_desde
        ? fmtFecha(data.fecha_desde)
        : 'Inicio';
      const hoyStr = new Date().toLocaleDateString('es-EC');

      const startY = await construirCabeceraPDF(
        doc,
        `CAJA CHICA - ${tipoCajaActual}`,
        `Desde: ${fechaDesde}  |  Emitido: ${hoyStr}`
      );

      // Info box con semáforo
      const pct = Math.min(100, Math.max(0, (data.saldo / data.limite) * 100));
      const fillColor = pct > 50 ? [34, 197, 94] : pct > 20 ? [245, 158, 11] : [239, 68, 68];
      const inactiveLight = [213, 220, 228];
      const boxW = pageW - marginL - marginR;

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(marginL, startY, boxW, 26, 2, 2, 'FD');

      // Textos
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...COLOR_GRAY);
      doc.text('Saldo:', marginL + 4, startY + 6);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...COLOR_DARK);
      doc.text(`$${data.saldo.toFixed(2)} de $${data.limite.toFixed(2)}`, marginL + 18, startY + 6);

      doc.setFont('helvetica', 'bold'); doc.setTextColor(...COLOR_GRAY);
      doc.text('Período:', marginL + 4, startY + 12);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...COLOR_DARK);
      doc.text(`${fechaDesde} - ${hoyStr}`, marginL + 22, startY + 12);

      // Semáforo (3 círculos, top-right del box)
      const r = 3.2;
      const cY = startY + 9;
      const cRed    = pageW - marginR - 5;
      const cYellow = cRed - 9;
      const cGreen  = cYellow - 9;

      doc.setFillColor(...(pct <= 20 ? [239, 68, 68] : inactiveLight));
      doc.circle(cRed, cY, r, 'F');
      doc.setFillColor(...(pct > 20 && pct <= 50 ? [245, 158, 11] : inactiveLight));
      doc.circle(cYellow, cY, r, 'F');
      doc.setFillColor(...(pct > 50 ? [34, 197, 94] : inactiveLight));
      doc.circle(cGreen, cY, r, 'F');

      // Porcentaje bajo el semáforo
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...fillColor);
      doc.text(`${pct.toFixed(0)}%`, (cGreen + cRed) / 2, cY + r + 3.5, { align: 'center' });

      // Barra de progreso
      const barX = marginL + 4;
      const barY = startY + 19;
      const barW = boxW - 8;
      const barH = 4;

      doc.setFillColor(226, 232, 240);
      doc.roundedRect(barX, barY, barW, barH, 1, 1, 'F');
      const fillW = Math.max(barH, (pct / 100) * barW);
      doc.setFillColor(...fillColor);
      doc.roundedRect(barX, barY, fillW, barH, 1, 1, 'F');

      // Tabla
      const tableBody = data.registros.map(r => {
        const fecha = fmtFecha(r.fecha);
        if (r.es_reposicion) {
          return [fecha, 'REPOSICIÓN', '', '', '', '—', '—', '—', `$${parseFloat(r.total).toFixed(2)}`];
        }
        return [
          fecha,
          r.tipo_doc,
          r.num_documento || '—',
          r.proveedor || '—',
          r.concepto || '—',
          r.tipo_iva + '%',
          `$${parseFloat(r.monto_base).toFixed(2)}`,
          `$${parseFloat(r.iva).toFixed(2)}`,
          `$${parseFloat(r.total).toFixed(2)}`
        ];
      });

      // Totales al pie de tabla
      const totalGastos = data.registros
        .filter(r => !r.es_reposicion)
        .reduce((s, r) => s + parseFloat(r.total), 0);
      const totalRepos = data.registros
        .filter(r => r.es_reposicion)
        .reduce((s, r) => s + parseFloat(r.total), 0);

      doc.autoTable({
        startY: startY + 30,
        head: [['Fecha', 'Tipo Doc', 'N° Doc', 'Proveedor', 'Concepto', 'IVA%', 'Base', 'IVA $', 'Total']],
        body: tableBody,
        foot: [[
          { content: 'TOTALES', colSpan: 8, styles: { halign: 'right', fontStyle: 'bold' } },
          { content: `$${(totalRepos - totalGastos).toFixed(2)} saldo`, styles: { fontStyle: 'bold' } }
        ]],
        margin: { left: marginL, right: marginR },
        styles: { fontSize: 7.5, cellPadding: 2.5, lineColor: [226, 232, 240], lineWidth: 0.2 },
        headStyles: { fillColor: COLOR_PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold' },
        footStyles: { fillColor: [241, 245, 249], textColor: COLOR_DARK, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 24 },
          2: { cellWidth: 28 },
          3: { cellWidth: 38 },
          4: { cellWidth: 45 },
          5: { cellWidth: 14, halign: 'center' },
          6: { cellWidth: 20, halign: 'right' },
          7: { cellWidth: 18, halign: 'right' },
          8: { cellWidth: 22, halign: 'right' }
        },
        didParseCell: (hookData) => {
          if (hookData.section === 'body') {
            const rowData = data.registros[hookData.row.index];
            if (rowData?.es_reposicion) {
              hookData.cell.styles.fillColor = COLOR_BLUE_ROW;
              hookData.cell.styles.fontStyle = 'bold';
            }
          }
        }
      });

      const mesActual = new Date().toISOString().slice(0, 7);
      doc.save(`Caja_Chica_${tipoCajaActual}_${mesActual}.pdf`);

    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  };

  // =========================================================
  // PDF - CIERRE DE CAJA (mes seleccionado)
  // =========================================================
  window.descargarReporteCierre = async function () {
    const mes = document.getElementById('input-mes').value;
    if (!mes) return Swal.fire('Selecciona un mes', '', 'warning');

    try {
      const res = await apiFetch(`/finanzas/cierre-caja?mes=${mes}`);
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || 'Error al obtener datos');

      if (!data.cobros.length) {
        return Swal.fire('Sin datos', 'No hay cobros para este mes.', 'info');
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('l', 'mm', 'a4'); // landscape
      const pageW  = doc.internal.pageSize.getWidth();
      const marginL = 14;
      const marginR = 14;

      // Nombre del mes en español
      const [anio, numMes] = mes.split('-');
      const nombreMes = new Date(parseInt(anio), parseInt(numMes) - 1, 1)
        .toLocaleDateString('es-EC', { month: 'long', year: 'numeric' });
      const hoyStr = new Date().toLocaleDateString('es-EC');

      const startY = await construirCabeceraPDF(
        doc,
        'CIERRE DE CAJA',
        `${nombreMes.toUpperCase()}  |  Emitido: ${hoyStr}`
      );

      // Resumen totales
      const t = data.totales;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(marginL, startY, pageW - marginL - marginR, 14, 2, 2, 'FD');

      const col1 = marginL + 4;
      const col2 = col1 + 70;
      const col3 = col2 + 70;

      doc.setFontSize(8.5);
      const field = (label, val, x, y) => {
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...COLOR_GRAY);
        doc.text(label, x, y);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...COLOR_DARK);
        doc.text(val, x + doc.getTextWidth(label) + 1.5, y);
      };

      field('Total cobrado:', `$${t.total.toFixed(2)}`, col1, startY + 6);
      field('Cobros:', `${data.cobros.length} registros`, col2, startY + 6);
      field('Transferencias:', `$${t.pago_transferencia.toFixed(2)}`, col3, startY + 6);
      field('Corriente:', `$${t.pago_ahorros.toFixed(2)}`, col1, startY + 11);
      field('Efectivo:', `$${t.pago_efectivo.toFixed(2)}`, col2, startY + 11);
      field('Tarjeta + Cheques:', `$${(t.pago_tarjeta + t.pago_cheques).toFixed(2)}`, col3, startY + 11);

      // Tabla
      const tableBody = data.cobros.map(r => [
        fmtFecha(r.fecha),
        r.tipo,
        r.cliente,
        `$${parseFloat(r.total).toFixed(2)}`,
        `$${parseFloat(r.pago_ahorros).toFixed(2)}`,
        `$${parseFloat(r.pago_transferencia).toFixed(2)}`,
        `$${parseFloat(r.pago_cheques).toFixed(2)}`,
        `$${parseFloat(r.pago_tarjeta).toFixed(2)}`,
        `$${parseFloat(r.pago_efectivo).toFixed(2)}`,
        r.factura_num || '—',
        r.observaciones || '—'
      ]);

      doc.autoTable({
        startY: startY + 18,
        head: [['Fecha', 'Tipo', 'Cliente', 'Total', 'Corriente', 'Transfer.', 'Cheques', 'Tarjeta', 'Efectivo', 'N° Factura/OT', 'Obs.']],
        body: tableBody,
        foot: [[
          { content: 'TOTALES', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
          { content: `$${t.total.toFixed(2)}`, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: `$${t.pago_ahorros.toFixed(2)}`, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: `$${t.pago_transferencia.toFixed(2)}`, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: `$${t.pago_cheques.toFixed(2)}`, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: `$${t.pago_tarjeta.toFixed(2)}`, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: `$${t.pago_efectivo.toFixed(2)}`, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: '', colSpan: 2 }
        ]],
        margin: { left: marginL, right: marginR },
        styles: { fontSize: 7, cellPadding: 2.5, lineColor: [226, 232, 240], lineWidth: 0.2 },
        headStyles: { fillColor: COLOR_PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold' },
        footStyles: { fillColor: [241, 245, 249], textColor: COLOR_DARK },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 22 },
          2: { cellWidth: 42 },
          3: { cellWidth: 22, halign: 'right' },
          4: { cellWidth: 22, halign: 'right' },
          5: { cellWidth: 24, halign: 'right' },
          6: { cellWidth: 20, halign: 'right' },
          7: { cellWidth: 20, halign: 'right' },
          8: { cellWidth: 20, halign: 'right' },
          9: { cellWidth: 26 },
          10: { cellWidth: 28 }
        },
        didParseCell: (hookData) => {
          if (hookData.section === 'body') {
            const r = data.cobros[hookData.row.index];
            if (r?.tipo === 'SEGURO') {
              hookData.cell.styles.fillColor = [240, 249, 255];
            }
          }
        }
      });

      doc.save(`Cierre_Caja_${mes}.pdf`);

    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  };

  // =========================================================
  // DEDUCIBLES POR DEVOLVER
  // =========================================================
  async function cargarDeducibles() {
    const tbody = document.getElementById('tabla-deducibles');
    tbody.innerHTML = `<tr><td colspan="10">Cargando...</td></tr>`;
    try {
      const res = await apiFetch('/finanzas/deducibles');
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || 'Error');
      renderTablaDeducibles(data.deducibles);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="10">Error: ${err.message}</td></tr>`;
    }
  }

  function renderTablaDeducibles(registros) {
    const tbody = document.getElementById('tabla-deducibles');
    if (!registros.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;">Sin registros</td></tr>`;
      return;
    }
    tbody.innerHTML = registros.map(r => {
      const pendiente = r.estado === 'PENDIENTE';
      const badgeClass = pendiente ? 'badge-pendiente' : 'badge-finalizado';
      const badgeLabel = pendiente ? '⚠ Pendiente' : '✓ Devuelto';
      const accion = pendiente
        ? `<button class="btn btn-obs" onclick="registrarDevolucion(${r.id})">Registrar Dev.</button>`
        : '—';
      return `<tr>
        <td>${r.ot}</td>
        <td>${r.aseguradora}</td>
        <td>${fmtFecha(r.fecha_cobro)}</td>
        <td>${r.comprobante_ingreso || '—'}</td>
        <td>${r.modo_pago}</td>
        <td>$${parseFloat(r.valor).toFixed(2)}</td>
        <td>${r.fecha_devolucion ? fmtFecha(r.fecha_devolucion) : '—'}</td>
        <td>${r.comprobante_egreso || '—'}</td>
        <td><span class="badge-estado ${badgeClass}">${badgeLabel}</span></td>
        <td>${accion}</td>
      </tr>`;
    }).join('');
  }

  window.modalRegistrarDeducible = async function () {
    const hoyStr = new Date().toISOString().split('T')[0];
    const { value: form } = await Swal.fire({
      title: 'Registrar Deducible',
      width: 520,
      html: `
        <div class="form-row">
          <div class="form-group">
            <label>OT</label>
            <input id="ded-ot" class="swal2-input" placeholder="Ej: 813">
          </div>
          <div class="form-group">
            <label>Aseguradora</label>
            <input id="ded-aseguradora" class="swal2-input" placeholder="Ej: HDI">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Fecha Cobro</label>
            <input id="ded-fecha" type="date" class="swal2-input" value="${hoyStr}">
          </div>
          <div class="form-group">
            <label>Modo de Pago</label>
            <select id="ded-modo" class="swal2-select" style="margin:0;">
              <option value="TARJETA">Tarjeta</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="DEPOSITO">Depósito</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Valor a Devolver</label>
            <input id="ded-valor" type="number" min="0.01" step="0.01" class="swal2-input" placeholder="0.00">
          </div>
          <div class="form-group">
            <label>Comp. Ingreso</label>
            <input id="ded-comp-ingreso" class="swal2-input" placeholder="Opcional">
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Registrar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const ot = document.getElementById('ded-ot').value.trim();
        const aseguradora = document.getElementById('ded-aseguradora').value.trim();
        const fecha_cobro = document.getElementById('ded-fecha').value;
        const modo_pago = document.getElementById('ded-modo').value;
        const valor = parseFloat(document.getElementById('ded-valor').value);
        if (!ot) { Swal.showValidationMessage('OT es obligatorio'); return false; }
        if (!aseguradora) { Swal.showValidationMessage('Aseguradora es obligatoria'); return false; }
        if (!fecha_cobro) { Swal.showValidationMessage('Fecha es obligatoria'); return false; }
        if (!valor || valor <= 0) { Swal.showValidationMessage('Valor debe ser mayor a 0'); return false; }
        return {
          ot, aseguradora, fecha_cobro, modo_pago, valor,
          comprobante_ingreso: document.getElementById('ded-comp-ingreso').value.trim() || null
        };
      }
    });

    if (!form) return;
    try {
      const res = await apiFetch('/finanzas/deducibles', { method: 'POST', body: JSON.stringify(form) });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || 'Error');
      await Swal.fire({ icon: 'success', title: 'Registrado', timer: 1200, showConfirmButton: false });
      cargarDeducibles();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  };

  window.registrarDevolucion = async function (id) {
    const hoyStr = new Date().toISOString().split('T')[0];
    const { value: form } = await Swal.fire({
      title: 'Registrar Devolución',
      width: 440,
      html: `
        <div class="form-group" style="width:100%;">
          <label>Fecha de Devolución</label>
          <input id="dev-fecha" type="date" class="swal2-input" value="${hoyStr}">
        </div>
        <div class="form-group" style="width:100%;margin-top:8px;">
          <label>Comprobante Egreso</label>
          <input id="dev-comp-egreso" class="swal2-input" placeholder="Ej: TRF-9001">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Confirmar Devolución',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const fecha_devolucion = document.getElementById('dev-fecha').value;
        const comprobante_egreso = document.getElementById('dev-comp-egreso').value.trim();
        if (!fecha_devolucion) { Swal.showValidationMessage('Fecha es obligatoria'); return false; }
        if (!comprobante_egreso) { Swal.showValidationMessage('Comprobante de egreso es obligatorio'); return false; }
        return { fecha_devolucion, comprobante_egreso };
      }
    });

    if (!form) return;
    try {
      const res = await apiFetch(`/finanzas/deducibles/${id}/devolver`, {
        method: 'PUT',
        body: JSON.stringify(form)
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || 'Error');
      await Swal.fire({ icon: 'success', title: 'Devolución registrada', timer: 1200, showConfirmButton: false });
      cargarDeducibles();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  };

});
