const $ = (id) => document.getElementById(id);

function showLogin() {
  $('loginBox').classList.remove('hidden');
  $('configBox').classList.add('hidden');
  checkInternet();
  $('waPassword').focus();
}

function showPanel() {
  $('loginBox').classList.add('hidden');
  $('configBox').classList.remove('hidden');
  checkInternet();
  loadWhatsAppStatus(true);
  if (!window._waPolling) {
    window._waPolling = true;
    setInterval(() => loadWhatsAppStatus(false), 5000);
    setInterval(checkInternet, 15000);
  }
}

async function checkInternet() {
  const login = document.getElementById('netStatusLogin');
  const config = document.getElementById('netStatusConfig');
  const set = (el, ok) => {
    if (!el) return;
    if (ok) { el.textContent = '🌐 Conectado a Internet'; el.className = 'wa-net ok'; }
    else { el.textContent = '🚫 Sin conexión a Internet'; el.className = 'wa-net bad'; }
  };
  if (navigator.onLine === false) { set(login, false); set(config, false); return false; }
  try {
    await Promise.race([
      fetch('https://www.gstatic.com/generate_204', { mode: 'no-cors', cache: 'no-store' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
    ]);
    set(login, true); set(config, true);
    return true;
  } catch (e) {
    set(login, false); set(config, false);
    return false;
  }
}

async function doLogin() {
  const ok = await checkInternet();
  if (!ok) { toast('No hay conexión a internet. Verifica tu red.', 'error'); return; }
  try {
    await api.whatsapp.login($('waPassword').value);
    toast('Bienvenido.');
    showPanel();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function loadWhatsAppStatus(populate = false) {
  try {
    const s = await api.whatsapp.status();
    if (populate) {
      $('waEnabled').checked = !!s.enabled;
    }
    const el = $('waStatus');
    const qrEl = $('waQr');
    if (s.status === 'ready' && s.connected) {
      el.textContent = `✅ WhatsApp conectado. Alertas automáticas ${s.enabled ? 'ACTIVAS' : 'desactivadas'} (cada 12 h).`;
      qrEl.classList.add('hidden');
      qrEl.innerHTML = '';
    } else if (s.status === 'qr' && s.qr) {
      el.textContent = '📱 Escanea este QR con la cuenta que ENVIARÁ los mensajes (WhatsApp → Ajustes → Dispositivos vinculados).';
      qrEl.classList.remove('hidden');
      qrEl.innerHTML = `<img src="${s.qr}" alt="Código QR de WhatsApp" style="width:220px;max-width:100%;border-radius:8px;">`;
    } else if (s.status === 'error') {
      el.textContent = '⚠️ ' + (s.error || 'Error de conexión.');
      qrEl.classList.add('hidden');
    } else {
      el.textContent = '⏳ Conectando con WhatsApp…';
      qrEl.classList.add('hidden');
    }
  } catch (e) {
    $('waStatus').textContent = '⚠️ ' + e.message;
  }
}

async function saveWhatsAppConfig() {
  try {
    await api.whatsapp.config({ number: $('waNumber').value.trim(), enabled: $('waEnabled').checked });
    toast('Configuración de WhatsApp guardada.');
    loadWhatsAppStatus(true);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function sendWhatsAppTest() {
  try {
    await api.whatsapp.test();
    toast('Mensaje de prueba enviado.');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function sendLowStockNow() {
  try {
    await api.whatsapp.lowstock();
    toast('Alerta de stock enviada a WhatsApp.');
  } catch (e) {
    toast(e.message, 'error');
  }
}

$('waLoginBtn').addEventListener('click', doLogin);
$('waPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
$('waSaveBtn').addEventListener('click', saveWhatsAppConfig);
$('waTestBtn').addEventListener('click', sendWhatsAppTest);
$('waLowStockBtn').addEventListener('click', sendLowStockNow);
$('waResetBtn').addEventListener('click', () => {
  confirmDialog('¿Reiniciar la sesión de WhatsApp? Se borrará el QR actual y tendrás que escanear uno nuevo con la cuenta que enviará los mensajes.', async () => {
    try {
      await api.whatsapp.resetSession();
      toast('Sesión reiniciada. Escanea el nuevo QR.');
    } catch (e) {
      toast(e.message, 'error');
    }
  });
});

window.addEventListener('load', () => {
  showLogin();
});
