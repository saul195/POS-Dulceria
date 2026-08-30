const STORE_NAME = 'DULCERÍA "VILLA ALEGRE"';
const STORE_ADDRESS = 'Calle 5 de Mayo #12, Centro';
const STORE_PHONE = 'Tel: 555-123-4567';

function pad(n, w) { return String(n).padStart(w, '0'); }

function padZ(n) { return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function line(...parts) {
  return parts.map((p) => p || '').join('');
}

/* Construye el HTML del ticket de 80mm (monospace, ~32 caracteres por línea). */
function renderTicket(sale, opts = {}) {
  const payment = sale.payment_method;

  const d = new Date(String(sale.created_at).replace(' ', 'T'));
  const dateStr = `${pad(d.getDate(), 2)}/${pad(d.getMonth() + 1, 2)}/${d.getFullYear()} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`;

  let rows = '';
  for (const it of sale.items) {
    const name = it.product_name || 'Producto';
    const nameShort = name.length > 20 ? name.slice(0, 20) : name;
    const qty = it.unit === 'kg' ? `${Math.round(it.quantity * 1000)}g` : padZ(it.quantity);
    const unit = it.unit === 'kg' ? '' : it.unit;
    const cost = padZ(it.subtotal != null ? it.subtotal : (it.unit_price * it.quantity));
    let n1 = `${qty}${unit}`;
    let n2 = nameShort;
    let n3 = cost;
    if (n1.length + 1 + n2.length > 26) n2 = n2.slice(0, 25 - n1.length);
    rows += `<tr><td>${n1}</td><td>${n2}</td><td class="right">${n3}</td></tr>`;
  }

  const methodLabel = payment === 'efectivo' ? 'EFECTIVO' : payment.toUpperCase();
  const paid = sale.cash_received != null ? Number(sale.cash_received) : (Number(opts.amountPaid) || Number(sale.total_amount) || 0);
  const change = sale.change != null ? Number(sale.change) : (Number(opts.change) || Math.max(0, paid - sale.total_amount));
  const paymentLine = payment === 'efectivo'
    ? `<tr><td>${methodLabel}</td><td class="right">${padZ(paid)}</td></tr><tr><td>CAMBIO</td><td class="right">${padZ(change)}</td></tr>`
    : `<tr><td>${methodLabel}</td><td class="right">${padZ(sale.total_amount)}</td></tr>`;

  return `
  <div class="ticket" id="ticketPrint">
    <div class="tc t-logo"><img src="/logo.svg" alt="Logo" class="t-logo-img"></div>
    <div class="tc t-name">${STORE_NAME}</div>
    <div class="t-sep"></div>
    <table class="t-meta">
      <tr><td>TICKET</td><td class="right">#${pad(sale.ticket_no || sale.id, 6)}</td></tr>
      <tr><td>FECHA</td><td class="right">${dateStr}</td></tr>
      <tr><td>ARTICULOS</td><td class="right">${sale.items.length}</td></tr>
    </table>
    <div class="t-sep"></div>
    <table class="t-items">
      <tr><td class="w-qty"><b>CANT</b></td><td><b>DESCRIPCION</b></td><td class="right w-cost"><b>COSTO</b></td></tr>
      ${rows}
    </table>
    <div class="t-sep"></div>
    <table class="t-totals">
      <tr><td><b>TOTAL A PAGAR</b></td><td class="right"><b>${padZ(sale.total_amount)}</b></td></tr>
      ${paymentLine}
    </table>
    <div class="t-sep"></div>
    <div class="tc">* GRACIAS POR SU COMPRA *</div>
  </div>`;
}

/* Imprime el ticket: directo a la impresora configurada (ESC/POS por spooler) o con diálogo del navegador. */
async function printTicket(sale, opts) {
  if (typeof printer !== 'undefined' && printer.isRegistered()) {
    try {
      await printer.printSale(sale, opts);
      return;
    } catch (e) {
      console.warn('[ticket] Impresión falló, usando diálogo del navegador.', e && e.message);
    }
  }
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
