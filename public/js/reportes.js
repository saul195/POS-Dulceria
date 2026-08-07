const $ = (id) => document.getElementById(id);

const today = new Date().toISOString().slice(0, 10);
let salesPage = 1;
const SALES_PAGE_SIZE = 15;

/* ---------------- Carga de datos ---------------- */

async function loadReports() {
  try {
    const r = await api.reports.today();
    $('reportDate').textContent = `(${r.date})`;
    $('statTotal').textContent = money(r.summary.total_sales);
    $('statCount').textContent = r.summary.transactions;
    $('statProfit').textContent = money(r.summary.net_profit);
    $('statCost').textContent = money(r.summary.total_cost);

    const top = $('topList');
    top.innerHTML = r.top_products.length
      ? r.top_products.map((t) => `<li><b>${t.name}</b> — ${num(t.qty)} uds · ${money(t.revenue)}</li>`).join('')
      : '<li class="muted">Sin ventas hoy.</li>';

    const methods = $('methodList');
    methods.innerHTML = r.by_payment_method.length
      ? r.by_payment_method.map((m) => `
          <div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">
            <span><b>${m.method.charAt(0).toUpperCase() + m.method.slice(1)}</b> · ${m.count} venta(s)</span>
            <span>${money(m.total)}</span>
          </div>`).join('')
      : '<div class="muted">Sin ventas hoy.</div>';

    const low = $('lowStockList');
    low.innerHTML = r.low_stock.length
      ? r.low_stock.map((p) => `
          <div class="row" style="justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);">
            <span><b>${p.name}</b></span>
            <span class="badge badge-low">${num(p.stock, 2)} / min ${num(p.min_stock, 2)} ${p.unit}</span>
          </div>`).join('')
      : '<div>Sin productos con stock bajo 👍</div>';

    renderCash(r.open_session);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function loadSales() {
  try {
    const data = await api.sales.list({ date: today, page: salesPage, pageSize: SALES_PAGE_SIZE });
    const body = $('salesBody');
    body.innerHTML = data.sales.length
      ? data.sales.map((s) => `
        <tr>
          <td><b>#${String(s.id).padStart(6, '0')}</b></td>
          <td>${String(s.created_at).slice(11, 16)}</td>
          <td><span class="badge badge-ok">${s.payment_method}</span></td>
          <td class="num">${s.items_count}</td>
          <td class="num"><b>${money(s.total_amount)}</b></td>
          <td class="num"><button class="btn btn-outline btn-sm view-btn" data-id="${s.id}">Ver ticket</button></td>
        </tr>`).join('')
      : `<tr><td colspan="6" class="muted" style="text-align:center;padding:24px;">Sin ventas registradas hoy.</td></tr>`;

    const wrap = $('salesPagination');
    const totalPages = Math.max(1, Math.ceil(data.total / SALES_PAGE_SIZE));
    wrap.innerHTML = '';
    if (totalPages > 1) {
      const mk = (label, page, disabled, primary = false) => {
        const b = document.createElement('button');
        b.className = `btn btn-sm ${primary ? '' : 'btn-outline'}`;
        b.textContent = label;
        b.disabled = disabled;
        b.addEventListener('click', () => { salesPage = page; loadSales(); });
        wrap.appendChild(b);
      };
      mk('‹ Ant', salesPage - 1, salesPage === 1);
      mk(`Pág ${salesPage}/${totalPages}`, salesPage, true, true);
      mk('Sig ›', salesPage + 1, salesPage === totalPages);
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

/* ---------------- Caja ---------------- */

function renderCash(session) {
  const box = $('cashBox');
  if (session) {
    box.innerHTML = `
      <div class="row" style="justify-content:space-between;">
        <div>
          <span class="badge badge-ok">CAJA ABIERTA</span>
          <div class="muted" style="margin-top:6px;">
            Fondo inicial: <b>${money(session.opening_amount)}</b><br>
            Apertura: ${session.opening_date}<br>
            Ventas de hoy en caja: <b>${money(session.today_sales ?? 0)}</b><br>
            Esperado en caja: <b>${money(session.expected ?? 0)}</b>
          </div>
        </div>
        <button class="btn btn-danger" id="closeCashBtn">Cerrar caja / corte</button>
      </div>`;
    $('closeCashBtn').addEventListener('click', () => {
      const modal = openModal(`
        <h3>Cerrar caja (corte de turno)</h3>
        <p class="muted mb">Fondo inicial: ${money(session.opening_amount)} · Ventas de hoy: ${money(session.today_sales ?? 0)}<br>
        Cantidad esperada: <b>${money(session.expected ?? 0)}</b></p>
        <div class="form-field mb">
          <label>Cantidad contada en caja ($)</label>
          <input type="number" id="closingAmount" step="0.01" min="0" value="${session.expected ?? 0}">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cxlClose">Cancelar</button>
          <button class="btn btn-danger" id="doClose">Cerrar caja</button>
        </div>`, 'closeCashModal');
      modal.querySelector('#cxlClose').addEventListener('click', () => closeModal(modal.closest('.modal-backdrop')));
      modal.querySelector('#doClose').addEventListener('click', async () => {
        try {
          const r = await api.cash.close({ closing_amount: parseFloat(modal.querySelector('#closingAmount').value) || 0 });
          closeModal(modal.closest('.modal-backdrop'));
          const diff = r.difference;
          toast(`Caja cerrada. ${diff >= 0 ? 'Sobrante' : 'Faltante'}: ${money(Math.abs(diff))}`, diff >= 0 ? 'success' : 'error');
          loadReports();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  } else {
    box.innerHTML = `
      <div class="row" style="justify-content:space-between;">
        <div>
          <span class="badge badge-warn">CAJA CERRADA</span>
          <div class="muted" style="margin-top:6px;">Abre caja con tu fondo inicial para registrar el turno.</div>
        </div>
        <button class="btn btn-success" id="openCashBtn">Abrir caja</button>
      </div>`;
    $('openCashBtn').addEventListener('click', () => {
      const modal = openModal(`
        <h3>Abrir caja</h3>
        <div class="form-field mb">
          <label>Fondo inicial de caja ($)</label>
          <input type="number" id="openingAmount" step="0.01" min="0" value="0">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cxlOpen">Cancelar</button>
          <button class="btn btn-success" id="doOpen">Abrir</button>
        </div>`, 'openCashModal');
      modal.querySelector('#cxlOpen').addEventListener('click', () => closeModal(modal.closest('.modal-backdrop')));
      modal.querySelector('#doOpen').addEventListener('click', async () => {
        try {
          await api.cash.open({ opening_amount: parseFloat(modal.querySelector('#openingAmount').value) || 0 });
          closeModal(modal.closest('.modal-backdrop'));
          toast('Caja abierta.');
          loadReports();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  }
}

/* ---------------- Detalle de ticket ---------------- */

$('salesBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('.view-btn');
  if (!btn) return;
  try {
    const sale = await api.sales.get(btn.dataset.id);
    previewTicket(sale);
  } catch (err) {
    toast(err.message, 'error');
  }
});

loadReports();
loadSales();
setInterval(loadReports, 60000);
