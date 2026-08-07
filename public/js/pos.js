const cart = new Map(); // product_id -> { product, quantity }
let lastSale = null;
let lastPayment = null;

const $ = (id) => document.getElementById(id);

/* ---------------- Carrito ---------------- */

function renderCart() {
  const body = $('cartBody');
  body.innerHTML = '';
  let total = 0;
  for (const { product, quantity } of cart.values()) {
    const subtotal = product.selling_price * quantity;
    total += subtotal;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="muted">${product.barcode}</td>
      <td>${product.name} <span class="muted">(${product.unit})</span></td>
      <td class="num">${money(product.selling_price)}</td>
      <td class="num"><input type="number" class="cart-qty" value="${quantity}"
           min="0.001" step="${product.unit === 'kg' ? 0.01 : 1}"
           data-id="${product.id}" title="Modificar cantidad"></td>
      <td class="num subtotal">${money(subtotal)}</td>
      <td class="num"><button class="btn btn-danger btn-sm rm-btn" data-id="${product.id}">✕</button></td>`;
    body.appendChild(tr);
  }
  if (cart.size === 0) {
    body.innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center;padding:28px;">
      Carrito vacío. Escanea un código o busca un producto.</td></tr>`;
  }
  $('totalLabel').textContent = money(total);
  updateChange();
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

function cartTotal() {
  let total = 0;
  for (const { product, quantity } of cart.values()) total += product.selling_price * quantity;
  return Math.round(total * 100) / 100;
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

async function addByBarcode(code) {
  code = String(code || '').trim();
  if (!code) return;
  try {
    const p = await api.products.byBarcode(code);
    await addToCart(p, 1);
    $('barcodeInput').value = '';
    return p;
  } catch (e) {
    setAlert(`Producto no encontrado para el código "${code}".`);
    $('barcodeInput').value = '';
    $('barcodeInput').focus();
  }
}

/* ---------------- Búsqueda ---------------- */

let searchTimer = null;
async function runSearch(q) {
  const box = $('searchResults');
  q = q.trim();
  if (!q) { box.classList.remove('show'); return; }
  try {
    const { products } = await api.products.list({ search: q, pageSize: 8 });
    if (!box._showing) return;
    box.innerHTML = '';
    if (!products.length) {
      box.innerHTML = `<div class="item"><span class="empty">Sin resultados para "${q}"</span></div>`;
    }
    for (const p of products) {
      const el = document.createElement('div');
      el.className = 'item';
      el.innerHTML = `<span><b>${p.name}</b> <span class="meta">${p.barcode}</span></span>
        <span class="meta">${money(p.selling_price)} · disp. ${p.stock} ${p.unit}</span>`;
      el.addEventListener('click', () => {
        addToCart(p, 1);
        $('searchInput').value = '';
        box.classList.remove('show');
        $('barcodeInput').focus();
      });
      box.appendChild(el);
    }
  } catch (e) {
    box.innerHTML = `<div class="item"><span class="empty">${e.message}</span></div>`;
  }
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
  if (e.key === 'Enter') { e.preventDefault(); addByBarcode($('barcodeInput').value); }
});

$('addBarcodeBtn').addEventListener('click', () => addByBarcode($('barcodeInput').value));

$('searchInput').addEventListener('input', () => {
  const box = $('searchResults');
  box._showing = true;
  box.classList.add('show');
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch($('searchInput').value), 200);
});
$('searchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { $('searchResults').classList.remove('show'); }
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) $('searchResults').classList.remove('show');
});

$('cartBody').addEventListener('click', (e) => {
  const btn = e.target.closest('.rm-btn');
  if (!btn) return;
  cart.delete(Number(btn.dataset.id));
  renderCart();
});

$('cartBody').addEventListener('change', (e) => {
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
  $('amountPaid').disabled = !isCash;
  if (!isCash) { $('amountPaid').value = cartTotal().toFixed(2); }
  updateChange();
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

window.addEventListener('load', () => $('barcodeInput').focus());
