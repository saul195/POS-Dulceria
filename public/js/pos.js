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
    const card = document.createElement('button');
    const isKg = p.unit === 'kg';
    card.className = `prod-card${cart.has(p.id) ? ' in-cart' : ''}`;
    card.disabled = out;
    card.dataset.id = p.id;
    card.innerHTML = `
      ${!out && (!isKg || p.price_per_100g > 0) ? '<span class="card-plus" title="Agregar 1 al instante">+</span>' : ''}
      ${!out ? '<span class="card-money" title="Cobrar una cantidad en pesos (ej. 10 pesos)">$</span>' : ''}
      <div class="prod-name">${p.name}</div>
      <div class="prod-price">${money(p.selling_price)}</div>
      <div class="prod-meta">${isKg ? 'por peso' : 'por pieza'}${out ? ' · agotado' : ''}
        ${hasRecipe ? `<span class="badge badge-recipe" title="Descuenta ${recipeTotalGrams(p)} g de ${recipeBoteCount(p)} bote(s)">${recipeTotalGrams(p)} g de ${recipeBoteCount(p)} bote(s)</span>` : ''}
        ${cart.has(p.id) ? `<span class="badge badge-warn">${entryDisplay(cart.get(p.id))}${entryUnit(cart.get(p.id))} en carrito</span>` : ''}
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
    const d = entryDisplay(entry);
    const u = entryUnit(entry);
    const item = document.createElement('div');
    item.className = 'cart-item';
    const step = cartStep(entry);
    item.innerHTML = `
      <div class="ci-info">
        <div class="ci-name">${product.name}</div>
        <div class="ci-meta">${product.barcode} · ${money(product.selling_price)}/${product.unit}
        ${fixedPrice != null ? '<span class="badge badge-round" title="Precio redondeado, gramaje sin cambios">redondeado</span>' : ''}</div>
      </div>
      <button class="ci-rm rm-btn" data-id="${product.id}" title="Quitar del carrito">✕</button>
      <div class="ci-qty">
        <button class="qty-btn qty-minus" data-id="${product.id}" title="Disminuir">−</button>
        <input type="number" class="cart-qty" value="${d}" min="0.001" step="${step}"
               data-id="${product.id}" title="Modificar cantidad">
        <span class="ci-unit">${u}</span>
        <button class="qty-btn qty-plus" data-id="${product.id}" title="Aumentar">+</button>
      </div>
      <div class="ci-sub">${money(subtotal)}</div>`;
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
  return entry.fixedPrice != null ? entry.fixedPrice : entry.unitPrice * entry.quantity;
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

/* ---------------- Selector de cantidad (modal) ---------------- */

let qtyState = { product: null, unit: 'kg' };

function entryDisplay(entry) {
  const { product, quantity, displayUnit } = entry;
  if (product.unit === 'kg' && displayUnit === 'gr') return Math.round(quantity * 1000);
  if (product.unit === 'kg' && displayUnit === '100g') return Math.round(quantity * 10);
  return Math.round(quantity * 1000) / 1000;
}

function entryUnit(entry) {
  const { product, displayUnit } = entry;
  if (product.unit === 'kg' && displayUnit === 'gr') return 'g';
  if (product.unit === 'kg' && displayUnit === '100g') return '×100g';
  return product.unit;
}

function entryPrice(entry) {
  const { product, displayUnit } = entry;
  if (product.unit === 'kg' && displayUnit === '100g') return product.price_per_100g * 10;
  return product.selling_price;
}

function setEntryQty(entry, displayValue) {
  const { product, displayUnit } = entry;
  if (product.unit === 'kg' && displayUnit === 'gr') entry.quantity = displayValue / 1000;
  else if (product.unit === 'kg' && displayUnit === '100g') entry.quantity = displayValue / 10;
  else entry.quantity = displayValue;
}

function cartStep(entry) {
  if (entry.product.unit !== 'kg') return 1;
  if (entry.displayUnit === '100g') return 1;
  if (entry.displayUnit === 'gr') return 10;
  return 0.01;
}

const toBaseQty = (unit) => unit === 'gr' ? 1 / 1000 : unit === '100g' ? 1 / 10 : 1;
const fromBaseQty = (unit) => unit === 'gr' ? 1000 : unit === '100g' ? 10 : 1;

function qtyBaseValue() {
  const q = parseFloat($('qmQty').value);
  return q * toBaseQty(qtyState.unit);
}

function updateQtyPreview() {
  const p = qtyState.product;
  if (!p) return;
  const q = parseFloat($('qmQty').value);
  const base = q * toBaseQty(qtyState.unit);
  const valid = q > 0;
  const unitLabel = qtyState.unit === '100g' ? '×100g' : (qtyState.unit === 'gr' ? 'g' : 'kg');
  $('qmOk').disabled = !valid;
  $('qmQtyUnit').textContent = unitLabel;
  if (p.unit === 'kg' && valid && base > p.stock) {
    $('qmInfo').textContent = `⚠️ Estás superando el stock disponible (${p.stock} kg)`;
  } else if (hasRecipe(p)) {
    $('qmInfo').textContent = `Descuenta ${recipeTotalGrams(p)} g (${recipeBoteCount(p)} bote${recipeBoteCount(p) > 1 ? 's' : ''}) de helado por pieza`;
  } else {
    $('qmInfo').textContent = `Stock disponible: ${p.stock} ${p.unit === 'kg' ? 'kg' : p.unit}`;
  }
}

function setQtyModalUnit(unit) {
  const p = qtyState.product;
  if (!p) return;
  if (unit === '100g') {
    $('qmQty').value = 1;
    $('qmQty').step = '1';
    $('qmQty').min = '1';
    qtyState.unit = '100g';
    $('qmUnitToggle').querySelectorAll('.unit-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.unit === unit);
    });
    $('qmQtyLabel').textContent = 'Paquetes de 100 g';
    confirmQtyModal();
    return;
  }
  const prev = qtyState.unit;
  qtyState.unit = unit;
  $('qmUnitToggle').querySelectorAll('.unit-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.unit === unit);
  });
  let val = parseFloat($('qmQty').value) || 0;
  val = Math.round(val * toBaseQty(prev) * fromBaseQty(unit) * 1000) / 1000;
  if (!val) val = unit === 'kg' ? 1 : (unit === 'gr' ? 100 : 1);
  $('qmQty').value = val;
  $('qmQty').step = unit === 'kg' ? '0.01' : '1';
  $('qmQty').min = unit === 'kg' ? '0' : '1';
  $('qmQtyLabel').textContent = unit === 'kg' ? 'Cantidad en kilogramos' : unit === 'gr' ? 'Cantidad en gramos' : 'Paquetes de 100 g';
  updateQtyPreview();
}

function openQtyModal(product) {
  if (!product) return;
  qtyState.product = product;
  qtyState.unit = 'kg';
  $('qmTitle').textContent = product.name;
  $('qmName').textContent = product.name;
  const has100 = product.unit === 'kg' && product.price_per_100g != null && product.price_per_100g > 0;
  $('qmMeta').textContent = hasRecipe(product)
    ? `${product.barcode || 's/c'} · ${money(product.selling_price)} por pieza · Receta: ${recipeTotalGrams(product)} g de ${recipeBoteCount(product)} bote(s)`
    : `${product.barcode || 's/c'} · ${money(product.selling_price)} por kg · Stock: ${product.stock} kg`;
  $('qmUnitToggle').classList.toggle('hidden', product.unit !== 'kg');
  const btn100 = $('qmUnit100');
  if (btn100) {
    btn100.classList.toggle('hidden', !has100);
    btn100.textContent = `Por 100 g · ${money(product.price_per_100g || 0)}`;
  }
  if (product.unit === 'kg') {
    setQtyModalUnit('gr');
  } else {
    qtyState.unit = product.unit;
    $('qmQty').value = 1;
    $('qmQty').step = '1';
    $('qmQty').min = '1';
    $('qmQtyLabel').textContent = 'Cantidad';
    $('qmQtyUnit').textContent = product.unit;
    updateQtyPreview();
  }
  $('qtyModal').classList.add('show');
  setTimeout(() => { $('qmQty').focus(); $('qmQty').select(); }, 60);
}

function closeQtyModal() {
  $('qtyModal').classList.remove('show');
  qtyState.product = null;
}

function confirmQtyModal() {
  const p = qtyState.product;
  if (!p) return;
  const base = qtyBaseValue();
  if (!(base > 0)) return;
  const displayUnit = p.unit === 'kg' ? qtyState.unit : undefined;
  addToCart(p, base, displayUnit);
  closeQtyModal();
  setTimeout(() => $('barcodeInput').focus(), 50);
}

async function addByInput(value) {
  value = String(value || '').trim();
  if (!value) return;
  const q = value.toLowerCase();
  const byCode = allProducts.find((p) => p.barcode && p.barcode.trim().toLowerCase() === q);
  if (byCode) return openQtyModal(byCode);

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
  openQtyModal(target);
  $('barcodeInput').value = '';
}

/* ---------------- Cobro en pesos (modal) ---------------- */

let moneyState = { product: null };

function moneyQtyFor(product, amount) {
  if (product.unit === 'kg') {
    return { quantity: amount / (product.selling_price || 1), displayUnit: 'gr' };
  }
  return { quantity: Math.max(1, Math.round(amount / (product.selling_price || 1))), displayUnit: undefined };
}

function updateMoneyPreview() {
  const p = moneyState.product;
  if (!p) return;
  const amt = parseFloat($('cmAmount').value);
  const valid = amt > 0;
  $('cmOk').disabled = !valid;
  const rounded = $('cmRound').checked;
  const roundLabel = $('cmRoundLabel');
  if (!valid) { $('cmInfo').textContent = 'Escribe una cantidad mayor a 0.'; roundLabel.textContent = 'Redondear el precio al monto solicitado (sin cambiar el gramaje)'; return; }
  if (p.unit === 'kg') {
    const grams = Math.round((amt / (p.selling_price || 1)) * 1000);
    const exact = money((grams / 1000) * p.selling_price);
    if (rounded) {
      $('cmInfo').textContent = `${grams} g → se cobrará ${money(amt)} exacto (gramaje sin cambios)`;
      roundLabel.textContent = `Redondear a ${money(amt)} (en vez de ${exact})`;
    } else {
      $('cmInfo').textContent = `${money(p.selling_price)}/kg → ${grams} g ≈ ${exact}`;
      roundLabel.textContent = `Redondear a ${money(amt)} (en vez de ${exact})`;
    }
  } else {
    const pieces = Math.max(1, Math.round(amt / (p.selling_price || 1)));
    const exact = money(pieces * p.selling_price);
    if (rounded) {
      $('cmInfo').textContent = `${pieces} pza(s) → se cobrará ${money(amt)} exacto`;
      roundLabel.textContent = `Redondear a ${money(amt)} (en vez de ${exact})`;
    } else {
      $('cmInfo').textContent = `${money(p.selling_price)}/pieza → ${pieces} pza(s) ≈ ${exact}`;
      roundLabel.textContent = `Redondear a ${money(amt)} (en vez de ${exact})`;
    }
  }
}

function openMoneyModal(product) {
  if (!product) return;
  moneyState.product = product;
  $('cmTitle').textContent = 'Cobrar en pesos';
  $('cmName').textContent = product.name;
  $('cmMeta').textContent = product.unit === 'kg'
    ? `${product.barcode || 's/c'} · ${money(product.selling_price)} por kg`
    : `${product.barcode || 's/c'} · ${money(product.selling_price)} por pieza`;
  $('cmAmount').value = '10';
  $('cmRound').checked = false;
  $('cmOk').disabled = false;
  updateMoneyPreview();
  $('moneyModal').classList.add('show');
  setTimeout(() => { $('cmAmount').focus(); $('cmAmount').select(); }, 60);
}

function closeMoneyModal() {
  $('moneyModal').classList.remove('show');
  moneyState.product = null;
}

function confirmMoneyModal() {
  const p = moneyState.product;
  if (!p) return;
  const amt = parseFloat($('cmAmount').value);
  if (!(amt > 0)) return;
  const { quantity, displayUnit } = moneyQtyFor(p, amt);
  const fixedPrice = $('cmRound').checked ? Math.round(amt * 100) / 100 : undefined;
  addToCart(p, quantity, displayUnit, fixedPrice);
  closeMoneyModal();
  setTimeout(() => $('barcodeInput').focus(), 50);
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
    const items = [...cart.values()].map(({ product, quantity, displayUnit, unitPrice, fixedPrice }) => ({
      product_id: product.id,
      quantity,
      unit_price: unitPrice,
      line_price: fixedPrice != null ? Math.round(fixedPrice * 100) / 100 : undefined,
      sale_mode: product.unit === 'kg' && displayUnit === '100g' ? '100g' : 'kg',
      sale_price: product.unit === 'kg' && displayUnit === '100g' ? product.price_per_100g : unitPrice,
    }));
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
    setAlert(`Venta #${sale.ticket_no || sale.id} registrada. Imprimiendo ticket…`, 'success');
    await printTicket(sale, { amountPaid: paid, change: lastPayment.change });
    setTimeout(() => $('barcodeInput').focus(), 300);
  } catch (e) {
    setAlert(e.message);
  } finally {
    chargeBtn.disabled = false;
    chargeBtn.textContent = 'Cobrar e imprimir (F9)';
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
  const money = e.target.closest('.card-money');
  if (money) {
    const card = money.closest('.prod-card');
    if (!card || card.disabled) return;
    const p = allProducts.find((x) => x.id === Number(card.dataset.id));
    if (p) openMoneyModal(p);
    return;
  }
  const plus = e.target.closest('.card-plus');
  if (plus) {
    const card = plus.closest('.prod-card');
    if (!card || card.disabled) return;
    const p = allProducts.find((x) => x.id === Number(card.dataset.id));
    if (p && (p.stock > 0 || hasRecipe(p))) {
      if (p.unit === 'kg') addToCart(p, 0.1, '100g');
      else addToCart(p, 1);
    }
    return;
  }
  const card = e.target.closest('.prod-card');
  if (!card || card.disabled) return;
  const p = allProducts.find((x) => x.id === Number(card.dataset.id));
  if (p) openQtyModal(p);
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
    : entry.product.unit === 'kg' && entry.displayUnit === '100g' ? qty / 10
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

/* Selector de cantidad (modal) */
$('qmOk').addEventListener('click', confirmQtyModal);
$('qmCancel').addEventListener('click', closeQtyModal);
$('qmQty').addEventListener('input', updateQtyPreview);
$('qmQty').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); confirmQtyModal(); }
});

/* Cobro en pesos (modal) */
$('cmOk').addEventListener('click', confirmMoneyModal);
$('cmCancel').addEventListener('click', closeMoneyModal);
$('cmAmount').addEventListener('input', updateMoneyPreview);
$('cmRound').addEventListener('change', updateMoneyPreview);
$('cmAmount').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); confirmMoneyModal(); }
});
$('qmMinus').addEventListener('click', () => {
  const step = qtyState.unit === 'gr' ? 10 : qtyState.unit === '100g' ? 1 : 0.01;
  const cur = parseFloat($('qmQty').value) || 0;
  $('qmQty').value = Math.max(0, Math.round((cur - step) * 1000) / 1000);
  updateQtyPreview();
});
$('qmPlus').addEventListener('click', () => {
  const step = qtyState.unit === 'gr' ? 10 : qtyState.unit === '100g' ? 1 : 0.01;
  const cur = parseFloat($('qmQty').value) || 0;
  $('qmQty').value = Math.round((cur + step) * 1000) / 1000;
  updateQtyPreview();
});
$('qmUnitToggle').addEventListener('click', (e) => {
  const b = e.target.closest('.unit-btn');
  if (b) setQtyModalUnit(b.dataset.unit);
});

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
    const qtyOpen = $('qtyModal').classList.contains('show');
    if (qtyOpen) { closeQtyModal(); return; }
    const moneyOpen = $('moneyModal').classList.contains('show');
    if (moneyOpen) { closeMoneyModal(); return; }
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
