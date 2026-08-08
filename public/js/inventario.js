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
  fillSelect($('fCategory'), state.categories);
  renderCatPills();
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
    const tr = document.createElement('tr');
    tr.dataset.low = low ? '1' : '0';
    if (!active) tr.style.opacity = '0.55';
    if (low) tr.style.background = 'var(--danger-bg)';
    tr.innerHTML = `
      <td class="muted">${p.barcode}</td>
      <td><b>${p.name}</b> <span class="muted">(${p.unit})</span></td>
      <td>${p.category_name || '<span class="muted">—</span>'}</td>
      <td class="num">${money(p.selling_price)}${p.unit === 'kg' && p.price_per_100g ? `<div class="muted" style="font-size:12px;">${money(p.price_per_100g)}/100g</div>` : ''}</td>
      <td class="num"><b>${num(p.stock, 2)}</b> ${low ? '<span class="badge badge-low">bajo</span>' : ''}</td>
      <td class="num">${num(p.min_stock, 2)}</td>
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

/* ---------------- CRUD de productos ---------------- */

function openProductModal(product = null) {
  const title = $('modalTitle');
  const form = {
    name: $('fName'), barcode: $('fBarcode'), category: $('fCategory'),
    price: $('fPrice'), price100: $('fPrice100'),
    stock: $('fStock'), minStock: $('fMinStock'), unit: $('fUnit'),
  };
  fillSelect(form.category, state.categories);
  if (product) {
    title.textContent = `Editar: ${product.name}`;
    form.name.value = product.name;
    form.barcode.value = product.barcode;
    form.category.value = product.category_id || '';
    form.price.value = product.selling_price;
    form.price100.value = product.price_per_100g != null && product.price_per_100g !== '' ? product.price_per_100g : '';
    form.stock.value = product.stock;
    form.minStock.value = product.min_stock;
    form.unit.value = product.unit;
    $('productModal').dataset.editingId = product.id;
  } else {
    title.textContent = 'Nuevo producto';
    form.name.value = ''; form.barcode.value = ''; form.category.value = '';
    form.price.value = ''; form.price100.value = '';
    form.stock.value = ''; form.minStock.value = '';
    form.unit.value = 'pza';
    $('productModal').dataset.editingId = '';
  }
  updatePrice100Visibility();
  $('productModal').classList.add('show');
  renderBarcodePreview();
  setTimeout(() => form.name.focus(), 50);
}

function updatePrice100Visibility() {
  $('price100Wrap').classList.toggle('hidden', $('fUnit').value.trim() !== 'kg');
}

$('fUnit').addEventListener('input', updatePrice100Visibility);

async function saveProduct() {
  const modal = $('productModal');
  const id = modal.dataset.editingId;
  const body = {
    name: $('fName').value.trim(),
    barcode: $('fBarcode').value.trim(),
    category_id: $('fCategory').value || null,
    selling_price: parseFloat($('fPrice').value) || 0,
    price_per_100g: $('fPrice100').value !== '' ? parseFloat($('fPrice100').value) : null,
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
      <div class="bl-brand">POS DULCERÍA</div>
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

async function exportBarcodes() {
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

  const canvas = document.createElement('canvas');
  let firstCat = true;

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
    const gap = 3;
    const ideal = (contentArea - gap * (list.length - 1)) / list.length;
    const boxH = ideal < 26 ? 26 : Math.min(80, ideal);

    y = contentTop;
    for (const p of list) {
      const code = String(p.barcode).trim();

      doc.setDrawColor(170);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, y, usable, boxH, 2, 2);

      const nameFont = boxH < 32 ? 10 : 12;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(nameFont);
      const nameLines = doc.splitTextToSize(pdfSanitize(p.name), usable - 16);
      const nameH = nameLines.length * (nameFont === 12 ? 5 : 4);
      doc.text(nameLines, pageW / 2, y + Math.min(8, boxH * 0.25), { align: 'center' });

      const barcodeH = Math.max(6, Math.min(22, boxH - nameH - 15));
      const barcodeTop = y + nameH + 8;
      try {
        JsBarcode(canvas, code, { format: 'CODE128', width: 2, height: 90, displayValue: false, margin: 0 });
        const img = canvas.toDataURL('image/png');
        const maxW = usable - 16;
        const aspect = canvas.width / canvas.height;
        let w = maxW;
        let h = w / aspect;
        if (h > barcodeH) { h = barcodeH; w = h * aspect; }
        doc.addImage(img, 'PNG', pageW / 2 - w / 2, barcodeTop, w, h);
      } catch (e) { /* sin barras */ }

      const codeFont = boxH < 35 ? 9 : boxH < 50 ? 11 : 13;
      doc.setFont('courier', 'bold');
      doc.setFontSize(codeFont);
      doc.text(pdfSanitize(code), pageW / 2, y + boxH - 3, { align: 'center' });

      y += boxH + gap;
    }
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
