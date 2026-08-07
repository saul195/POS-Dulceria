const cart = new Map(); // product_id -> { product, quantity }
let lastSale = null;
let lastPayment = null;

let allProducts = [];
let categories = [];
let activeCategory = '';
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
  return all.filter((p) => p.is_active !== 0);
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
    const out = p.stock <= 0;
    const card = document.createElement('button');
    card.className = `prod-card${cart.has(p.id) ? ' in-cart' : ''}`;
    card.disabled = out;
    card.dataset.id = p.id;
    card.innerHTML = `
      <div class="prod-name">${p.name}</div>
      <div class="prod-price">${money(p.selling_price)}</div>
      <div class="prod-meta">${p.unit === 'kg' ? 'por kg' : 'por pieza'}${out ? ' · agotado' : ''}
        ${cart.has(p.id) ? `<span class="badge badge-warn">${cart.get(p.id).quantity} en carrito</span>` : ''}
      </div>`;
    card.title = out ? `${p.name} (agotado)` : `${p.name} · stock: ${p.stock} ${p.unit}`;
    card.addEventListener('click', () => addToCart(p, 1));
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
  for (const { product, quantity } of cart.values()) {
    const subtotal = product.selling_price * quantity;
    const item = document.createElement('div');
    item.className = 'cart-item';
    const step = product.unit === 'kg' ? 0.01 : 1;
    item.innerHTML = `
      <div class="ci-info">
        <div class="ci-name">${product.name}</div>
        <div class="ci-meta">${product.barcode} · ${money(product.selling_price)}/${product.unit}</div>
      </div>
      <button class="ci-rm rm-btn" data-id="${product.id}" title="Quitar del carrito">✕</button>
      <div class="ci-qty">
        <button class="qty-btn qty-minus" data-id="${product.id}" title="Disminuir">−</button>
        <input type="number" class="cart-qty" value="${quantity}" min="0.001" step="${step}"
               data-id="${product.id}" title="Modificar cantidad">
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
  for (const { product, quantity } of cart.values()) total += product.selling_price * quantity;
  return Math.round(total * 100) / 100;
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

async function addToCart(product, qty) {
  if (!product) return;
  const existing = cart.get(product.id);
  const newQty = (existing ? existing.quantity : 0) + qty;
  if (newQty > product.stock && product.unit !== 'kg') {
    setAlert(`Stock insuficiente de "${product.name}". Disponible: ${product.stock} ${product.unit}`);
    return;
  }
  cart.set(product.id, { product, quantity: newQty });
  renderCart();
  setAlert(`${product.name} agregado al carrito.`, 'info');
}

async function addByInput(value) {
  value = String(value || '').trim();
  if (!value) return;
  const q = value.toLowerCase();
  const byCode = allProducts.find((p) => p.barcode && p.barcode.trim().toLowerCase() === q);
  if (byCode) return addToCart(byCode, 1);

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
  await addToCart(target, 1);
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
    const items = [...cart.values()].map(({ product, quantity }) => ({ product_id: product.id, quantity }));
    const sale = await api.sales.create({ items, payment_method: payment });
    lastSale = sale;
    lastPayment = { amountPaid: paid, change: Math.round((paid - sale.total_amount) * 100) / 100 };
    cart.clear();
    renderCart();
    $('amountPaid').value = '';
    setAlert(`Venta #${sale.id} registrada. Imprimiendo ticket…`, 'success');
    printTicket(sale, { amountPaid: paid, change: lastPayment.change });
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
  const card = e.target.closest('.prod-card');
  if (!card || card.disabled) return;
  const p = allProducts.find((x) => x.id === Number(card.dataset.id));
  if (p) addToCart(p, 1);
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
    const dec = entry.product.unit === 'kg' ? 0.01 : 1;
    const qty = Math.round((entry.quantity - dec) * 100) / 100;
    if (qty > 0) entry.quantity = qty;
    else cart.delete(id);
  } else {
    const inc = entry.product.unit === 'kg' ? 0.01 : 1;
    const qty = entry.quantity + inc;
    if (qty > entry.product.stock && entry.product.unit !== 'kg') {
      setAlert(`Stock insuficiente de "${entry.product.name}". Máximo: ${entry.product.stock}`);
      return;
    }
    entry.quantity = qty;
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
  if (qty > entry.product.stock && entry.product.unit !== 'kg') {
    setAlert(`Stock insuficiente de "${entry.product.name}". Máximo: ${entry.product.stock}`);
    entry.quantity = entry.product.stock;
    renderCart();
    return;
  }
  entry.quantity = qty;
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
    const amt = btn.dataset.amt === '0' ? total : Number(btn.dataset.amt);
    $('amountPaid').value = amt.toFixed(2);
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
  if (e.key === 'F2') {
    e.preventDefault();
    $('barcodeInput').focus();
    $('barcodeInput').select();
  }
  if (e.key === 'F9') {
    e.preventDefault();
    charge();
  }
  if (e.key === 'Escape') {
    const modal = document.querySelector('.modal-backdrop.show');
    if (!modal) cancelSale();
  }
});

window.addEventListener('load', () => {
  loadCatalog();
  $('barcodeInput').focus();
});
