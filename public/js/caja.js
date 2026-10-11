const $ = (id) => document.getElementById(id);

const dNow = new Date();
const today = `${dNow.getFullYear()}-${String(dNow.getMonth() + 1).padStart(2, '0')}-${String(dNow.getDate()).padStart(2, '0')}`;

const fmtDT = (v) => (v ? String(v).slice(0, 16) : '—');

/* ---------------- Tarjetas plegables ---------------- */

function initCardToggle(toggleId, bodyId, storageKey) {
  const toggle = $(toggleId);
  if (!toggle) return;
  toggle.checked = localStorage.getItem(storageKey) !== '0';
  const apply = () => {
    const hidden = !toggle.checked;
    const body = $(bodyId);
    const text = toggle.parentElement.querySelector('.toggle-text');
    if (body) body.style.display = hidden ? 'none' : '';
    if (text) text.textContent = hidden ? 'Inactiva' : 'Activa';
  };
  toggle.addEventListener('change', () => {
    localStorage.setItem(storageKey, toggle.checked ? '1' : '0');
    apply();
  });
  apply();
}

/* ---------------- Apertura y cierre ---------------- */

function renderCash(session) {
  const box = $('cashBox');
  if (session) {
    box.classList.remove('muted');
    box.innerHTML = `
      <div class="row" style="justify-content:space-between;">
        <div>
          <span class="badge badge-ok">CAJA ABIERTA</span>
          <div class="muted" style="margin-top:6px;">
            Cajero: <b>${escHtml(session.cashier_name || '')}</b><br>
            Fondo inicial: <b>${moneyMX(session.opening_amount)}</b><br>
            Apertura: ${session.opening_date}<br>
            Ingresos del turno: <b>${moneyMX(session.turn_sales ?? session.today_sales ?? 0)}</b><br>
            Ventas de hoy en caja: <b>${moneyMX(session.today_sales ?? session.turn_sales ?? 0)}</b><br>
            Esperado en caja: <b>${moneyMX(session.expected ?? 0)}</b>
          </div>
        </div>
        <button class="btn btn-danger" id="closeCashBtn">Cerrar caja / corte</button>
      </div>`;
    $('closeCashBtn').addEventListener('click', () => {
      const modal = openModal(`
        <h3>Cerrar caja (corte de turno)</h3>
        <p class="muted mb">Fondo inicial: ${moneyMX(session.opening_amount)} · Ventas de hoy: ${moneyMX(session.today_sales ?? 0)}<br>
        Cantidad esperada: <b>${moneyMX(session.expected ?? 0)}</b></p>
        <div class="form-field mb">
          <label>Cantidad contada en caja ($)</label>
          <input type="number" id="closingAmount" step="0.01" min="0" value="${session.expected ?? 0}">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cxlClose">Cancelar</button>
          <button class="btn btn-danger" id="doClose">Cerrar caja</button>
        </div>`, 'closeCashModal');
      modal.querySelector('#cxlClose').addEventListener('click', () => closeModal(modal.closest('.modal-backdrop')));
      modal.querySelector('#doClose').addEventListener('click', async () => {
        try {
          const r = await api.cash.close({ closing_amount: parseFloat(modal.querySelector('#closingAmount').value) || 0 });
          closeModal(modal.closest('.modal-backdrop'));
          const diff = r.difference;
          toast(`Caja cerrada. ${diff >= 0 ? 'Sobrante' : 'Faltante'}: ${moneyMX(Math.abs(diff))}`, diff >= 0 ? 'success' : 'error');
          loadCash();
          loadTurns();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  } else {
    box.classList.remove('muted');
    box.innerHTML = `
      <div class="row" style="justify-content:space-between;">
        <div>
          <span class="badge badge-warn">CAJA CERRADA</span>
          <div class="muted" style="margin-top:6px;">Abre caja con tu fondo inicial para registrar el turno.</div>
        </div>
        <button class="btn btn-success" id="openCashBtn">Abrir caja</button>
      </div>`;
    $('openCashBtn').addEventListener('click', () => {
      const modal = openModal(`
        <h3>Abrir caja</h3>
        <div class="form-field mb">
          <label>Tu nombre</label>
          <input type="text" id="openingName" autocomplete="off" placeholder="Nombre del encargado">
        </div>
        <div class="form-field mb">
          <label>Fondo inicial de caja ($)</label>
          <input type="number" id="openingAmount" step="0.01" min="0" value="0">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cxlOpen">Cancelar</button>
          <button class="btn btn-success" id="doOpen">Abrir</button>
        </div>`, 'openCashModal');
      modal.querySelector('#cxlOpen').addEventListener('click', () => closeModal(modal.closest('.modal-backdrop')));
      modal.querySelector('#doOpen').addEventListener('click', async () => {
        const name = modal.querySelector('#openingName').value.trim();
        if (!name) return toast('Registra tu nombre para abrir la caja', 'error');
        try {
          await api.cash.open({ opening_amount: parseFloat(modal.querySelector('#openingAmount').value) || 0, cashier_name: name });
          closeModal(modal.closest('.modal-backdrop'));
          toast('Caja abierta.');
          loadCash();
          loadTurns();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  }
}

async function loadCash() {
  try {
    const r = await api.cash.status();
    renderCash(r.session);
  } catch (e) {
    toast(e.message, 'error');
  }
}

/* ---------------- Turnos ---------------- */

function turnsGetDates() {
  const period = $('turnsPeriod').value;
  const now = new Date();
  let sd, ed;
  if (period === 'day') {
    sd = ed = today;
  } else if (period === 'week') {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const mon = new Date(now);
    mon.setDate(now.getDate() - diff);
    sd = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
    ed = today;
  } else if (period === 'month') {
    sd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    ed = today;
  } else if (period === 'all') {
    return {};
  } else {
    sd = $('turnsFrom').value || today;
    ed = $('turnsTo').value || today;
  }
  if (sd > ed) [sd, ed] = [ed, sd];
  return { start_date: sd, end_date: ed };
}

async function loadTurns() {
  try {
    const r = await api.cash.turns(turnsGetDates());
    const empty = $('turnsEmpty');
    const body = $('turnsBody');
    const foot = $('turnsFoot');
    const turns = r.turns || [];
    empty.classList.toggle('hidden', turns.length > 0);
    body.innerHTML = turns.map((t) => {
      const open = t.status === 'abierta';
      const diff = t.difference != null ? Number(t.difference) : null;
      const diffTxt = diff == null ? '—' : `${diff >= 0 ? '+' : ''}${moneyMX(Math.abs(diff))}`;
      const diffClass = diff == null ? '' : (diff === 0 ? 'ok' : (diff > 0 ? 'ok' : 'err'));
      return `
        <tr class="${open ? 'turn-open' : ''}">
          <td>${open ? '<span class="badge badge-ok">●</span>' : ''}${t.id}</td>
          <td><b>${escHtml(t.cashier_name || '—')}</b></td>
          <td>${fmtDT(t.opening_date)}</td>
          <td>${open ? '<span class="badge badge-ok">Abierta</span>' : fmtDT(t.closing_date)}</td>
          <td class="num">${t.turn_count || 0}</td>
          <td class="num"><b>${moneyMX(t.sales_total || 0)}</b></td>
          <td class="num">${moneyMX(t.opening_amount || 0)}</td>
          <td class="num">${moneyMX(t.expected ?? 0)}</td>
          <td class="num">${t.closing_amount != null ? moneyMX(t.closing_amount) : '—'}</td>
          <td class="num ${diffClass}">${diffTxt}</td>
        </tr>`;
    }).join('');
    const tt = r.totals;
    foot.innerHTML = `
      <tr class="turns-total">
        <td colspan="4"><b>Total · ${tt.turns} turno${tt.turns === 1 ? '' : 's'}</b></td>
        <td class="num"><b>${tt.sales_count}</b></td>
        <td class="num"><b>${moneyMX(tt.sales_total)}</b></td>
        <td class="num"><b>${moneyMX(tt.opening)}</b></td>
        <td class="num"><b>${moneyMX(tt.expected)}</b></td>
        <td class="num"><b>${tt.closing ? moneyMX(tt.closing) : '—'}</b></td>
        <td class="num"><b>${tt.difference ? moneyMX(tt.difference) : '—'}</b></td>
      </tr>`;
  } catch (e) {
    toast(e.message, 'error');
  }
}

/* ---------------- Init ---------------- */

$('turnsPeriod').addEventListener('change', () => {
  const isCustom = $('turnsPeriod').value === 'custom';
  $('turnsDates').classList.toggle('hidden', !isCustom);
  loadTurns();
});
$('turnsGo').addEventListener('click', loadTurns);
$('turnsFrom').value = today;
$('turnsTo').value = today;

initCardToggle('cashToggle', 'cashContent', 'pos_cash_card');
initCardToggle('turnsToggle', 'turnsContent', 'pos_turns_card');

loadCash();
loadTurns();
setInterval(loadCash, 60000);