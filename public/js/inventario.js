const $ = (id) => document.getElementById(id);

let state = {
  page: 1,
  pageSize: 10,
  search: '',
  category_id: '',
  lowStock: false,
  totalPages: 1,
  categories: [],
};

/* ---------------- Carga de listas ---------------- */

async function loadCategories() {
  state.categories = await api.categories.list();
  fillSelect($('catFilter'), state.categories);
  fillSelect($('fCategory'), state.categories);
}

async function loadProducts() {
  try {
    const data = await api.products.list({
      page: state.page, pageSize: state.pageSize,
      search: state.search, category_id: state.category_id,
      lowStock: state.lowStock ? 1 : '',
    });
    renderTable(data.products);
    state.totalPages = Math.max(1, Math.ceil(data.total / state.pageSize));
    renderPagination(data.total);
    updateLowStockBanner();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function updateLowStockBanner() {
  const banner = $('lowStockBanner');
  const rows = [...document.querySelectorAll('#tbody tr')];
  const lowCount = rows.filter((r) => r.dataset.low === '1').length;
  if (lowCount > 0 && !state.lowStock) {
    banner.textContent = `⚠️ Alerta: ${lowCount} producto(s) con stock bajo (stock ≤ mínimo) en esta página.`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

function renderTable(products) {
  const tbody = $('tbody');
  tbody.innerHTML = '';
  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="muted" style="text-align:center;padding:28px;">Sin productos.</td></tr>`;
    return;
  }
  for (const p of products) {
    const low = p.stock <= p.min_stock;
    const profit = p.selling_price - p.cost_price;
    const tr = document.createElement('tr');
    tr.dataset.low = low ? '1' : '0';
    if (low) tr.style.background = 'var(--danger-bg)';
    tr.innerHTML = `
      <td class="muted">${p.barcode}</td>
      <td><b>${p.name}</b> <span class="muted">(${p.unit})</span></td>
      <td>${p.category_name || '<span class="muted">—</span>'}</td>
      <td class="num">${money(p.cost_price)}</td>
      <td class="num">${money(p.selling_price)}</td>
      <td class="num"><b>${num(p.stock, 2)}</b> ${low ? '<span class="badge badge-low">bajo</span>' : ''}</td>
      <td class="num">${num(p.min_stock, 2)}</td>
      <td class="num ${profit < 0 ? 'muted' : ''}">${money(profit)}</td>
      <td class="num">
        <button class="btn btn-outline btn-sm edit-btn" data-id="${p.id}">Editar</button>
        <button class="btn btn-danger btn-sm del-btn" data-id="${p.id}">🗑</button>
      </td>`;
    tbody.appendChild(tr);
  }
}

function renderPagination(total) {
  const wrap = $('pagination');
  wrap.innerHTML = '';
  if (state.totalPages <= 1) return;
  const btn = (label, page, disabled = false, primary = false) => {
    const b = document.createElement('button');
    b.className = `btn btn-sm ${primary ? '' : 'btn-outline'}`;
    b.textContent = label;
    b.disabled = disabled;
    b.addEventListener('click', () => { state.page = page; loadProducts(); });
    wrap.appendChild(b);
  };
  btn('‹ Ant', state.page - 1, state.page === 1);
  btn(`Página ${state.page} de ${state.totalPages} · ${total} registros`, state.page, true, true);
  btn('Sig ›', state.page + 1, state.page === state.totalPages);
}

/* ---------------- CRUD de productos ---------------- */

function openProductModal(product = null) {
  const title = $('modalTitle');
  const form = {
    name: $('fName'), barcode: $('fBarcode'), category: $('fCategory'),
    cost: $('fCost'), price: $('fPrice'), stock: $('fStock'),
    minStock: $('fMinStock'), unit: $('fUnit'),
  };
  fillSelect(form.category, state.categories);
  if (product) {
    title.textContent = `Editar: ${product.name}`;
    form.name.value = product.name;
    form.barcode.value = product.barcode;
    form.category.value = product.category_id || '';
    form.cost.value = product.cost_price;
    form.price.value = product.selling_price;
    form.stock.value = product.stock;
    form.minStock.value = product.min_stock;
    form.unit.value = product.unit;
    $('productModal').dataset.editingId = product.id;
  } else {
    title.textContent = 'Nuevo producto';
    form.name.value = ''; form.barcode.value = ''; form.category.value = '';
    form.cost.value = ''; form.price.value = ''; form.stock.value = ''; form.minStock.value = '';
    form.unit.value = 'pza';
    $('productModal').dataset.editingId = '';
  }
  $('productModal').classList.add('show');
  setTimeout(() => form.name.focus(), 50);
}

async function saveProduct() {
  const modal = $('productModal');
  const id = modal.dataset.editingId;
  const body = {
    name: $('fName').value.trim(),
    barcode: $('fBarcode').value.trim(),
    category_id: $('fCategory').value || null,
    cost_price: parseFloat($('fCost').value) || 0,
    selling_price: parseFloat($('fPrice').value) || 0,
    stock: parseFloat($('fStock').value) || 0,
    min_stock: parseFloat($('fMinStock').value) || 0,
    unit: $('fUnit').value.trim() || 'pza',
  };
  if (!body.name) return toast('El nombre es obligatorio', 'error');
  if (!body.barcode) return toast('El código de barras es obligatorio', 'error');
  try {
    if (id) await api.products.update(id, body);
    else await api.products.create(body);
    modal.classList.remove('show');
    toast('Producto guardado.');
    loadProducts();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteProduct(id, name) {
  confirmDialog(`¿Eliminar el producto "<b>${name}</b>"? Esta acción no se puede deshacer.`, async () => {
    try {
      await api.products.remove(id);
      toast('Producto eliminado.');
      loadProducts();
    } catch (e) {
      toast(e.message, 'error');
    }
  });
}

/* ---------------- Categorías ---------------- */

async function renderCats() {
  const cats = await api.categories.list();
  state.categories = cats;
  fillSelect($('catFilter'), cats);
  const tbody = $('catsTbody');
  tbody.innerHTML = '';
  for (const c of cats) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" class="cat-name" data-id="${c.id}" value="${c.name}"></td>
      <td class="num">${c.product_count}</td>
      <td class="num">
        <button class="btn btn-success btn-sm cat-save" data-id="${c.id}">Guardar</button>
        <button class="btn btn-danger btn-sm cat-del" data-id="${c.id}" ${c.product_count ? 'disabled title="Tiene productos"' : ''}>🗑</button>
      </td>`;
    tbody.appendChild(tr);
  }
}

$('catsTbody').addEventListener('click', async (e) => {
  const save = e.target.closest('.cat-save');
  const del = e.target.closest('.cat-del');
  if (save) {
    const input = document.querySelector(`.cat-name[data-id="${save.dataset.id}"]`);
    try {
      await api.categories.update(save.dataset.id, { name: input.value.trim() });
      toast('Categoría actualizada.');
      renderCats();
      loadProducts();
    } catch (err) { toast(err.message, 'error'); }
  }
  if (del) {
    const name = document.querySelector(`.cat-name[data-id="${del.dataset.id}"]`).value;
    confirmDialog(`¿Eliminar la categoría "<b>${name}</b>"?`, async () => {
      try { await api.categories.remove(del.dataset.id); toast('Categoría eliminada.'); renderCats(); loadProducts(); }
      catch (err) { toast(err.message, 'error'); }
    });
  }
});

/* ---------------- Export / Import ---------------- */

async function exportInventory() {
  try {
    const data = await api.products.exportAll();
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(data, `inventario-${date}.json`);
    toast(`Inventario exportado (${data.products.length} productos).`);
  } catch (e) { toast(e.message, 'error'); }
}

async function importInventory(file) {
  try {
    const rows = await readJsonFile(file);
    const res = await api.products.import(rows);
    toast(res.message);
    loadProducts();
    loadCategories();
  } catch (e) {
    toast('Error al importar: ' + e.message, 'error');
  }
}

/* ---------------- Eventos ---------------- */

$('searchInput').addEventListener('input', () => { state.search = $('searchInput').value; state.page = 1; loadProducts(); });
$('catFilter').addEventListener('change', () => { state.category_id = $('catFilter').value; state.page = 1; loadProducts(); });
$('lowStockOnly').addEventListener('change', () => { state.lowStock = $('lowStockOnly').checked; state.page = 1; loadProducts(); });
$('newBtn').addEventListener('click', () => openProductModal());

$('tbody').addEventListener('click', async (e) => {
  const edit = e.target.closest('.edit-btn');
  const del = e.target.closest('.del-btn');
  if (edit) {
    try { const p = await api.products.get(edit.dataset.id); openProductModal(p); }
    catch (err) { toast(err.message, 'error'); }
  }
  if (del) {
    const p = await api.products.get(del.dataset.id).catch(() => null);
    if (p) deleteProduct(p.id, p.name);
  }
});

$('productSave').addEventListener('click', saveProduct);
$('productCancel').addEventListener('click', () => $('productModal').classList.remove('show'));
$('catsBtn').addEventListener('click', () => { renderCats(); $('catsModal').classList.add('show'); });
$('catsClose').addEventListener('click', () => $('catsModal').classList.remove('show'));
$('addCatBtn').addEventListener('click', async () => {
  const name = $('newCatName').value.trim();
  if (!name) return;
  try { await api.categories.create({ name }); $('newCatName').value = ''; toast('Categoría creada.'); renderCats(); }
  catch (e) { toast(e.message, 'error'); }
});
$('exportBtn').addEventListener('click', exportInventory);
$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', (e) => {
  if (e.target.files[0]) importInventory(e.target.files[0]);
  e.target.value = '';
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-backdrop.show').forEach((m) => m.classList.remove('show'));
  }
});

loadCategories().then(loadProducts);
