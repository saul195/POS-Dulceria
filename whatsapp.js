const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const db = require('./db.js');

const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const LOW_STOCK_HOURS = 12;
const CHECK_INTERVAL_MS = 60 * 1000;

const state = {
  connected: false,
  status: 'off',
  qr: null,
  error: null,
};

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}

function getSettings() {
  return {
    number: getSetting('whatsapp_number') || '',
    enabled: getSetting('whatsapp_enabled') === '1',
    lastLowStockNotification: getSetting('last_low_stock_notification') || null,
  };
}

function setNumber(number) {
  setSetting('whatsapp_number', String(number || '').trim());
}

function setEnabled(value) {
  setSetting('whatsapp_enabled', value ? '1' : '0');
}

function setLastLowStockNotification(ts) {
  setSetting('last_low_stock_notification', ts);
}

let client = null;

function buildLowStockMessage() {
  const rows = db.prepare(
    `SELECT name, barcode, stock, min_stock, unit FROM products
     WHERE stock <= min_stock AND is_active = 1 ORDER BY name`
  ).all();
  if (!rows.length) return null;
  const d = new Date();
  const fecha = d.toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const lines = rows.map((p, i) =>
    `${i + 1}. ${p.name} (${p.barcode || 's/c'}) — ${p.stock} ${p.unit} | mín. ${p.min_stock}`
  );
  return `⚠️ ALERTA DE STOCK BAJO — ${fecha}\n\n${lines.join('\n')}\n\nTotal: ${rows.length} producto(s) con stock bajo.`;
}

function toChatId(number) {
  const n = String(number || '').replace(/\D/g, '');
  return `${n}@c.us`;
}

async function sendMessageTo(number, text) {
  if (!client) throw new Error('Cliente de WhatsApp no inicializado');
  if (!client.info || !client.info.wid) throw new Error('WhatsApp no está conectado');
  await client.sendMessage(toChatId(number), text);
}

async function init() {
  if (client) return;
  const { Client, LocalAuth } = require('whatsapp-web.js');
  const puppeteerOpts = { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  if (fs.existsSync(EDGE_PATH)) puppeteerOpts.executablePath = EDGE_PATH;

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(__dirname, 'wa-session') }),
    puppeteer: puppeteerOpts,
  });

  client.on('qr', async (qr) => {
    state.status = 'qr';
    try {
      if (typeof qr === 'string' && qr.startsWith('data:image')) state.qr = qr;
      else if (typeof qr === 'string') state.qr = await QRCode.toDataURL(qr);
    } catch (e) {
      state.qr = null;
    }
  });

  client.on('authenticated', () => {
    state.status = 'connecting';
  });

  client.on('ready', () => {
    state.connected = true;
    state.status = 'ready';
    state.qr = null;
    state.error = null;
    console.log('[WhatsApp] Conectado');
  });

  client.on('auth_failure', (msg) => {
    state.connected = false;
    state.status = 'error';
    state.error = 'Falló la autenticación: ' + msg;
  });

  client.on('disconnected', (reason) => {
    state.connected = false;
    state.status = 'error';
    state.error = 'Desconectado: ' + reason;
    state.qr = null;
    console.log('[WhatsApp] Desconectado:', reason);
  });

  try {
    await client.initialize();
  } catch (e) {
    state.status = 'error';
    state.error = 'No se pudo iniciar el navegador: ' + e.message;
    console.error('[WhatsApp] Error de inicio:', e.message);
  }
}

function getStatus() {
  return {
    connected: state.connected,
    status: state.status,
    qr: state.qr,
    error: state.error,
  };
}

async function checkAndNotify() {
  const s = getSettings();
  if (!s.enabled || !s.number) return;
  const now = Date.now();
  const last = s.lastLowStockNotification ? new Date(s.lastLowStockNotification).getTime() : 0;
  if (now - last < LOW_STOCK_HOURS * 3600 * 1000) return;
  const msg = buildLowStockMessage();
  if (!msg) return;
  if (!state.connected) return;
  try {
    await sendMessageTo(s.number, msg);
    setLastLowStockNotification(new Date().toISOString());
    console.log('[WhatsApp] Alerta de stock bajo enviada automáticamente');
  } catch (e) {
    console.error('[WhatsApp] Error enviando alerta automática:', e.message);
  }
}

function startLowStockScheduler() {
  setInterval(() => {
    checkAndNotify().catch((e) => console.error('[WhatsApp] Scheduler:', e.message));
  }, CHECK_INTERVAL_MS);
}

async function sendLowStockNow() {
  const s = getSettings();
  if (!s.number) throw new Error('Primero guarda un número de WhatsApp.');
  const msg = buildLowStockMessage();
  if (!msg) throw new Error('No hay productos con stock bajo ahorita.');
  if (!state.connected) throw new Error('WhatsApp no está conectado (escanea el QR).');
  await sendMessageTo(s.number, msg);
  setLastLowStockNotification(new Date().toISOString());
  return { message: msg };
}

async function sendTestNow() {
  const s = getSettings();
  if (!s.number) throw new Error('Primero guarda un número de WhatsApp.');
  if (!state.connected) throw new Error('WhatsApp no está conectado (escanea el QR).');
  const text = `✅ Prueba de alertas WhatsApp — Villa Alegre — ${new Date().toLocaleString('es-MX')}`;
  await sendMessageTo(s.number, text);
  return { message: text };
}

async function resetSession() {
  state.connected = false;
  state.status = 'off';
  state.qr = null;
  state.error = null;
  const dataPath = path.join(__dirname, 'wa-session');
  if (client) {
    try { await client.destroy(); } catch (e) { /* ignorar */ }
    client = null;
  }
  if (fs.existsSync(dataPath)) {
    fs.rmSync(dataPath, { recursive: true, force: true });
  }
  await init();
  return getStatus();
}

module.exports = {
  init,
  getStatus,
  getSettings,
  setNumber,
  setEnabled,
  checkAndNotify,
  startLowStockScheduler,
  sendLowStockNow,
  sendTestNow,
  resetSession,
};
