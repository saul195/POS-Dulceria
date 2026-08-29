const cart = new Map(); // product_id -> { product, quantity }
let lastSale = null;
let lastPayment = null;

const hasRecipe = (p) => !!(p && ((p.recipe_bote_id && p.recipe_grams > 0) || (p.recipe_bote_id2 && p.recipe_grams2 > 0)));
const recipeTotalGrams = (p) => {
  if (!p) return 0;
  return (p.recipe_grams > 0 ? p.recipe_grams : 0) + (p.recipe_grams2 > 0 ? p.recipe_grams2 : 0);
};
const recipeBoteCount = (p) => {
  if (!p) return 0;
  return ((p.recipe_bote_id && p.recipe_grams > 0) ? 1 : 0) + ((p.recipe_bote_id2 && p.recipe_grams2 > 0) ? 1 : 0);
};

let allProducts = [];
let categories = [];
let activeCategory = localStorage.getItem('pos_cat') || '';
let searchTerm = '';

const $ = (id) => document.getElementById(id);

/* ---------------- Catálogo ---------------- */

async function loadCatalog() {
  try {
    categories = await api.categories.list();
    renderCatPills();
  } catch (e) {
    toast(e.message, 'error');
  }
  try {
    allProducts = await fetchAllProducts();
  } catch (e) {
    setAlert(e.message);
  }
  renderGrid();
}

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
  return all.filter((p) => p.is_active !== 0 && !p.is_bote);
}

function renderCatPills() {
  const wrap = $('catPills');
  wrap.innerHTML = '';
  const mk = (label, value, active) => {
    const b = document.createElement('button');
    b.className = `cat-pill${active ? ' active' : ''}`;
    b.textContent = label;
    b.addEventListener('click', () => {
      activeCategory = value;
      localStorage.setItem('pos_cat', value);
      renderCatPills();
      renderGrid();
      $('barcodeInput').focus();
    });
    wrap.appendChild(b);
  };
  mk('Todos', '', !activeCategory);
  for (const c of categories) mk(c.name, String(c.id), activeCategory === String(c.id));
}

function filteredProducts() {
  const q = searchTerm.trim().toLowerCase();
  return allProducts.filter((p) => {
    if (activeCategory && String(p.category_id) !== activeCategory) return false;
    if (q) {
      const hay = `${p.name} ${p.barcode}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderGrid() {
  const grid = $('productGrid');
  grid.innerHTML = '';
  const list = filteredProducts();
  if (!list.length) {
    grid.innerHTML = `<div class="grid-empty">Sin productos. Revisa el Inventario o cambia la búsqueda.</div>`;
    return;
  }
  for (const p of list) {
    const hasRecipe = p.recipe_bote_id && p.recipe_grams > 0 || p.recipe_bote_id2 && p.recipe_grams2 > 0;
    const out = !hasRecipe && p.stock <= 0;
    const card = document.createElement('div');
    const isKg = p.unit === 'kg';
    card.className = `prod-card${cart.has(p.id) ? ' in-cart' : ''}${out ? ' out-of-stock' : ''}`;
    card.dataset.id = p.id;
    const lowStock = !out && !hasRecipe && p.stock > 0 && p.stock <= (p.min_stock || 10);
    const stockDot = out ? 'dot-out' : lowStock ? 'dot-low' : 'dot-ok';
    card.innerHTML = `
      <div class="card-header">
        <div class="prod-name">${p.name}</div>
        ${cart.has(p.id) ? `<span class="cart-count">${entryDisplay(cart.get(p.id))}${entryUnit(cart.get(p.id))}</span>` : ''}
      </div>
      <div class="prod-price">${money(p.selling_price)}<span class="prod-unit">${isKg ? '/kg' : '/pza'}</span></div>
      <div class="prod-meta">
        <span class="stock-indicator ${stockDot}" title="${out ? 'Agotado' : `Stock: ${p.stock} ${p.unit}`}"></span>
        ${hasRecipe ? `<span class="badge badge-recipe" title="Descuenta ${recipeTotalGrams(p)} g de ${recipeBoteCount(p)} bote(s)">${recipeTotalGrams(p)}g de ${recipeBoteCount(p)} bote(s)</span>` : ''}
      </div>
      <div class="card-actions">
        ${!out && (!isKg || p.price_per_100g > 0) ? `<button class="act-btn act-plus" data-action="plus" title="Agregar al carrito">+</button>` : ''}
      </div>`;
    card.title = hasRecipe
      ? `${p.name} · descuenta ${recipeTotalGrams(p)} g de ${recipeBoteCount(p)} bote(s) de helado`
      : (out ? `${p.name} (agotado)` : `${p.name} · stock: ${p.stock} ${p.unit}`);
    grid.appendChild(card);
  }
}

/* ---------------- Carrito ---------------- */

function renderCart() {
  const list = $('cartList');
  list.innerHTML = '';
  if (cart.size === 0) {
    list.innerHTML = `<div class="cart-empty"><div class="big">🛒</div>
      Escanea un código, busca o toca un producto del catálogo.</div>`;
  }
  for (const { product, quantity, displayUnit, unitPrice, fixedPrice } of cart.values()) {
    const entry = { product, quantity, displayUnit, unitPrice, fixedPrice };
    const subtotal = entrySubtotal(entry);
    const isKg = product.unit === 'kg' && displayUnit === 'gr';
    const item = document.createElement('div');
    item.className = `cart-item${isKg ? ' kg-item' : ''}`;
    if (isKg) {
      const grams = Math.round(quantity * 1000);
      const pesos = Math.round((quantity * product.selling_price) * 100) / 100;
      item.innerHTML = `
        <div class="ci-top">
          <div class="ci-name">${product.name}</div>
          <button class="ci-rm rm-btn" data-id="${product.id}" title="Quitar">✕</button>
        </div>
        <div class="ci-meta">${money(product.selling_price)}/kg · Stock: ${product.stock} kg</div>
        <div class="ci-controls">
          <div class="ci-row">
            <span class="ci-prefix">$</span>
            <input type="number" class="ci-pesos" data-id="${product.id}" value="${pesos}" min="0" step="1" inputmode="decimal">
            <span class="ci-arrow">→</span>
            <button class="qty-btn qty-minus" data-id="${product.id}" title="Disminuir">−</button>
            <input type="number" class="cart-qty" value="${grams}" min="0" step="10" data-id="${product.id}" title="Gramos">
            <span class="ci-unit">g</span>
            <button class="qty-btn qty-plus" data-id="${product.id}" title="Aumentar">+</button>
          </div>
        </div>
        <div class="ci-sub">${money(subtotal)}</div>`;
    } else {
      const d = entryDisplay(entry);
      const u = entryUnit(entry);
      const step = cartStep(entry);
      item.innerHTML = `
        <div class="ci-top">
          <div class="ci-name">${product.name}</div>
          <button class="ci-rm rm-btn" data-id="${product.id}" title="Quitar">✕</button>
        </div>
        <div class="ci-meta">${product.barcode} · ${money(product.selling_price)}/${product.unit}</div>
        <div class="ci-controls">
          <div class="ci-row">
            <button class="qty-btn qty-minus" data-id="${product.id}" title="Disminuir">−</button>
            <input type="number" class="cart-qty" value="${d}" min="0.001" step="${step}" data-id="${product.id}" title="Cantidad">
            <span class="ci-unit">${u}</span>
            <button class="qty-btn qty-plus" data-id="${product.id}" title="Aumentar">+</button>
          </div>
        </div>
        <div class="ci-sub">${money(subtotal)}</div>`;
    }
    list.appendChild(item);
  }
  renderGrid();
  $('totalLabel').textContent = money(cartTotal());
  updateChange();
}

function cartTotal() {
  let total = 0;
  for (const entry of cart.values()) total += entrySubtotal(entry);
  return Math.round(total * 100) / 100;
}

function entrySubtotal(entry) {
  const raw = entry.fixedPrice != null ? entry.fixedPrice : entry.unitPrice * entry.quantity;
  return Math.round(raw);
}

function updateChange() {
  const total = cartTotal();
  const paid = parseFloat($('amountPaid').value) || 0;
  const box = $('changeBox');
  if (total === 0) {
    box.textContent = 'CAMBIO: $0.00';
    box.className = 'change-box';
    return;
  }
  if (paid < total) {
    box.textContent = `FALTANTE: ${money(total - paid)}`;
    box.className = 'change-box insufficient';
  } else {
    box.textContent = `CAMBIO: ${money(paid - total)}`;
    box.className = 'change-box';
  }
}

function setAlert(message, type = 'error') {
  const el = $('posAlert');
  if (!message) { el.classList.add('hidden'); el.textContent = ''; return; }
  el.textContent = message;
  el.className = `alert ${type === 'error' ? 'alert-error' : 'alert-info'}`;
  setTimeout(() => el.classList.add('hidden'), 3500);
}

async function addToCart(product, qty, displayUnit, fixedPrice) {
  if (!product) return;
  const existing = cart.get(product.id);
  const newQty = Math.round(((existing ? existing.quantity : 0) + qty) * 1000) / 1000;
  if (newQty > product.stock && product.unit !== 'kg' && !hasRecipe(product)) {
    setAlert(`Stock insuficiente de "${product.name}". Disponible: ${product.stock} ${product.unit}`);
    return;
  }
  const entry = {
    product,
    quantity: newQty,
    displayUnit,
    unitPrice: entryPrice({ product, quantity: newQty, displayUnit }),
    fixedPrice: existing && existing.fixedPrice != null ? undefined : fixedPrice,
  };
  cart.set(product.id, entry);
  renderCart();
  setAlert(`${product.name} agregado al carrito.`, 'info');
}

function entryDisplay(entry) {
  const { product, quantity, displayUnit } = entry;
  if (product.unit === 'kg' && displayUnit === 'gr') return Math.round(quantity * 1000);
  return Math.round(quantity * 1000) / 1000;
}

function entryUnit(entry) {
  const { product, displayUnit } = entry;
  if (product.unit === 'kg' && displayUnit === 'gr') return 'g';
  return product.unit;
}

function entryPrice(entry) {
  const { product } = entry;
  return product.selling_price;
}

function setEntryQty(entry, displayValue) {
  const { product, displayUnit } = entry;
  if (product.unit === 'kg' && displayUnit === 'gr') entry.quantity = displayValue / 1000;
  else entry.quantity = displayValue;
}

function cartStep(entry) {
  if (entry.product.unit !== 'kg') return 1;
  if (entry.displayUnit === 'gr') return 10;
  return 0.01;
}

async function addByInput(value) {
  value = String(value || '').trim();
  if (!value) return;
  const q = value.toLowerCase();
  const byCode = allProducts.find((p) => p.barcode && p.barcode.trim().toLowerCase() === q);
  if (byCode) {
    if (byCode.stock > 0 || hasRecipe(byCode)) {
      if (byCode.unit === 'kg') addToCart(byCode, 0.1, 'gr');
      else addToCart(byCode, 1);
    }
    $('barcodeInput').value = '';
    return;
  }
  const exact = allProducts.filter((p) => p.name.toLowerCase() === q);
  let target = exact.length === 1 ? exact[0] : null;
  if (!target) {
    const partial = allProducts.filter((p) => p.name.toLowerCase().includes(q));
    if (partial.length === 1) target = partial[0];
    else if (partial.length > 1) {
      searchTerm = value;
      renderGrid();
      $('barcodeInput').value = '';
      setAlert(`Varios productos coinciden con "${value}". Elige uno del catálogo.`);
      $('barcodeInput').focus();
      return;
    }
  }
  if (!target) {
    setAlert(`Producto no encontrado para "${value}".`);
    $('barcodeInput').value = '';
    $('barcodeInput').focus();
    return;
  }
  if (target.stock > 0 || hasRecipe(target)) {
    if (target.unit === 'kg') addToCart(target, 0.1, 'gr');
    else addToCart(target, 1);
  }
  $('barcodeInput').value = '';
}

/* ---------------- Cobro ---------------- */

async function charge() {
  const total = cartTotal();
  if (cart.size === 0) { setAlert('El carrito está vacío.'); return; }
  const payment = $('payMethod').value;
  const paid = parseFloat($('amountPaid').value) || 0;
  if (payment === 'efectivo' && paid < total) {
    setAlert(`Faltan ${money(total - paid)} para completar el pago.`);
    return;
  }
  const chargeBtn = $('chargeBtn');
  chargeBtn.disabled = true;
  chargeBtn.textContent = 'Procesando…';
  try {
    const items = [...cart.values()].map(({ product, quantity, displayUnit, unitPrice, fixedPrice }) => {
      const entry = { product, quantity, displayUnit, unitPrice, fixedPrice };
      return {
        product_id: product.id,
        quantity,
        unit_price: unitPrice,
        line_price: entrySubtotal(entry),
        sale_mode: 'kg',
        sale_price: unitPrice,
      };
    });
    const change = payment === 'efectivo' ? Math.round((paid - total) * 100) / 100 : 0;
    const sale = await api.sales.create({
      items,
      payment_method: payment,
      cash_received: paid,
      change,
    });
    lastSale = sale;
    lastPayment = { amountPaid: paid, change };
    cart.clear();
    renderCart();
    $('amountPaid').value = '';
    if ($('printTicket').checked) {
      setAlert(`Venta #${sale.ticket_no || sale.id} registrada. Imprimiendo ticket…`, 'success');
      await printTicket(sale, { amountPaid: paid, change: lastPayment.change });
    } else {
      setAlert(`Venta #${sale.ticket_no || sale.id} registrada. Ticket omitido.`, 'success');
    }
    setTimeout(() => $('barcodeInput').focus(), 300);
  } catch (e) {
    setAlert(e.message);
  } finally {
    chargeBtn.disabled = false;
    chargeBtn.textContent = 'Cobrar (F9)';
  }
}

function cancelSale() {
  if (cart.size === 0) return;
  confirmDialog('¿Cancelar la venta actual y vaciar el carrito?', () => {
    cart.clear();
    renderCart();
    $('amountPaid').value = '';
    setAlert('Venta cancelada.', 'info');
    $('barcodeInput').focus();
  });
}

/* ---------------- Eventos ---------------- */

$('barcodeInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addByInput($('barcodeInput').value); }
});
$('addBarcodeBtn').addEventListener('click', () => addByInput($('barcodeInput').value));

$('barcodeInput').addEventListener('input', () => {
  searchTerm = $('barcodeInput').value;
  renderGrid();
});

$('productGrid').addEventListener('click', (e) => {
  const actBtn = e.target.closest('.act-btn');
  if (actBtn) {
    e.stopPropagation();
    const card = actBtn.closest('.prod-card');
    if (!card || card.classList.contains('out-of-stock')) return;
    const p = allProducts.find((x) => x.id === Number(card.dataset.id));
    if (!p) return;
    if (p.stock > 0 || hasRecipe(p)) {
      if (p.unit === 'kg') addToCart(p, 0.1, 'gr');
      else addToCart(p, 1);
    }
    return;
  }
  const card = e.target.closest('.prod-card');
  if (!card || card.classList.contains('out-of-stock')) return;
  const p = allProducts.find((x) => x.id === Number(card.dataset.id));
  if (!p) return;
  if (p.stock > 0 || hasRecipe(p)) {
    if (p.unit === 'kg') addToCart(p, 0.1, 'gr');
    else addToCart(p, 1);
  }
});

$('cartList').addEventListener('click', (e) => {
  const btn = e.target.closest('.rm-btn, .qty-minus, .qty-plus');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const entry = cart.get(id);
  if (!entry) return;
  if (btn.classList.contains('rm-btn')) {
    cart.delete(id);
  } else if (btn.classList.contains('qty-minus')) {
    const dec = cartStep(entry);
    const nv = Math.round((entryDisplay(entry) - dec) * 1000) / 1000;
    if (nv > 0) { entry.fixedPrice = undefined; setEntryQty(entry, nv); }
    else cart.delete(id);
  } else {
    const inc = cartStep(entry);
    const nv = Math.round((entryDisplay(entry) + inc) * 1000) / 1000;
    if (nv > entry.product.stock && entry.product.unit !== 'kg' && !hasRecipe(entry.product)) {
      setAlert(`Stock insuficiente de "${entry.product.name}". Máximo: ${entry.product.stock}`);
      return;
    }
    entry.fixedPrice = undefined;
    setEntryQty(entry, nv);
  }
  renderCart();
});

$('cartList').addEventListener('change', (e) => {
  const input = e.target.closest('.cart-qty');
  if (!input) return;
  const id = Number(input.dataset.id);
  const entry = cart.get(id);
  if (!entry) return;
  const qty = parseFloat(input.value);
  if (!(qty > 0)) { cart.delete(id); renderCart(); return; }
  const base = entry.product.unit === 'kg' && entry.displayUnit === 'gr' ? qty / 1000
    : qty;
  if (base > entry.product.stock && entry.product.unit !== 'kg' && !hasRecipe(entry.product)) {
    setAlert(`Stock insuficiente de "${entry.product.name}". Máximo: ${entry.product.stock}`);
    entry.quantity = entry.product.stock;
    renderCart();
    return;
  }
  entry.quantity = Math.round(base * 1000) / 1000;
  entry.fixedPrice = undefined;
  renderCart();
});

$('cartList').addEventListener('input', (e) => {
  const pesosInput = e.target.closest('.ci-pesos');
  if (!pesosInput) return;
  const id = Number(pesosInput.dataset.id);
  const entry = cart.get(id);
  if (!entry || entry.product.unit !== 'kg') return;
  const amt = parseFloat(pesosInput.value) || 0;
  if (amt <= 0) return;
  const newQty = amt / (entry.product.selling_price || 1);
  entry.quantity = Math.round(newQty * 1000) / 1000;
  entry.fixedPrice = undefined;
  const gramsEl = pesosInput.closest('.ci-controls').querySelector('.cart-qty');
  if (gramsEl) gramsEl.value = Math.round(entry.quantity * 1000);
  const subEl = pesosInput.closest('.cart-item').querySelector('.ci-sub');
  if (subEl) subEl.textContent = money(entrySubtotal(entry));
  const totalEl = $('totalLabel');
  if (totalEl) totalEl.textContent = money(cartTotal());
  updateChange();
});

$('amountPaid').addEventListener('input', updateChange);
$('payMethod').addEventListener('change', () => {
  const isCash = $('payMethod').value === 'efectivo';
  $('cashRow').classList.toggle('hidden', !isCash);
  $('amountPaid').disabled = !isCash;
  if (!isCash) { $('amountPaid').value = cartTotal().toFixed(2); }
  updateChange();
});

document.querySelectorAll('.quick-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const total = cartTotal();
    const input = $('amountPaid');
    const cur = parseFloat(input.value) || 0;
    if (btn.dataset.amt === '0') {
      input.value = total.toFixed(2);
    } else {
      const bill = Number(btn.dataset.amt);
      input.value = (cur + bill).toFixed(2);
    }
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 220);
    updateChange();
    $('chargeBtn').focus();
  });
});

$('chargeBtn').addEventListener('click', charge);
$('cancelBtn').addEventListener('click', cancelSale);

$('previewBtn').addEventListener('click', () => {
  if (!lastSale) { setAlert('Aún no hay un ticket para previsualizar.', 'info'); return; }
  previewTicket(lastSale, lastPayment);
});

/* Atajos de teclado */
document.addEventListener('keydown', (e) => {
  if (e.key === 'F1') {
    e.preventDefault();
    $('helpModal').classList.add('show');
  }
  if (e.key === 'F2') {
    e.preventDefault();
    $('barcodeInput').focus();
    $('barcodeInput').select();
  }
  if (e.key === 'F4') {
    e.preventDefault();
    $('amountPaid').focus();
    $('amountPaid').select();
  }
  if (e.key === 'F9') {
    e.preventDefault();
    charge();
  }
  if (e.key === 'Escape') {
    const helpOpen = $('helpModal').classList.contains('show');
    if (helpOpen) { $('helpModal').classList.remove('show'); return; }
    const modal = document.querySelector('.modal-backdrop.show');
    if (!modal) cancelSale();
  }
});

$('helpClose').addEventListener('click', () => $('helpModal').classList.remove('show'));

$('amountPaid').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); charge(); }
});

window.addEventListener('load', () => {
  loadCatalog();
  initPrinterUI();
  $('barcodeInput').focus();
});
