const STORE_NAME = 'DULCERÍA "EL DULCE"';
const STORE_ADDRESS = 'Calle 5 de Mayo #12, Centro';
const STORE_PHONE = 'Tel: 555-123-4567';

function pad(n, w) { return String(n).padStart(w, '0'); }

function padZ(n) { return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function line(...parts) {
  return parts.map((p) => p || '').join('');
}

/* Construye el HTML del ticket de 80mm (monospace, ~32 caracteres por línea). */
function renderTicket(sale, opts = {}) {
  const amountPaid = Number(opts.amountPaid || 0);
  const change = Number(opts.change || 0);
  const payment = sale.payment_method;

  const d = new Date(String(sale.created_at).replace(' ', 'T'));
  const dateStr = `${pad(d.getDate(), 2)}/${pad(d.getMonth() + 1, 2)}/${d.getFullYear()} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`;

  let rows = '';
  for (const it of sale.items) {
    const name = it.product_name || 'Producto';
    const nameShort = name.length > 20 ? name.slice(0, 20) : name;
    const is100 = it.sale_mode === '100g' && it.sale_price != null;
    const qty = is100 ? `${Math.round(it.quantity * 10)}×100g` : (it.unit === 'kg' ? `${Math.round(it.quantity * 1000)}g` : padZ(it.quantity));
    const unit = is100 ? '' : (it.unit === 'kg' ? '' : it.unit);
    const price = padZ(is100 ? it.sale_price : it.unit_price);
    const priceUnit = is100 ? '/100g' : (it.unit === 'kg' ? '/kg' : '');
    const subtotal = padZ(it.subtotal);
    let n1 = `${qty}${unit}`;
    let n2 = nameShort;
    let n3 = padZ(it.subtotal);
    if (n1.length + 1 + n2.length > 26) n2 = n2.slice(0, 25 - n1.length);
    rows += `<tr><td>${n1}</td><td>${n2}</td><td class="right">${n3}</td></tr>`;
    rows += `<tr><td></td><td colspan="2" style="font-size:10px;color:#000;">@ ${price}${priceUnit}</td></tr>`;
  }

  const methodLabel = payment === 'efectivo' ? 'EFECTIVO' : payment.toUpperCase();
  const paymentLine = payment === 'efectivo'
    ? `<tr><td>${methodLabel}</td><td class="right">${padZ(amountPaid)}</td></tr><tr><td>CAMBIO</td><td class="right">${padZ(change)}</td></tr>`
    : `<tr><td>${methodLabel}</td><td class="right">${padZ(sale.total_amount)}</td></tr>`;

  return `
  <div class="ticket" id="ticketPrint">
    <div class="tc t-name">${STORE_NAME}</div>
    <div class="tc">${STORE_ADDRESS}</div>
    <div class="tc">${STORE_PHONE}</div>
    <div class="t-sep"></div>
    <div>TICKET: #${pad(sale.id, 6)}</div>
    <div>FECHA: ${dateStr}</div>
    <div>ARTICULOS: ${sale.items.length}</div>
    <div class="t-sep"></div>
    <table>
      <tr><td><b>CANT</b></td><td><b>DESCRIPCION</b></td><td class="right"><b>IMPORTE</b></td></tr>
      ${rows}
    </table>
    <div class="t-sep"></div>
    <table>
      <tr><td>SUBTOTAL</td><td class="right">${padZ(sale.total_amount)}</td></tr>
      <tr><td>TOTAL</td><td class="right">${padZ(sale.total_amount)}</td></tr>
      ${paymentLine}
    </table>
    <div class="t-sep"></div>
    <div class="tc">* GRACIAS POR SU COMPRA *</div>
    <div class="tc" style="font-size:10px;">Articulos vendidos no se cambian ni reembolsan</div>
    <div class="tc" style="font-size:10px;">www.dulceriaeldulce.mx</div>
  </div>`;
}

/* Inyecta el ticket y dispara la impresión. */
function printTicket(sale, opts) {
  let holder = document.getElementById('ticketHolder');
  if (!holder) {
    holder = document.createElement('div');
    holder.id = 'ticketHolder';
    holder.className = 'ticket-print-area';
    document.body.appendChild(holder);
  }
  holder.innerHTML = renderTicket(sale, opts);
  window.print();
}

/* Vista previa del ticket en pantalla (modal). */
function previewTicket(sale, opts = {}) {
  const html = renderTicket(sale, opts);
  openModal(html, 'ticket-modal');
}
