const $ = (id) => document.getElementById(id);

let state = {
  page: 1,
  pageSize: 10,
  search: '',
  category_id: '',
  lowStock: false,
  totalPages: 1,
  categories: [],
  botes: [],
};

/* ---------------- Carga de listas ---------------- */

async function loadCategories() {
  state.categories = await api.categories.list();
  fillSelect($('fCategory'), state.categories);
  renderCatPills();
  loadBotes();
}

const HELADOS_CAT_NAME = 'Helados';

function isHeladosCat(catId) {
  const cat = state.categories.find((c) => String(c.id) === String(catId));
  return !!cat && cat.name.trim().toLowerCase() === HELADOS_CAT_NAME.toLowerCase();
}

async function loadBotes() {
  try {
    let page = 1;
    const all = [];
    let total = Infinity;
    while (all.length < total) {
      const data = await api.products.list({ page, pageSize: 100 });
      all.push(...data.products);
      total = data.total;
      if (!data.products.length) break;
      page++;
    }
    state.botes = all.filter((p) => p.is_bote);
    for (const sel of [$('fRecipeBote'), $('fRecipeBote2')]) {
      sel.innerHTML = '';
      const o = document.createElement('option');
      o.value = '';
      o.textContent = '— Sin bote —';
      sel.appendChild(o);
      for (const b of state.botes) {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = `${b.name} (${stockNum(b.stock, b.unit)} ${b.unit})`;
        sel.appendChild(opt);
      }
    }
    const contSel = $('fContainer');
    if (contSel) {
      contSel.innerHTML = '';
      const o = document.createElement('option');
      o.value = '';
      o.textContent = '— Sin contenedor —';
      contSel.appendChild(o);
      const containers = all.filter((p) => !p.is_bote);
      state.containerNames = Object.fromEntries(containers.map((p) => [p.id, p.name]));
      for (const c of containers) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name} (${stockNum(c.stock, c.unit)} ${c.unit})`;
        contSel.appendChild(opt);
      }
    }
  } catch (e) { /* el selector de botes quedará vacío */ }
}

function updateRecipeVisibility() {
  const isHelados = isHeladosCat($('fCategory').value);
  const isBote = $('fIsBote').checked;
  document.querySelectorAll('.recipe-wrap').forEach((el) => el.classList.toggle('hidden', !isHelados));
  document.querySelectorAll('.recipe-helado-wrap').forEach((el) => el.classList.toggle('hidden', !(isHelados && !isBote)));
}

function renderCatPills() {
  const wrap = $('catPills');
  wrap.innerHTML = '';
  const mk = (label, value, active) => {
    const b = document.createElement('button');
    b.className = `cat-pill${active ? ' active' : ''}`;
    b.textContent = label;
    b.addEventListener('click', () => {
      state.category_id = value;
      state.page = 1;
      renderCatPills();
      loadProducts();
    });
    wrap.appendChild(b);
  };
  mk('Todas', '', !state.category_id);
  for (const c of state.categories) mk(c.name, String(c.id), state.category_id === String(c.id));
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

/* ---------------- Borrado masivo ---------------- */

async function deleteAllProducts() {
  confirmDialog('¿Eliminar <b>TODOS</b> los productos del inventario? Esta acción no se puede deshacer.', async () => {
    try {
      const r = await api.products.deleteAll();
      toast(`Se eliminaron ${r.deleted} producto(s).`);
      loadProducts();
    } catch (e) {
      toast(e.message, 'error');
    }
  });
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
    tbody.innerHTML = `<tr><td colspan="8" class="muted" style="text-align:center;padding:28px;">Sin productos.</td></tr>`;
    return;
  }
  for (const p of products) {
    const low = p.stock <= p.min_stock;
    const active = p.is_active !== 0;
    const recipeNote = p.is_bote
      ? '<span class="badge" style="background:#fff3e0;color:#b36b00;">bote de helado</span>'
      : p.recipe_grams > 0
        ? `<span class="badge" style="background:#e8f5e9;color:#2e7d32;">${p.recipe_grams} g${p.recipe_grams2 > 0 ? ` + ${p.recipe_grams2} g` : ''} de bote</span>`
        : '';
    const containerNote = p.container_product_id && !p.is_bote
      ? `<span class="badge" style="background:#f3e5f5;color:#6a1b9a;">descuenta ${(state.containerNames || {})[p.container_product_id] || 'contenedor'}</span>`
      : '';
    const tr = document.createElement('tr');
    tr.dataset.low = low ? '1' : '0';
    if (!active) tr.style.opacity = '0.55';
    if (low) tr.style.background = 'var(--danger-bg)';
    tr.innerHTML = `
      <td class="muted">${p.barcode}</td>
      <td><b>${p.name}</b> <span class="muted">(${p.unit})</span> ${recipeNote}${containerNote}</td>
      <td>${p.category_name || '<span class="muted">—</span>'}</td>
      <td class="num">${money(p.selling_price)}${p.unit === 'kg' && Number(p.price_500g) > 0 ? `<div class="muted" style="font-size:12px;">${money(p.price_500g)}/kg desde 500 g</div>` : ''}</td>
      <td class="num"><b>${stockNum(p.stock, p.unit)}</b> ${low ? '<span class="badge badge-low">bajo</span>' : ''}</td>
      <td class="num">${stockNum(p.min_stock, p.unit)}</td>
      <td class="num">
        <label class="toggle-label" title="${active ? 'Activo' : 'Inactivo'}">
          <input type="checkbox" class="active-toggle" data-id="${p.id}" ${active ? 'checked' : ''}>
          <span class="toggle-switch"></span>
          <span class="toggle-text">${active ? 'Activo' : 'Inactivo'}</span>
        </label>
      </td>
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

/* ---------------- Entrada de mercancía ---------------- */

let entryProducts = [];
let entryProductId = '';

const r3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

async function openEntryModal() {
  let products;
  try {
    products = await fetchAllProducts();
  } catch (e) {
    return toast(e.message, 'error');
  }
  entryProducts = products;
  entryProductId = '';
  $('entrySearch').value = '';
  $('entrySuggestions').innerHTML = '';
  $('entryNewStock').value = '';
  $('entryReason').value = '';
  updateEntryStockInfo();
  $('entryModal').classList.add('show');
  setTimeout(() => $('entrySearch').focus(), 50);
}

function selectedEntryProduct() {
  return entryProducts.find((p) => String(p.id) === String(entryProductId)) || null;
}

function renderEntrySuggestions() {
  const box = $('entrySuggestions');
  const q = $('entrySearch').value.trim();
  if (!q) { box.innerHTML = ''; return; }
  const lq = q.toLowerCase();
  const exactCode = entryProducts.find((p) => p.barcode && p.barcode.trim().toLowerCase() === lq);
  if (exactCode) return selectEntryProduct(exactCode);
  const matches = entryProducts
    .filter((p) => p.name.toLowerCase().includes(lq) || (p.barcode && p.barcode.toLowerCase().includes(lq)))
    .slice(0, 8);
  box.innerHTML = matches.length
    ? matches.map((p) => `
        <button type="button" class="suggest-item" data-id="${p.id}">
          <b>${p.name}</b> <span class="muted">(${stockNum(p.stock, p.unit)} ${p.unit}${p.barcode ? ' · ' + p.barcode : ''})</span>
        </button>`).join('')
    : `<div class="muted" style="padding:8px 4px;">Sin coincidencias.</div>`;
  box.querySelectorAll('.suggest-item').forEach((b) => {
    b.addEventListener('click', () => {
      const p = entryProducts.find((x) => String(x.id) === b.dataset.id);
      if (p) selectEntryProduct(p);
    });
  });
}

function selectEntryProduct(p) {
  entryProductId = String(p.id);
  $('entrySearch').value = p.name;
  $('entrySuggestions').innerHTML = '';
  updateEntryStockInfo();
  $('entryNewStock').focus();
}

function updateEntryStockInfo() {
  const p = selectedEntryProduct();
  $('entryCurrentStock').value = p ? r3(p.stock) : '';
  updateEntryCalc();
}

function updateEntryCalc() {
  const p = selectedEntryProduct();
  const qty = r3(parseFloat($('entryNewStock').value));
  const current = p ? r3(p.stock) : 0;
  const hint = $('entryCalc');
  if (!(qty > 0)) {
    hint.textContent = `Se suman: 0 · escribe cuánto llega${p ? ` (${p.unit})` : ''}`;
    hint.style.color = 'var(--danger)';
  } else {
    hint.textContent = `Se suman ${stockNum(qty, p ? p.unit : '')} ${p ? p.unit : ''} → quedará ${stockNum(current + qty, p ? p.unit : '')} ${p ? p.unit : ''}`;
    hint.style.color = '';
  }
}

function confirmEntryProduct() {
  const q = $('entrySearch').value.trim();
  if (!q) return;
  const lq = q.toLowerCase();
  const exactCode = entryProducts.find((p) => p.barcode && p.barcode.trim().toLowerCase() === lq);
  const target = exactCode || entryProducts.find((p) => p.name.toLowerCase() === lq);
  if (target) return selectEntryProduct(target);
  const matches = entryProducts.filter((p) => p.name.toLowerCase().includes(lq) || (p.barcode && p.barcode.toLowerCase().includes(lq)));
  if (matches.length === 1) return selectEntryProduct(matches[0]);
  if (matches.length > 1) return toast(`Varios productos coinciden con "${q}". Elige uno de la lista.`, 'error');
  toast('Producto no encontrado.', 'error');
}

async function saveStockEntry() {
  const p = selectedEntryProduct();
  if (!p) return toast('Selecciona un producto', 'error');
  const quantity = r3(parseFloat($('entryNewStock').value));
  if (!(quantity > 0)) return toast('Escribe la cantidad que llega (mayor a 0)', 'error');
  try {
    const r = await api.stock.entry({
      product_id: p.id,
      quantity,
      reason: $('entryReason').value.trim(),
    });
    $('entryModal').classList.remove('show');
    toast(`Entrada registrada. Stock actual: ${stockNum(r.stock, p.unit)} ${p.unit}`);
    loadProducts();
  } catch (e) {
    toast(e.message, 'error');
  }
}

$('entryBtn').addEventListener('click', openEntryModal);
$('entrySearch').addEventListener('input', renderEntrySuggestions);
$('entrySearch').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); confirmEntryProduct(); }
});
$('entryNewStock').addEventListener('input', updateEntryCalc);
$('entryNewStock').addEventListener('blur', () => {
  const v = $('entryNewStock');
  if (v.value !== '') v.value = r3(parseFloat(v.value));
  updateEntryCalc();
});
$('entrySave').addEventListener('click', saveStockEntry);
$('entryCancel').addEventListener('click', () => $('entryModal').classList.remove('show'));

/* ---------------- CRUD de productos ---------------- */

async function openProductModal(product = null) {
  await loadBotes();
  const title = $('modalTitle');
  const form = {
    name: $('fName'), barcode: $('fBarcode'), category: $('fCategory'),
    price: $('fPrice'),
    stock: $('fStock'), minStock: $('fMinStock'), unit: $('fUnit'),
  };
  fillSelect(form.category, state.categories);
  if (product) {
    title.textContent = `Editar: ${product.name}`;
    form.name.value = product.name;
    form.barcode.value = product.barcode;
    form.category.value = product.category_id || '';
    form.price.value = product.selling_price;
    $('fPrice500').value = product.price_500g != null && product.price_500g !== '' ? product.price_500g : '';
    form.stock.value = product.stock;
    form.minStock.value = product.min_stock;
    form.unit.value = product.unit;
    $('fIsBote').checked = !!product.is_bote;
    $('fRecipeBote').value = product.recipe_bote_id || '';
    $('fRecipeGrams').value = product.recipe_grams || '';
    $('fRecipeBote2').value = product.recipe_bote_id2 || '';
    $('fRecipeGrams2').value = product.recipe_grams2 || '';
    $('fContainer').value = product.container_product_id || '';
    $('productModal').dataset.editingId = product.id;
  } else {
    title.textContent = 'Nuevo producto';
    form.name.value = ''; form.barcode.value = ''; form.category.value = '';
    form.price.value = ''; 
    $('fPrice500').value = '';
    form.stock.value = ''; form.minStock.value = '';
    form.unit.value = 'pza';
    $('fIsBote').checked = false;
    $('fRecipeBote').value = '';
    $('fRecipeGrams').value = '';
    $('fRecipeBote2').value = '';
    $('fRecipeGrams2').value = '';
    $('fContainer').value = '';
    $('productModal').dataset.editingId = '';
  }
  updatePrice500Visibility();
  updateRecipeVisibility();
  $('productModal').classList.add('show');
  renderBarcodePreview();
  setTimeout(() => form.name.focus(), 50);
}

function updatePrice500Visibility() {
  const isKg = $('fUnit').value.trim() === 'kg';
  $('price500Wrap').classList.toggle('hidden', !isKg);
}

$('fUnit').addEventListener('input', updatePrice500Visibility);
$('fCategory').addEventListener('change', updateRecipeVisibility);
$('fIsBote').addEventListener('change', updateRecipeVisibility);

async function saveProduct() {
  const modal = $('productModal');
  const id = modal.dataset.editingId;
  const body = {
    name: $('fName').value.trim(),
    barcode: $('fBarcode').value.trim(),
    category_id: $('fCategory').value || null,
    selling_price: parseFloat($('fPrice').value) || 0,
    price_500g: $('fUnit').value.trim() === 'kg' && $('fPrice500').value !== '' ? parseFloat($('fPrice500').value) : null,
    stock: parseFloat($('fStock').value) || 0,
    min_stock: parseFloat($('fMinStock').value) || 0,
    unit: $('fUnit').value.trim() || 'pza',
    is_bote: $('fIsBote').checked ? 1 : 0,
    container_product_id: $('fContainer').value ? Number($('fContainer').value) : null,
    recipe_grams: $('fRecipeGrams').value !== '' ? parseFloat($('fRecipeGrams').value) || 0 : 0,
    recipe_bote_id: $('fRecipeBote').value ? Number($('fRecipeBote').value) : null,
    recipe_grams2: $('fRecipeGrams2').value !== '' ? parseFloat($('fRecipeGrams2').value) || 0 : 0,
    recipe_bote_id2: $('fRecipeBote2').value ? Number($('fRecipeBote2').value) : null,
  };
  if (!body.name) return toast('El nombre es obligatorio', 'error');
  if (!body.barcode) return toast('El código de barras es obligatorio', 'error');
  if (body.is_bote && (body.recipe_bote_id || body.recipe_bote_id2 || body.container_product_id)) {
    return toast('Un bote de helado no puede tener receta ni contenedor (descuenta de sí mismo).', 'error');
  }
  if (body.container_product_id && String(body.container_product_id) === String(id)) {
    return toast('El contenedor no puede ser el mismo producto.', 'error');
  }
  if (body.recipe_bote_id2 && !(body.recipe_grams2 > 0)) {
    return toast('Indica los gramos del 2º bote.', 'error');
  }
  if (!body.is_bote && isHeladosCat(body.category_id) && (!body.recipe_bote_id || !(body.recipe_grams > 0))) {
    return toast('Indica el bote del que descuenta y los gramos por pieza.', 'error');
  }
  if (!body.is_bote && (body.recipe_bote_id || body.recipe_bote_id2 || body.container_product_id)) {
    body.stock = 0;
    body.min_stock = 0;
  }
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

/* ---------------- Generador de código de barras ---------------- */

const cleanCodePart = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();

async function generateBarcode() {
  const name = $('fName').value.trim();
  const catId = $('fCategory').value;
  const cat = state.categories.find((c) => String(c.id) === String(catId));
  if (!cat) return toast('Selecciona una categoría para generar el código.', 'error');
  if (!name) return toast('Escribe el nombre del producto para generar el código.', 'error');

  const catPart = cleanCodePart(cat.name).slice(0, 2);
  const namePart = cleanCodePart(name).slice(0, 2);
  if (catPart.length < 2) return toast('La categoría necesita al menos 2 letras.', 'error');
  if (namePart.length < 2) return toast('El nombre necesita al menos 2 letras.', 'error');

  const editingId = $('productModal').dataset.editingId;
  for (let i = 0; i < 50; i++) {
    const digits = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const code = catPart + namePart + digits;
    if (await isBarcodeFree(code, editingId)) {
      $('fBarcode').value = code;
      renderBarcodePreview();
      return toast(`Código generado: ${code}`);
    }
  }
  toast('No se pudo generar un código único, intenta de nuevo.', 'error');
}

async function generateBarcodesForAll() {
  let products;
  try {
    products = await fetchAllProducts();
  } catch (e) {
    return toast(e.message, 'error');
  }
  if (!products.length) return toast('No hay productos en el inventario.');

  confirmDialog(
    `Se regenerará el código de barras de los <b>${products.length}</b> producto(s) existentes (categoría + nombre + 2 números). ¿Continuar?`,
    async () => {
      const catName = new Map(state.categories.map((c) => [String(c.id), c.name]));
      const used = new Set(products.map((p) => String(p.barcode || '').trim()).filter(Boolean));
      const btn = $('genAllBarcodesBtn');
      btn.disabled = true;
      let done = 0, failed = 0;
      try {
        for (const p of products) {
          const ownCode = String(p.barcode || '').trim();
          if (ownCode) used.delete(ownCode);
          const code = await generateUniqueCode(p, catName, used);
          if (!code) { failed++; continue; }
          try {
            await api.products.update(p.id, { barcode: code });
            used.add(code);
            done++;
          } catch (e) { failed++; }
        }
        toast(`Códigos regenerados: ${done}${failed ? `, sin asignar: ${failed}` : ''}.`);
        loadProducts();
      } finally {
        btn.disabled = false;
      }
    }
  );
}

async function generateUniqueCode(p, catName, used) {
  const catPart = cleanCodePart(catName.get(String(p.category_id))).slice(0, 2) || 'GE';
  const namePart = cleanCodePart(p.name).slice(0, 2) || 'XX';
  for (let i = 0; i < 50; i++) {
    const digits = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const code = catPart + namePart + digits;
    if (used.has(code)) continue;
    if (await isBarcodeFree(code)) return code;
  }
  return '';
}

async function isBarcodeFree(code, editingId) {
  try {
    const r = await api.products.checkBarcode(code, editingId);
    return r.available;
  } catch (e) {
    return false;
  }
}

/* ---------------- Código de barras (vista previa / etiqueta) ---------------- */

function renderBarcodePreview() {
  const code = $('fBarcode').value.trim();
  const wrap = $('barcodePreviewWrap');
  if (!code) { wrap.classList.add('hidden'); return; }
  try {
    JsBarcode('#barcodePreview', code, { format: 'CODE128', width: 2, height: 50, margin: 2, displayValue: false });
    wrap.classList.remove('hidden');
  } catch (e) {
    wrap.classList.add('hidden');
  }
}

function printBarcodeLabel() {
  const code = $('fBarcode').value.trim();
  if (!code) return toast('Primero escribe o genera un código.', 'error');
  let holder = document.getElementById('barcodeLabelHolder');
  if (!holder) {
    holder = document.createElement('div');
    holder.id = 'barcodeLabelHolder';
    holder.className = 'ticket-print-area';
    document.body.appendChild(holder);
  }
  holder.innerHTML = `
    <div id="barcodePrint" class="barcode-label">
      <div class="bl-brand">VILLA ALEGRE</div>
      <svg id="barcodePrintSvg"></svg>
      <div class="bl-code">${code}</div>
    </div>`;
  try {
    JsBarcode('#barcodePrintSvg', code, { format: 'CODE128', width: 2, height: 60, margin: 0, displayValue: false });
    window.print();
  } catch (e) {
    toast('No se pudo generar el código de barras: ' + e.message, 'error');
  }
}

$('genBarcodeBtn').addEventListener('click', generateBarcode);
$('printBarcodeBtn').addEventListener('click', printBarcodeLabel);
$('fBarcode').addEventListener('input', renderBarcodePreview);

/* ---------------- Export / Import ---------------- */

async function fetchAllProducts() {
  let page = 1;
  let all = [];
  let total = Infinity;
  while (all.length < total) {
    const data = await api.products.list({ page, pageSize: 100 });
    all = all.concat(data.products);
    total = data.total;
    if (!data.products.length) break;
    page++;
  }
  return all;
}

const pdfSanitize = (s) => String(s == null ? '' : s).replace(/[^\x00-\xFF]/g, '?');

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(s);
  });
}

async function exportBarcodes() {
  if (!window.jspdf) await loadScript('vendor/jspdf.umd.min.js');
  let products;
  try {
    products = await fetchAllProducts();
  } catch (e) {
    return toast(e.message, 'error');
  }
  const withCode = products.filter((p) => p.barcode && String(p.barcode).trim());
  if (!withCode.length) return toast('No hay productos con código de barras.', 'error');

  const groups = {};
  for (const p of withCode) {
    const cat = p.category_name || 'Sin categoría';
    (groups[cat] = groups[cat] || []).push(p);
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const usable = pageW - margin * 2;
  const gap = 3;

  const canvas = document.createElement('canvas');
  let firstCat = true;

  const categoryLayout = (n, contentArea) => {
    let cols = 1;
    for (let c = 1; c <= 4; c++) {
      const rows = Math.ceil(n / c);
      const boxH = (contentArea - gap * (rows - 1)) / rows;
      if (boxH >= 24 || c === 4) { cols = c; break; }
    }
    const rows = Math.ceil(n / cols);
    const boxH = Math.min((contentArea - gap * (rows - 1)) / rows, 60);
    const labelW = (usable - gap * (cols - 1)) / cols;
    return { cols, boxH, labelW };
  };

  for (const [cat, list] of Object.entries(groups)) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'es'));

    if (firstCat) firstCat = false;
    else doc.addPage();

    let y = margin + 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(pdfSanitize(cat), margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(`${list.length} producto(s)`, pageW - margin, y, { align: 'right' });
    y += 5;
    doc.setDrawColor(0);
    doc.setLineWidth(0.6);
    doc.line(margin, y, pageW - margin, y);
    y += 5;
    const contentTop = y + 10;
    const contentArea = pageH - margin - contentTop;

    const { cols, boxH, labelW } = categoryLayout(list.length, contentArea);
    const codeH = 5;

    list.forEach((p, i) => {
      const code = String(p.barcode).trim();
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = margin + col * (labelW + gap);
      const yBox = contentTop + row * (boxH + gap);

      doc.setDrawColor(170);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, yBox, labelW, boxH, 2, 2);

      const nameFont = boxH < 28 ? 8.5 : boxH < 40 ? 10 : 12;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(nameFont);
      const nameLines = doc.splitTextToSize(pdfSanitize(p.name), labelW - 10);
      const shown = nameLines.slice(0, 2);
      const nameH = shown.length * (nameFont <= 9 ? 3.5 : 5);
      doc.text(shown, x + labelW / 2, yBox + 5 + nameH - (nameFont <= 9 ? 3 : 5), { align: 'center' });

      const barcodeH = Math.max(6, Math.min(20, boxH - nameH - codeH - 6));
      const barcodeTop = yBox + 5 + nameH + 1;
      try {
        JsBarcode(canvas, code, { format: 'CODE128', width: 2, height: 40, displayValue: false, margin: 0 });
        const img = canvas.toDataURL('image/png');
        const aspect = canvas.width / canvas.height;
        const maxW = labelW - 10;
        let w = maxW;
        let h = w / aspect;
        if (h > barcodeH) { h = barcodeH; w = h * aspect; }
        if (w > maxW) { w = maxW; h = w / aspect; }
        doc.addImage(img, 'PNG', x + labelW / 2 - w / 2, barcodeTop, w, h);
      } catch (e) { /* sin barras */ }

      const codeFont = boxH < 28 ? 8 : boxH < 40 ? 10 : 12;
      doc.setFont('courier', 'bold');
      doc.setFontSize(codeFont);
      doc.text(pdfSanitize(code), x + labelW / 2, yBox + boxH - 3, { align: 'center' });
    });
  }

  const date = new Date().toISOString().slice(0, 10);
  doc.save(`codigos-de-barras-${date}.pdf`);
  toast(`PDF generado: ${withCode.length} productos en ${Object.keys(groups).length} categoría(s).`);
}

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

const DEV_KEY = 'saul19505';
const DEV_BUTTONS = ['genAllBarcodesBtn', 'exportBarcodesBtn', 'exportBtn', 'importBtn', 'waLowStockBtn', 'waResetBtn'];
let devMode = false;

$('searchInput').addEventListener('input', (e) => {
  if (e.target.value === DEV_KEY && !devMode) {
    devMode = true;
    e.target.value = '';
    state.search = '';
    state.page = 1;
    DEV_BUTTONS.forEach((id) => $(id).classList.remove('hidden'));
    loadProducts();
    toast('Modo desarrollador activado.');
  } else {
    state.search = e.target.value;
    state.page = 1;
    loadProducts();
  }
});
$('lowStockOnly').addEventListener('change', () => { state.lowStock = $('lowStockOnly').checked; state.page = 1; loadProducts(); });
$('newBtn').addEventListener('click', () => openProductModal());
$('deleteAllBtn').addEventListener('click', deleteAllProducts);

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

$('tbody').addEventListener('change', async (e) => {
  const toggle = e.target.closest('.active-toggle');
  if (!toggle) return;
  const active = toggle.checked ? 1 : 0;
  try {
    await api.products.update(toggle.dataset.id, { is_active: active });
    toast(active ? 'Producto activado.' : 'Producto desactivado (se oculta en Vender).');
    loadProducts();
  } catch (err) {
    toast(err.message, 'error');
    loadProducts();
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
$('genAllBarcodesBtn').addEventListener('click', generateBarcodesForAll);
$('exportBarcodesBtn').addEventListener('click', exportBarcodes);
$('waLowStockBtn').addEventListener('click', async () => {
  try {
    const r = await api.whatsapp.lowstock();
    toast('Alerta de stock enviada a WhatsApp.');
  } catch (e) {
    toast(e.message, 'error');
  }
});
$('waResetBtn').addEventListener('click', () => {
  confirmDialog('¿Reiniciar la sesión de WhatsApp? Se borrará el QR actual y tendrás que escanear uno nuevo con la cuenta que enviará los mensajes.', async () => {
    try {
      await api.whatsapp.resetSession();
      toast('Sesión reiniciada. Escanea el nuevo QR en la página Vender.');
    } catch (e) {
      toast(e.message, 'error');
    }
  });
});
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
