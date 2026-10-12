const $ = (id) => document.getElementById(id);

const dNow = new Date();
const today = `${dNow.getFullYear()}-${String(dNow.getMonth() + 1).padStart(2, '0')}-${String(dNow.getDate()).padStart(2, '0')}`;
let salesPage = 1;
let salesSearch = '';
const SALES_PAGE_SIZE = 15;

/* ---------------- Carga de datos ---------------- */

const moneyShort = (n) => {
  const abs = Math.abs(n);
  if (abs >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
};

let chartMode = 'week';
let chartMetric = 'total';
let chartYear = dNow.getFullYear();
let chartMonth = dNow.getMonth() + 1;
let lastRange = null;

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
  const t = r.totals || {};
  meta.innerHTML = `${r.title} — ${t.count} venta(s) · Ventas ${moneyMX(t.total)} · Compras ${moneyMX(t.cost || 0)} · <b style="color:${(t.profit || 0) < 0 ? 'var(--danger)' : 'var(--success, #2e7d32)'}">Utilidad ${moneyMX(t.profit || 0)}</b>`;
  if (!r.data.length) {
    wrap.innerHTML = '<div class="chart-empty">Sin ventas en el período.</div>';
    return;
  }
  const max = Math.max(1, ...r.data.map((b) => Number(b[chartMetric]) || 0));
  const bars = r.data.map((b) => {
    const label = r.mode === 'year' ? ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][b.month - 1]
      : r.mode === 'week' ? (b.weekday || b.day)
      : String(b.day).padStart(2, '0');
    const val = Number(b[chartMetric]) || 0;
    const h = val > 0 ? Math.max(3, (val / max) * 170) : 2;
    const cls = val > 0 ? `bar-${chartMetric}` : (val < 0 ? 'bar-neg' : 'zero');
    return `
      <div class="bar-col" title="${label}: Ventas ${moneyMX(b.total)} · Compras ${moneyMX(b.cost || 0)} · Utilidad ${moneyMX(b.profit || 0)} (${b.count} venta${b.count === 1 ? '' : 's'})">
        <div class="bar-val">${val !== 0 ? moneyShort(val) : ''}</div>
        <div class="bar-fill ${cls}" style="height:${h}px"></div>
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
    lastRange = r;
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
    const costEl = $('statCost');
    const profitEl = $('statProfit');
    if (costEl) costEl.textContent = moneyMX(r.summary.cost || 0);
    if (profitEl) {
      profitEl.textContent = moneyMX(r.summary.profit || 0);
      profitEl.style.color = (r.summary.profit || 0) < 0 ? 'var(--danger)' : '';
    }

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
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function loadSales() {
  try {
    const data = await api.sales.list({ date: today, search: salesSearch, page: salesPage, pageSize: SALES_PAGE_SIZE });
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
            ${adminMode ? `<button class="btn btn-danger btn-sm del-btn" data-id="${s.id}" data-ticket="${s.ticket_no || s.id}" title="Eliminar la venta">Eliminar</button>` : ''}
          </td>
        </tr>`).join('')
      : `<tr><td colspan="6" class="muted" style="text-align:center;padding:24px;">${salesSearch ? `Sin ventas que coincidan con "${salesSearch}".` : 'Sin ventas registradas hoy.'}</td></tr>`;

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

/* ---------------- Detalle de ticket ---------------- */

$('salesBody').addEventListener('click', async (e) => {
  const delBtn = e.target.closest('.del-btn');
  if (delBtn) {
    e.stopPropagation();
    const id = delBtn.dataset.id;
    const ticket = delBtn.dataset.ticket;
    confirmDialog(`¿Eliminar la venta #${String(ticket).padStart(6, '0')}? Se restaurará el stock de los productos vendidos y se quitará de los reportes.`, async () => {
      try {
        await api.sales.remove(id, SECRET_KEY);
        toast(`Venta #${String(ticket).padStart(6, '0')} eliminada. Stock restaurado.`);
        loadReports();
        loadSales();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    return;
  }
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

const SECRET_KEY = 'villalegre195';
let adminMode = false;

function syncAdminBtn() {
  const btn = $('adminKeyBtn');
  if (!btn) return;
  btn.classList.toggle('btn-danger', adminMode);
  btn.classList.toggle('btn-outline', !adminMode);
  btn.textContent = adminMode ? 'Salir duela' : 'Duela';
}

$('adminKeyBtn').addEventListener('click', () => {
  if (adminMode) {
    adminMode = false;
    syncAdminBtn();
    loadSales();
    return;
  }
  const modal = openModal(`
    <h3>Modo administrador</h3>
    <p class="muted mb">Ingresa la clave secreta para activar la opción de eliminar ventas.</p>
    <div class="form-field mb">
      <label>Clave secreta</label>
      <input type="password" id="adminKeyInput" autocomplete="off" placeholder="Clave">
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="cxlAdmin">Cancelar</button>
      <button class="btn btn-success" id="okAdmin">Activar</button>
    </div>`, 'adminModal');
  const close = () => closeModal(modal.closest('.modal-backdrop'));
  modal.querySelector('#cxlAdmin').addEventListener('click', close);
  const input = modal.querySelector('#adminKeyInput');
  input.focus();
  const activate = () => {
    if (input.value !== SECRET_KEY) return toast('Clave incorrecta', 'error');
    adminMode = true;
    syncAdminBtn();
    close();
    loadSales();
  };
  modal.querySelector('#okAdmin').addEventListener('click', activate);
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); activate(); } });
});

const applySalesSearch = () => {
  salesSearch = $('salesSearch').value.trim();
  salesPage = 1;
  loadSales();
};
$('salesSearch').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); applySalesSearch(); }
});
$('salesSearchBtn').addEventListener('click', applySalesSearch);

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

document.querySelectorAll('.metric-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.metric-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    chartMetric = btn.dataset.metric;
    if (lastRange) renderChart(lastRange);
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

/* ---------------- Ventas del día ---------------- */

let psDay = today;

const psCalendar = createDateCalendar({
  mount: $('psCalendar'),
  value: today,
  onChange: (day) => {
    psDay = day;
    loadDaySales();
  },
  onMonthChange: () => { psCalendar.refreshMarks(); },
  legend: '<i class="sale"></i> ventas',
  loadMarks: async (start, end) => {
    const r = await api.reports.salesDays(start, end);
    return (r.days || []).map((d) => ({
      day: d.day,
      dots: ['sale'],
      title: `${d.count} venta${d.count === 1 ? '' : 's'} · ${moneyMX(d.total)}`,
    }));
  },
});

if ($('psGo')) {
  $('psGo').addEventListener('click', () => {
    psDay = psCalendar.getValue();
    loadDaySales();
  });
}

function fmtArticles(items) {
  if (!items || !items.length) return '<span class="muted">—</span>';
  return items.map((it) => {
    const q = it.unit === 'kg' ? num(it.qty, 3) : num(it.qty, 2);
    const u = it.unit && it.unit !== 'kg' ? ` ${escHtml(it.unit)}` : '';
    return `<span class="ps-art">${escHtml(it.name)} <b>×${q}${u}</b></span>`;
  }).join('');
}

async function loadDaySales() {
  try {
    const r = await api.reports.salesDay(psDay);
    $('psResult').classList.remove('hidden');
    $('psEmpty').classList.add('hidden');
    $('psSummary').innerHTML = `
      <div class="ps-stat"><div class="label">Tickets</div><div class="value">${r.summary.tickets}</div></div>
      <div class="ps-stat"><div class="label">Artículos vendidos</div><div class="value">${num(r.summary.articles, 2)}</div></div>
      <div class="ps-stat"><div class="label">Ingresos</div><div class="value">${moneyMX(r.summary.total)}</div></div>
      <div class="ps-stat"><div class="label">Compras (entradas)</div><div class="value">${moneyMX(r.summary.cost || 0)}</div></div>
      <div class="ps-stat"><div class="label">Utilidad</div><div class="value ${(r.summary.profit || 0) < 0 ? 'err' : ''}">${moneyMX(r.summary.profit || 0)}</div></div>`;
    const body = $('psBody');
    body.innerHTML = r.sales.length
      ? r.sales.map((s) => `
        <tr>
          <td><b>#${String(s.ticket_no || s.id).padStart(6, '0')}</b></td>
          <td>${s.time}</td>
          <td><span class="badge badge-ok">${escHtml(s.payment_method)}</span></td>
          <td>${fmtArticles(s.items)}</td>
          <td class="num"><b>${moneyMX(s.total_amount)}</b></td>
        </tr>`).join('')
      : `<tr><td colspan="5" class="muted" style="text-align:center;padding:24px;">Sin ventas el ${psDay}.</td></tr>`;
  } catch (e) {
    toast(e.message, 'error');
  }
}

loadDaySales();
psCalendar.refreshMarks();

/* ---------------- Entradas y Salidas de stock ---------------- */

let stockPage = 1;
const STOCK_PAGE_SIZE = 20;
let stockCategories = [];
let stockCategoryId = '';
let stockProductId = '';
let stockDate = today;
let stockSearch = '';

const stockCalendar = createDateCalendar({
  mount: $('stockCalendar'),
  value: today,
  onChange: (day) => {
    stockDate = day;
    stockPage = 1;
    loadStockMovements();
  },
  onMonthChange: () => { stockCalendar.refreshMarks(); },
});

if ($('stockGo')) {
  $('stockGo').addEventListener('click', () => {
    stockDate = stockCalendar.getValue();
    stockPage = 1;
    loadStockMovements();
  });
}

$('stockSearch').addEventListener('input', (e) => {
  stockSearch = e.target.value.trim();
  stockPage = 1;
  loadStockMovements();
});

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
  const mk = (label, value, count) => {
    const b = document.createElement('button');
    b.className = `prod-card stock-cat${String(value) === String(stockCategoryId) ? ' active' : ''}`;
    b.innerHTML = `
      <div class="prod-name">${label}</div>
      <div class="prod-count">${count}</div>
      <div class="prod-meta">producto(s) · movimientos del ${stockDate || today}</div>`;
    b.addEventListener('click', () => {
      stockCategoryId = String(value) === String(stockCategoryId) ? '' : String(value);
      stockProductId = '';
      stockPage = 1;
      renderStockCats();
      loadStockMovements();
    });
    wrap.appendChild(b);
  };
  mk('Todas', '', stockCategories.reduce((s, c) => s + (c.product_count || 0), 0));
  for (const c of stockCategories) mk(c.name, String(c.id), c.product_count || 0);
}

/* Solo se muestran los productos que SI movieron stock en el día elegido,
   para no llenarse de tarjetas de los 112 productos del inventario. */
function renderStockProducts(list) {
  const wrap = $('stockProducts');
  const head = $('stockProductsHead');
  if (!wrap) return;
  wrap.innerHTML = '';

const catName = stockCategoryId ? (stockCategories.find((c) => String(c.id) === stockCategoryId) || {}).name : '';
  const label = catName || '';
  if (list.length) {
    head.hidden = false;
    head.textContent = `Movieron stock · ${list.length} producto(s)${label ? ` · ${label}` : ''}`;
  } else {
    head.hidden = false;
    head.textContent = `Sin movimientos de stock el ${stockDate || today}${label ? ` · ${label}` : ''}.`;
  }

  if (!list.length) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  for (const p of list) {
    const b = document.createElement('button');
    b.className = `prod-card stock-prod${String(p.id) === String(stockProductId) ? ' active' : ''}`;
    b.title = p.barcode || '';
    const bits = [];
    if (p.entradas > 0) bits.push(`<span class="ok">+${stockNum(p.entradas, p.unit)}</span>`);
    if (p.salidas > 0) bits.push(`<span class="err">-${stockNum(p.salidas, p.unit)}</span>`);
    b.innerHTML = `
      <div class="prod-name">${escHtml(p.name)}</div>
      <div class="prod-count">${bits.join(' · ')}</div>
      <div class="prod-meta">stock ${stockNum(p.stock, p.unit)} ${p.unit}${p.is_bote ? ' · bote' : ''}</div>`;
    b.addEventListener('click', () => {
      stockProductId = String(p.id) === String(stockProductId) ? '' : String(p.id);
      stockPage = 1;
      loadStockMovements();
    });
    wrap.appendChild(b);
  }
}

async function loadStockMovements() {
  try {
    const data = await api.stock.movements({
      date: stockDate,
      category_id: stockProductId ? '' : stockCategoryId,
      product_id: stockProductId,
      search: stockSearch,
      page: stockPage,
      pageSize: STOCK_PAGE_SIZE,
    });
    renderStockProducts(data.products || []);
    const body = $('stockBody');
    body.innerHTML = data.movements.length
      ? data.movements.map((m) => `
        <tr>
          <td>${String(m.created_at).slice(11, 16)}</td>
          <td><b>${escHtml(m.product_name)}</b></td>
          <td class="num">${m.type === 'entrada' ? `<b class="ok">+${stockNum(m.quantity, m.unit)} ${m.unit}</b>` : ''}</td>
          <td class="num">${m.type === 'salida' ? `<b class="err">-${stockNum(m.quantity, m.unit)} ${m.unit}</b>` : ''}</td>
          <td class="num">${m.unit_cost != null ? moneyMX(m.unit_cost) : '<span class="muted">—</span>'}</td>
          <td class="num">${m.total_cost != null ? `<b>${moneyMX(m.total_cost)}</b>` : '<span class="muted">—</span>'}</td>
          <td class="muted">${escHtml(m.reason || '—')}</td>
        </tr>`).join('')
      : `<tr><td colspan="7" class="muted" style="text-align:center;padding:20px;">Sin movimientos de stock el ${stockDate || today}.</td></tr>`;

const pag = $('stockPagination');
    const totalPages = Math.max(1, Math.ceil(data.total / STOCK_PAGE_SIZE));
    pag.innerHTML = '';
    if (totalPages > 1) {
      const mk = (label2, page, disabled, primary = false) => {
        const b = document.createElement('button');
        b.className = `btn btn-sm ${primary ? '' : 'btn-outline'}`;
        b.textContent = label2;
        b.disabled = disabled;
        b.addEventListener('click', () => { stockPage = page; loadStockMovements(); });
        pag.appendChild(b);
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
loadStockMovements();
stockCalendar.refreshMarks();
