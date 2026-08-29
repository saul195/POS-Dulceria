const $ = (id) => document.getElementById(id);

const dNow = new Date();
const today = `${dNow.getFullYear()}-${String(dNow.getMonth() + 1).padStart(2, '0')}-${String(dNow.getDate()).padStart(2, '0')}`;
let salesPage = 1;
const SALES_PAGE_SIZE = 15;

/* ---------------- Carga de datos ---------------- */

const moneyShort = (n) => {
  const abs = Math.abs(n);
  if (abs >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
};

let chartMode = 'week';
let chartYear = dNow.getFullYear();
let chartMonth = dNow.getMonth() + 1;

const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function initChartControls() {
  const monthSel = $('chartMonth');
  const yearSel = $('chartYear');
  if (!monthSel || !yearSel) return;
  monthSel.innerHTML = MONTHS_ES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
  monthSel.value = chartMonth;
  const cur = dNow.getFullYear();
  yearSel.innerHTML = '';
  for (let y = cur; y >= cur - 10; y--) {
    const o = document.createElement('option');
    o.value = y;
    o.textContent = y;
    if (y === chartYear) o.selected = true;
    yearSel.appendChild(o);
  }
}

function updateChartControls() {
  const controls = $('chartControls');
  if (!controls) return;
  const isMonth = chartMode === 'month';
  const isYear = chartMode === 'year';
  controls.style.display = (isMonth || isYear) ? 'flex' : 'none';
  if ($('chartMonth')) $('chartMonth').style.display = isMonth ? '' : 'none';
}

function renderChart(r) {
  const meta = $('chartMeta');
  const wrap = $('chartWrap');
  if (!meta || !wrap) return;
  meta.textContent = `${r.title} — ${r.totals.count} venta(s) · ${moneyMX(r.totals.total)}`;
  if (!r.data.length) {
    wrap.innerHTML = '<div class="chart-empty">Sin ventas en el período.</div>';
    return;
  }
  const max = Math.max(1, ...r.data.map((b) => b.total));
  const bars = r.data.map((b) => {
    const label = r.mode === 'year' ? ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][b.month - 1]
      : r.mode === 'week' ? (b.weekday || b.day)
      : String(b.day).padStart(2, '0');
    const h = b.total > 0 ? Math.max(3, (b.total / max) * 170) : 2;
    return `
      <div class="bar-col" title="${label}: ${moneyMX(b.total)} (${b.count} venta${b.count === 1 ? '' : 's'})">
        <div class="bar-val">${b.total > 0 ? moneyShort(b.total) : ''}</div>
        <div class="bar-fill ${b.total > 0 ? '' : 'zero'}" style="height:${h}px"></div>
        <div class="bar-lbl">${label}</div>
      </div>`;
  }).join('');
  wrap.innerHTML = `<div class="barchart">${bars}</div>`;
}

async function loadChart() {
  try {
    const opts = {};
    if (chartMode === 'month') { opts.year = chartYear; opts.month = chartMonth; }
    else if (chartMode === 'year') { opts.year = chartYear; }
    const r = await api.reports.range(chartMode, opts);
    renderChart(r);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function loadReports() {
  try {
    const r = await api.reports.today();
    $('reportDate').textContent = `(${r.date})`;
    $('statTotal').textContent = moneyMX(r.summary.total_sales);
    $('statCount').textContent = r.summary.transactions;

    const top = $('topList');
    top.innerHTML = r.top_products.length
      ? r.top_products.map((t, i) => `
          <div class="top-row">
            <span class="top-rank">${i + 1}</span>
            <span class="top-name"><b>${t.name}</b></span>
            <span class="top-meta">${num(t.qty, 3)} ${t.unit} · ${moneyMX(t.revenue)}</span>
          </div>`).join('')
      : '<div class="muted">Sin ventas hoy.</div>';

    const low = $('lowStockList');
    low.innerHTML = r.low_stock.length
      ? r.low_stock.map((p) => `
          <div class="row" style="justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);">
            <span><b>${p.name}</b></span>
            <span class="badge badge-low">${stockNum(p.stock, p.unit)} / min ${stockNum(p.min_stock, p.unit)} ${p.unit}</span>
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
          <td><b>#${String(s.ticket_no || s.id).padStart(6, '0')}</b></td>
          <td>${String(s.created_at).slice(11, 16)}</td>
          <td><span class="badge badge-ok">${s.payment_method}</span></td>
          <td class="num">${s.items_count}</td>
          <td class="num"><b>${moneyMX(s.total_amount)}</b></td>
          <td class="num">
            <button class="btn btn-outline btn-sm view-btn" data-id="${s.id}">Ver ticket</button>
            <button class="btn btn-outline btn-sm reprint-btn" data-id="${s.id}" title="Reimprimir el ticket en la impresora">Reimprimir</button>
          </td>
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
            Fondo inicial: <b>${moneyMX(session.opening_amount)}</b><br>
            Apertura: ${session.opening_date}<br>
            Ventas de hoy en caja: <b>${moneyMX(session.today_sales ?? 0)}</b><br>
            Esperado en caja: <b>${moneyMX(session.expected ?? 0)}</b>
          </div>
        </div>
        <button class="btn btn-danger" id="closeCashBtn">Cerrar caja / corte</button>
      </div>`;
    $('closeCashBtn').addEventListener('click', () => {
      const modal = openModal(`
        <h3>Cerrar caja (corte de turno)</h3>
        <p class="muted mb">Fondo inicial: ${moneyMX(session.opening_amount)} · Ventas de hoy: ${moneyMX(session.today_sales ?? 0)}<br>
        Cantidad esperada: <b>${moneyMX(session.expected ?? 0)}</b></p>
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
          toast(`Caja cerrada. ${diff >= 0 ? 'Sobrante' : 'Faltante'}: ${moneyMX(Math.abs(diff))}`, diff >= 0 ? 'success' : 'error');
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
  const viewBtn = e.target.closest('.view-btn');
  const repBtn = e.target.closest('.reprint-btn');
  if (!viewBtn && !repBtn) return;
  try {
    const sale = await api.sales.get((viewBtn || repBtn).dataset.id);
    if (repBtn) {
      toast(`Reimprimiendo ticket #${sale.ticket_no || sale.id}…`, 'info');
      await printTicket(sale);
    } else {
      previewTicket(sale);
    }
  } catch (err) {
    toast(err.message, 'error');
  }
});

initChartControls();
loadReports();
loadSales();
loadChart();
setInterval(loadReports, 60000);
if (typeof printer !== 'undefined' && printer.loadConfig) printer.loadConfig().catch(() => {});

function initCardToggle(toggleId, bodyId, storageKey) {
  const toggle = $(toggleId);
  if (!toggle) return;
  toggle.checked = localStorage.getItem(storageKey) !== '0';
  const apply = () => {
    const hidden = !toggle.checked;
    const body = $(bodyId);
    const text = toggle.parentElement.querySelector('.toggle-text');
    if (body) body.style.display = hidden ? 'none' : '';
    if (text) text.textContent = hidden ? 'Inactiva' : 'Activa';
  };
  toggle.addEventListener('change', () => {
    localStorage.setItem(storageKey, toggle.checked ? '1' : '0');
    apply();
  });
  apply();
}

initCardToggle('periodToggle', 'periodBody', 'pos_period_card');
initCardToggle('salesToggle', 'salesContent', 'pos_sales_card');
initCardToggle('cashToggle', 'cashContent', 'pos_cash_card');
initCardToggle('prodSalesToggle', 'prodSalesContent', 'pos_prod_sales_card');

document.querySelectorAll('.seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    chartMode = btn.dataset.mode;
    updateChartControls();
    loadChart();
  });
});

const chartGo = $('chartGo');
if (chartGo) {
  chartGo.addEventListener('click', () => {
    chartMonth = Number($('chartMonth').value);
    chartYear = Number($('chartYear').value);
    loadChart();
  });
}

/* ---------------- Ventas por producto ---------------- */

let psSelectedProduct = null;
let psAllProducts = [];

function psGetDates() {
  const period = $('psPeriod').value;
  const now = new Date();
  let sd, ed;
  if (period === 'day') {
    sd = ed = today;
  } else if (period === 'week') {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const mon = new Date(now);
    mon.setDate(now.getDate() - diff);
    sd = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
    ed = today;
  } else if (period === 'month') {
    sd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    ed = today;
  } else if (period === 'year') {
    sd = `${now.getFullYear()}-01-01`;
    ed = today;
  } else if (period === 'all') {
    return { all: true };
  } else {
    sd = $('psFrom').value || today;
    ed = $('psTo').value || today;
  }
  return { start_date: sd, end_date: ed };
}

async function psSearchProducts(query) {
  if (!query || query.length < 2) { psAllProducts = []; return; }
  try {
    const data = await api.products.list({ search: query, page: 1, pageSize: 20 });
    psAllProducts = data.products || [];
  } catch (e) { psAllProducts = []; }
}

function renderPsSuggestions() {
  const box = $('psSuggestions');
  if (!psAllProducts.length) { box.classList.add('hidden'); return; }
  box.innerHTML = psAllProducts.map((p) =>
    `<div class="ps-sug-item" data-id="${p.id}" data-name="${p.name}">${p.name} <span class="muted">${p.barcode || ''} · ${money(p.selling_price)}/${p.unit}</span></div>`
  ).join('');
  box.classList.remove('hidden');
}

async function loadProductSales() {
  const dates = psGetDates();
  try {
    const r = await api.reports.productSales(psSelectedProduct ? psSelectedProduct.id : null, dates);
    $('psResult').classList.remove('hidden');
    $('psEmpty').classList.add('hidden');
    const p = r.product;
    $('psProductInfo').innerHTML = p
      ? `<b>${p.name}</b> <span class="muted">${p.barcode || ''} · ${money(p.selling_price)}/${p.unit} · Stock actual: ${stockNum(p.stock, p.unit)} ${p.unit}</span>`
      : `<b>Todas las ventas</b> <span class="muted">${r.all ? 'todo el historial' : `${r.start_date} a ${r.end_date}`}</span>`;
    $('psSummary').innerHTML = `
      <div class="ps-stat"><div class="label">Unidades vendidas</div><div class="value">${p ? `${stockNum(r.summary.qty, p.unit)} ${p.unit}` : num(r.summary.qty, 3)}</div></div>
      <div class="ps-stat"><div class="label">Ingresos</div><div class="value">${moneyMX(r.summary.revenue)}</div></div>
      <div class="ps-stat"><div class="label">Transacciones</div><div class="value">${r.summary.tickets}</div></div>`;
    const body = $('psBody');
    if (r.days.length) {
      body.innerHTML = r.days.map((d) => `
        <tr>
          <td>${d.day}</td>
          <td class="num"><b>${p ? `${stockNum(d.qty, p.unit)} ${p.unit}` : num(d.qty, 3)}</b></td>
          <td class="num">${d.tickets}</td>
          <td class="num"><b>${moneyMX(d.total)}</b></td>
        </tr>`).join('');
    } else {
      body.innerHTML = `<tr><td colspan="4" class="muted" style="text-align:center;padding:20px;">Sin ventas en el período seleccionado.</td></tr>`;
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

$('psSearch').addEventListener('input', async (e) => {
  const q = e.target.value.trim();
  psSelectedProduct = null;
  $('psResult').classList.add('hidden');
  $('psEmpty').classList.remove('hidden');
  await psSearchProducts(q);
  renderPsSuggestions();
});

$('psSuggestions').addEventListener('click', (e) => {
  const item = e.target.closest('.ps-sug-item');
  if (!item) return;
  const id = Number(item.dataset.id);
  const name = item.dataset.name;
  psSelectedProduct = psAllProducts.find((p) => p.id === id) || { id, name };
  $('psSearch').value = name;
  $('psSuggestions').classList.add('hidden');
  loadProductSales();
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.ps-search-wrap')) {
    const box = $('psSuggestions');
    if (box) box.classList.add('hidden');
  }
});

$('psPeriod').addEventListener('change', () => {
  const isCustom = $('psPeriod').value === 'custom';
  $('psDates').classList.toggle('hidden', !isCustom);
  loadProductSales();
});

$('psGo').addEventListener('click', () => {
  loadProductSales();
});

if ($('psFrom')) $('psFrom').value = today;
if ($('psTo')) $('psTo').value = today;

/* ---------------- Entradas y Salidas de stock ---------------- */

let stockPage = 1;
const STOCK_PAGE_SIZE = 20;
let stockCategories = [];
let stockCategoryId = '';
let stockProductId = '';

async function loadStockCats() {
  try {
    stockCategories = await api.categories.list();
  } catch (e) {
    stockCategories = [];
  }
  renderStockCats();
}

function renderStockCats() {
  const wrap = $('stockCats');
  if (!wrap) return;
  wrap.innerHTML = '';
  const totalProducts = stockCategories.reduce((s, c) => s + (c.product_count || 0), 0);
  const mk = (label, value, count) => {
    const b = document.createElement('button');
    b.className = `prod-card stock-cat${String(value) === String(stockCategoryId) ? ' active' : ''}`;
    b.innerHTML = `
      <div class="prod-name">${label}</div>
      <div class="prod-count">${count}</div>
      <div class="prod-meta">producto(s) · movimientos de hoy</div>`;
    b.addEventListener('click', () => {
      stockCategoryId = String(value);
      stockProductId = '';
      stockPage = 1;
      renderStockCats();
      loadStockProducts();
      loadStockMovements();
    });
    wrap.appendChild(b);
  };
  mk('Todas', '', totalProducts);
  for (const c of stockCategories) mk(c.name, String(c.id), c.product_count || 0);
}

async function fetchCategoryProducts() {
  const params = { page: 1, pageSize: 100 };
  if (stockCategoryId) params.category_id = stockCategoryId;
  let all = [];
  let total = Infinity;
  while (all.length < total) {
    const data = await api.products.list(params);
    all = all.concat(data.products);
    total = data.total;
    if (!data.products.length) break;
    params.page++;
  }
  return all;
}

async function loadStockProducts() {
  const wrap = $('stockProducts');
  if (!wrap) return;
  wrap.innerHTML = '';
  try {
    const list = await fetchCategoryProducts();
    if (!list.length) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    for (const p of list) {
      const b = document.createElement('button');
      b.className = `prod-card stock-prod${String(p.id) === String(stockProductId) ? ' active' : ''}`;
      b.title = p.barcode || '';
      b.innerHTML = `
        <div class="prod-name">${p.name}</div>
        <div class="prod-count">${stockNum(p.stock, p.unit)} ${p.unit}</div>
        <div class="prod-meta">stock actual${p.is_bote ? ' · bote' : ''}</div>`;
      b.addEventListener('click', () => {
        stockProductId = String(p.id) === String(stockProductId) ? '' : String(p.id);
        stockPage = 1;
        loadStockProducts();
        loadStockMovements();
      });
      wrap.appendChild(b);
    }
  } catch (e) {
    wrap.classList.add('hidden');
  }
}

async function loadStockProductInfo() {
  const box = $('stockProductInfo');
  if (!box) return;
  if (!stockProductId) { box.innerHTML = ''; return; }
  try {
    const r = await api.reports.product(stockProductId, { date: today });
    const p = r.product;
    box.innerHTML = `
      <div class="product-stock-info">
        <div class="psi-head"><b>${p.name}</b> <span class="muted">${p.barcode || ''} · ${p.unit}</span></div>
        <div class="psi-grid">
          <div class="psi-box"><div class="label">Entradas hoy</div><div class="value ok">+${stockNum(r.entradas, p.unit)} ${p.unit}</div></div>
          <div class="psi-box"><div class="label">Salidas hoy</div><div class="value err">-${stockNum(r.salidas, p.unit)} ${p.unit}</div></div>
          <div class="psi-box"><div class="label">Stock que quedó</div><div class="value">${stockNum(p.stock, p.unit)} ${p.unit}</div></div>
        </div>
      </div>`;
  } catch (e) {
    box.innerHTML = '';
  }
}

async function loadStockMovements() {
  try {
    const data = await api.stock.movements({
      date: today,
      category_id: stockProductId ? '' : stockCategoryId,
      product_id: stockProductId,
      page: stockPage,
      pageSize: STOCK_PAGE_SIZE,
    });
    loadStockProductInfo();
    const body = $('stockBody');
    body.innerHTML = data.movements.length
      ? data.movements.map((m) => `
        <tr>
          <td>${String(m.created_at).slice(11, 16)}</td>
          <td><b>${m.product_name}</b></td>
          <td class="num">${m.type === 'entrada' ? `<b class="ok">+${stockNum(m.quantity, m.unit)} ${m.unit}</b>` : ''}</td>
          <td class="num">${m.type === 'salida' ? `<b class="err">-${stockNum(m.quantity, m.unit)} ${m.unit}</b>` : ''}</td>
          <td class="muted">${m.reason || '—'}</td>
        </tr>`).join('')
      : `<tr><td colspan="5" class="muted" style="text-align:center;padding:20px;">Sin movimientos de stock hoy.</td></tr>`;

    const wrap = $('stockPagination');
    const totalPages = Math.max(1, Math.ceil(data.total / STOCK_PAGE_SIZE));
    wrap.innerHTML = '';
    if (totalPages > 1) {
      const mk = (label, page, disabled, primary = false) => {
        const b = document.createElement('button');
        b.className = `btn btn-sm ${primary ? '' : 'btn-outline'}`;
        b.textContent = label;
        b.disabled = disabled;
        b.addEventListener('click', () => { stockPage = page; loadStockMovements(); });
        wrap.appendChild(b);
      };
      mk('‹ Ant', stockPage - 1, stockPage === 1);
      mk(`Pág ${stockPage}/${totalPages}`, stockPage, true, true);
      mk('Sig ›', stockPage + 1, stockPage === totalPages);
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

if ($('stockToggle')) {
  initCardToggle('stockToggle', 'stockContent', 'pos_stock_card');
}

loadStockCats();
loadStockProducts();
loadStockMovements();
