/* Impresora de tickets: se configura con el nombre de la impresora instalada en Windows + ancho en mm.
   El servidor envía los bytes ESC/POS directo al spooler. */

const pad2 = (n) => String(n).padStart(2, '0');
const padL = (s, w) => String(s).slice(0, w).padEnd(w);
const padR = (s, w) => String(s).slice(0, w).padStart(w);
const fmtM = (n) => Number(n || 0).toFixed(2);

/* ---------- Codepage PC850 (caracteres en español) ---------- */
const CP850 = [
  '\u00C7','\u00FC','\u00E9','\u00E2','\u00E4','\u00E0','\u00E5','\u00E7','\u00EA','\u00EB','\u00E8','\u00EF','\u00EE','\u00EC','\u00C4','\u00C5',
  '\u00C9','\u00E6','\u00C6','\u00F4','\u00F6','\u00F2','\u00FB','\u00F9','\u00FF','\u00D6','\u00DC','\u00A2','\u00A3','\u00A5','\u20A7','\u0192',
  '\u00E1','\u00ED','\u00F3','\u00FA','\u00F1','\u00D1','\u00AA','\u00BA','\u00BF','\u00AE','\u00AC','\u00BD','\u00BC','\u00A1','\u00AB','\u00BB',
  '\u2591','\u2592','\u2593','\u2502','\u2524','\u00C1','\u00C2','\u00C0','\u00A9','\u2563','\u2551','\u2557','\u255D','\u00A2','\u00A5','\u2510',
  '\u2514','\u2534','\u252C','\u251C','\u2500','\u253C','\u00E3','\u00C3','\u255A','\u2554','\u2569','\u2566','\u2560','\u2550','\u256C','\u00A4',
  '\u00F0','\u00D0','\u00CA','\u00CB','\u00C8','\u0131','\u00CD','\u00CE','\u00CF','\u2518','\u250C','\u2588','\u2584','\u00A6','\u00CC','\u2580',
  '\u00D3','\u00DF','\u00D4','\u00D2','\u00F5','\u00D5','\u00B5','\u00FE','\u00DE','\u00DA','\u00DB','\u00D9','\u00FD','\u00DD','\u00AF','\u00B4',
  '\u00AD','\u00B1','\u2017','\u00BE','\u00B6','\u00A7','\u00F7','\u00B8','\u00B0','\u00A8','\u00B7','\u00B9','\u00B3','\u00B2','\u25A0','\u00A0'
];
const CP850_MAP = new Map();
CP850.forEach((ch, i) => { if (ch && ch !== '\u00A0' && !CP850_MAP.has(ch)) CP850_MAP.set(ch, 0x80 + i); });

function cp850Bytes(str) {
  const out = [];
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    if (code < 0x80) { out.push(code); continue; }
    if (ch === '\u00A0') { out.push(0x20); continue; }
    const mapped = CP850_MAP.get(ch);
    if (mapped != null) { out.push(mapped); continue; }
    const de = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (de.length === 1 && de.codePointAt(0) < 0x80) out.push(de.codePointAt(0));
    else out.push(0x3F);
  }
  return new Uint8Array(out);
}

/* ---------- Columnas según el ancho del papel ---------- */
function columnsForWidth(mm) {
  mm = Number(mm) || 80;
  if (mm <= 48) return 24;
  if (mm <= 60) return 32;
  return 48;
}

/* ---------- Formato del ticket ---------- */
function receiptItemLines(it, qtyW, nameW, subW, gap) {
  const name = it.product_name || 'Producto';
  const is100 = it.sale_mode === '100g' && it.sale_price != null;
  const qty = is100 ? `${Math.round(it.quantity * 10)}x100g`
    : it.unit === 'kg' ? `${Math.round(it.quantity * 1000)}g`
    : fmtM(it.quantity);
  const unit = is100 ? '' : (it.unit === 'kg' ? '' : it.unit);
  const price = fmtM(is100 ? it.sale_price : it.unit_price);
  const priceUnit = is100 ? '/100g' : (it.unit === 'kg' ? '/kg' : '');
  let n1 = `${qty}${unit}`;
  let n2 = name;
  if (n2.length > nameW) n2 = n2.slice(0, nameW);
  if (n1.length > qtyW) n1 = n1.slice(0, qtyW);
  return [
    padR(n1, qtyW) + ' '.repeat(gap) + padL(n2, nameW) + padR(price + priceUnit, subW),
  ];
}

function receiptLines(sale, opts = {}, cols) {
  cols = Number(cols) || 32;
  const qtyW = cols < 40 ? 6 : 8;
  const subW = cols < 40 ? 9 : 12;
  const gap = 1;
  const nameW = cols - qtyW - gap - subW;
  const pairW = cols - subW;
  const sep = { text: '-'.repeat(cols), align: 'left', mode: 0 };
  const d = new Date(String(sale.created_at).replace(' ', 'T'));
  const dateStr = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const L = [];

  L.push({ text: STORE_NAME, align: 'center', mode: 0x38 });
  L.push(sep);
  L.push({ text: padL('TICKET', pairW) + padR('#' + String(sale.ticket_no || sale.id).padStart(6, '0'), subW) });
  L.push({ text: padL('FECHA', pairW) + padR(dateStr, subW) });
  L.push({ text: padL('ARTICULOS', pairW) + padR(String(sale.items.length), subW) });
  L.push(sep);
  L.push({ text: padR('CANT', qtyW) + ' '.repeat(gap) + padL('DESCRIPCION', nameW) + padR('COSTO', subW), mode: 0x08 });
  for (const it of sale.items) {
    const pair = receiptItemLines(it, qtyW, nameW, subW, gap);
    L.push({ text: pair[0] });
  }
  L.push(sep);
  L.push({ text: padL('TOTAL A PAGAR', pairW) + padR(fmtM(sale.total_amount), subW), mode: 0x08 });
  if (sale.payment_method === 'efectivo') {
    L.push({ text: padL('EFECTIVO', pairW) + padR(fmtM(Number(opts.amountPaid) || 0), subW) });
    L.push({ text: padL('CAMBIO', pairW) + padR(fmtM(Number(opts.change) || 0), subW) });
  } else {
    L.push({ text: padL(String(sale.payment_method || 'PAGO').toUpperCase(), pairW) + padR(fmtM(sale.total_amount), subW) });
  }
  L.push(sep);
  L.push({ text: '* GRACIAS POR SU COMPRA *', align: 'center' });
  return L;
}

function testReceiptLines(cols, mm) {
  cols = Number(cols) || 32;
  return [
    { text: STORE_NAME, align: 'center', mode: 0x38 },
    { text: 'PRUEBA DE IMPRESION', align: 'center', mode: 0x08 },
    { text: `Ancho: ${mm} mm`, align: 'center' },
    { text: 'Si ves este texto la impresora', align: 'center' },
    { text: 'quedo configurada correctamente.', align: 'center' },
    { text: '-'.repeat(cols) },
    { text: `Fecha: ${new Date().toLocaleString('es-MX')}` },
    { text: 'Listo para cobrar e imprimir.' },
  ];
}

/* ---------- Comandos ESC/POS ---------- */
function escposBuild(lines) {
  const out = [];
  const pushB = (...bs) => out.push(...bs);
  pushB(0x1B, 0x40);
  pushB(0x1B, 0x74, 0x02);
  for (const ln of lines) {
    const align = ln.align === 'center' ? 0x01 : ln.align === 'right' ? 0x02 : 0x00;
    pushB(0x1B, 0x61, align);
    pushB(0x1B, 0x21, ln.mode || 0);
    for (const b of cp850Bytes(ln.text)) out.push(b);
    pushB(0x0A);
    pushB(0x1B, 0x21, 0);
  }
  pushB(0x1B, 0x64, 4);
  pushB(0x1D, 0x56, 0x42, 0x00);
  return new Uint8Array(out);
}

/* ---------- Logo del ticket (raster ESC/POS GS v 0) ---------- */
const LOGO_URL = '/logo.svg';
let logoImagePromise = null;
let logoRasterCache = {};

function loadLogoImage() {
  if (!logoImagePromise) {
    logoImagePromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = LOGO_URL;
    });
  }
  return logoImagePromise;
}

/* Convierte la imagen a mapa de bits 1-bit (blanco → negro, fondo azul → vacío).
   El raster ocupa todo el ancho imprimible (canvasW) y la imagen se dibuja en
   offsetX, así el logo queda centrado sin depender del comando ESC $ de la impresora. */
function rasterLogo(img, targetW, offsetX = 0, canvasW = targetW) {
  const targetH = Math.max(1, Math.round(targetW * (img.naturalHeight / img.naturalWidth)));
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, offsetX, 0, targetW, targetH);
  const pix = ctx.getImageData(0, 0, canvasW, targetH).data;
  const bytesPerRow = Math.ceil(canvasW / 8);
  const out = new Uint8Array(bytesPerRow * targetH);
  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < canvasW; x++) {
      const i = (y * canvasW + x) * 4;
      const lum = (0.299 * pix[i] + 0.587 * pix[i + 1] + 0.114 * pix[i + 2]) * (pix[i + 3] / 255);
      if (lum > 140) out[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { data: out, w: canvasW, h: targetH, bytesPerRow };
}

function escposLogoBytes(raster, leftDots = 0) {
  const out = [];
  if (leftDots > 0) {
    out.push(0x1B, 0x24, leftDots & 0xFF, (leftDots >> 8) & 0xFF);
  }
  const x = raster.bytesPerRow, y = raster.h;
  out.push(0x1D, 0x76, 0x30, 0x00);
  out.push(x & 0xFF, (x >> 8) & 0xFF);
  out.push(y & 0xFF, (y >> 8) & 0xFF);
  for (const b of raster.data) out.push(b);
  out.push(0x0A);
  return new Uint8Array(out);
}

function concatBytes(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

/* Ancho imprimible estándar de impresoras térmicas ESC/POS (a 203 dpi). */
function printableDots(mm) {
  mm = Number(mm) || 80;
  return mm <= 60 ? 384 : 576;
}

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/* ---------- API de la impresora (por nombre + ancho mm) ---------- */
const printer = {
  config: null,

  async loadConfig() {
    try { this.config = await api.get('/api/printer/config'); } catch (e) { this.config = null; }
    return this.config;
  },
  isRegistered() {
    return !!(this.config && this.config.printer_name);
  },
  getWidth() {
    return Number((this.config && this.config.width_mm) || 80);
  },
  async saveConfig(cfg) {
    this.config = await api.post('/api/printer/config', cfg);
    return this.config;
  },
  async sendBytes(bytes, printerName) {
    const name = printerName || (this.config && this.config.printer_name);
    if (!name) throw new Error('Primero configura la impresora con el botón superior.');
    await api.post('/api/printer/print', { printer_name: name, bytes: bytesToBase64(bytes) });
  },
  async testPrint(cfg) {
    const mm = cfg && cfg.width_mm ? Number(cfg.width_mm) : this.getWidth();
    const cols = columnsForWidth(mm);
    const bytes = escposBuild(testReceiptLines(cols, mm));
    const logo = await this._logoBytes();
    await this.sendBytes(logo ? concatBytes(logo, bytes) : bytes, cfg && cfg.printer_name);
  },
  async _logoBytes() {
    try {
      const img = await loadLogoImage();
      if (!img) return null;
      const mm = this.getWidth();
      const paperDots = printableDots(mm);
      const artworkW = Math.max(90, Math.round(paperDots * 0.35));
      const key = `full-${paperDots}-${artworkW}`;
      if (!logoRasterCache[key]) {
        const offsetX = Math.max(0, Math.round((paperDots - artworkW) / 2));
        logoRasterCache[key] = escposLogoBytes(rasterLogo(img, artworkW, offsetX, paperDots));
      }
      return logoRasterCache[key];
    } catch (e) {
      console.warn('[printer] Logo no disponible:', e && e.message);
      return null;
    }
  },
  async printSale(sale, opts) {
    const cols = columnsForWidth(this.getWidth());
    const bytes = escposBuild(receiptLines(sale, opts, cols));
    const logo = await this._logoBytes();
    await this.sendBytes(logo ? concatBytes(logo, bytes) : bytes);
  },
};

/* ---------- UI: botón + modal de configuración ---------- */
function initPrinterUI() {
  const btn = document.getElementById('printerBtn');
  if (!btn) return;
  const label = document.getElementById('printerLabel');
  const modal = document.getElementById('printerModal');
  const nameInput = document.getElementById('printerNameInput');
  const datalist = document.getElementById('printerList');
  const saveBtn = document.getElementById('printerSaveBtn');
  const testBtn = document.getElementById('printerTestBtn');
  const closeBtn = document.getElementById('printerModalClose');
  const widthWrap = document.getElementById('printerWidth');
  let width = 80;

  const refresh = () => {
    if (printer.isRegistered()) {
      btn.classList.add('connected');
      if (label) label.textContent = printer.config.printer_name;
      btn.title = `Impresora: ${printer.config.printer_name} · ${printer.getWidth()} mm. Haz clic para cambiar.`;
    } else {
      btn.classList.remove('connected');
      if (label) label.textContent = 'Registrar impresora';
      btn.title = 'Configurar la impresora de tickets (nombre + ancho)';
    }
  };

  const setWidth = (mm) => {
    width = Number(mm);
    widthWrap.querySelectorAll('.unit-btn').forEach((b) => b.classList.toggle('active', Number(b.dataset.mm) === width));
  };

  const open = async () => {
    if (printer.isRegistered()) {
      nameInput.value = printer.config.printer_name;
      width = Number(printer.config.width_mm) || 80;
    } else {
      width = 80;
    }
    setWidth(width);
    modal.classList.add('show');
    setTimeout(() => nameInput.focus(), 60);
    try {
      const data = await api.get('/api/printer/list');
      datalist.innerHTML = '';
      for (const name of (data.printers || [])) {
        const o = document.createElement('option');
        o.value = name;
        datalist.appendChild(o);
      }
      if ((data.printers || []).length && !nameInput.value) nameInput.value = data.printers[0];
    } catch (e) { /* sin lista, se escribe a mano */ }
  };

  const close = () => modal.classList.remove('show');
  const formCfg = () => ({ printer_name: nameInput.value.trim(), width_mm: width });

  btn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  widthWrap.addEventListener('click', (e) => {
    const b = e.target.closest('.unit-btn');
    if (b) setWidth(b.dataset.mm);
  });

  saveBtn.addEventListener('click', async () => {
    const cfg = formCfg();
    if (!cfg.printer_name) { toast('Escribe el nombre de la impresora', 'error'); return; }
    saveBtn.disabled = true;
    try {
      await printer.saveConfig(cfg);
      refresh();
      close();
      toast('Impresora guardada. Probando…', 'success');
      await printer.testPrint(cfg);
      toast('Impresión de prueba enviada', 'success');
    } catch (e) {
      toast(e.message || 'No se pudo guardar o imprimir', 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });

  testBtn.addEventListener('click', async () => {
    const cfg = formCfg();
    if (!cfg.printer_name) { toast('Escribe el nombre de la impresora', 'error'); return; }
    testBtn.disabled = true;
    try {
      await printer.testPrint(cfg);
      toast('Impresión de prueba enviada', 'success');
    } catch (e) {
      toast(e.message || 'No se pudo imprimir', 'error');
    } finally {
      testBtn.disabled = false;
    }
  });

  printer.loadConfig().then(refresh);
}
