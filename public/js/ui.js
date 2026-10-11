const CAL_MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const CAL_DOW = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

const calPad = (n) => String(n).padStart(2, '0');
const calYmd = (d) => `${d.getFullYear()}-${calPad(d.getMonth() + 1)}-${calPad(d.getDate())}`;

/* Calendario de un día con marcadores por día.
   opts: { mount, value, onChange(day), onMonthChange(start, end),
           loadMarks?(start, end) -> [{day, ...}], legend? }
   loadMarks por defecto usa los movimientos de stock.
   Devuelve { setValue(day), refreshMarks(), getValue() }. */
function createDateCalendar(opts) {
  const { mount, onChange, onMonthChange } = opts;
  const todayStr = calYmd(new Date());
  let val = opts.value || todayStr;
  let marks = {};
  let vy, vm;
  const setView = (y, m) => { vy = y; vm = m; };
  { const p = String(val).split('-'); setView(Number(p[0]), Number(p[1]) - 1); }

  const root = document.createElement('div');
  root.className = 'cal';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'cal-trigger';
  const pop = document.createElement('div');
  pop.className = 'cal-pop hidden';
  root.appendChild(trigger);
  root.appendChild(pop);

  const monthRange = () => {
    const first = new Date(vy, vm, 1);
    const last = new Date(vy, vm + 1, 0);
    return { start: calYmd(first), end: calYmd(last) };
  };

  const label = (day) => {
    const p = String(day).split('-');
    return `${Number(p[2])} ${CAL_MONTHS[Number(p[1]) - 1].slice(0, 3).toLowerCase()} ${p[0]}`;
  };

  const renderTrigger = () => {
    trigger.textContent = '';
    const icon = document.createElement('span');
    icon.className = 'cal-icon';
    icon.textContent = '📅';
    const txt = document.createElement('span');
    txt.textContent = label(val);
    const caret = document.createElement('span');
    caret.className = 'cal-caret';
    caret.textContent = '▾';
    trigger.appendChild(icon);
    trigger.appendChild(txt);
    trigger.appendChild(caret);
  };

  const pick = (day) => {
    val = day;
    renderTrigger();
    render();
    close();
    if (onChange) onChange(day);
  };

  const render = () => {
    pop.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'cal-head';
    const prev = document.createElement('button');
    prev.type = 'button'; prev.className = 'cal-nav'; prev.textContent = '‹';
    prev.addEventListener('click', (e) => { e.stopPropagation(); shift(-1); });
    const title = document.createElement('div');
    title.className = 'cal-title';
    title.textContent = `${CAL_MONTHS[vm]} ${vy}`;
    const next = document.createElement('button');
    next.type = 'button'; next.className = 'cal-nav'; next.textContent = '›';
    next.addEventListener('click', (e) => { e.stopPropagation(); shift(1); });
    head.appendChild(prev); head.appendChild(title); head.appendChild(next);
    pop.appendChild(head);

    const dow = document.createElement('div');
    dow.className = 'cal-dow';
    CAL_DOW.forEach((d) => {
      const s = document.createElement('span');
      s.textContent = d;
      dow.appendChild(s);
    });
    pop.appendChild(dow);

    const grid = document.createElement('div');
    grid.className = 'cal-grid';
    const first = new Date(vy, vm, 1);
    const lead = (first.getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) {
      const b = document.createElement('div');
      b.className = 'cal-cell empty';
      grid.appendChild(b);
    }
    const days = new Date(vy, vm + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const day = `${vy}-${calPad(vm + 1)}-${calPad(d)}`;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cal-cell';
      b.dataset.day = day;
      if (day === todayStr) b.classList.add('is-today');
      if (day === val) b.classList.add('is-sel');
      if (day > todayStr) {
        b.classList.add('is-future');
        b.disabled = true;
      }
      const m = marks[day];
      if (m) {
        const dotClasses = [];
        if (m.entradas > 0) { b.classList.add('has-in'); dotClasses.push('in'); }
        if (m.salidas > 0) { b.classList.add('has-out'); dotClasses.push('out'); }
        if (Array.isArray(m.dots)) dotClasses.push(...m.dots);
        if (dotClasses.length) {
          const dots = document.createElement('span');
          dots.className = 'cal-dots';
          dotClasses.forEach((c) => { const i = document.createElement('i'); i.className = c; dots.appendChild(i); });
          b.appendChild(dots);
        }
        b.title = m.title || `${Number(m.movimientos || 0)} movimiento(s)`;
      }
      const num = document.createElement('span');
      num.className = 'cal-num';
      num.textContent = d;
      b.insertBefore(num, b.firstChild);
      b.addEventListener('click', () => pick(day));
      grid.appendChild(b);
    }
    pop.appendChild(grid);

    const foot = document.createElement('div');
    foot.className = 'cal-foot';
    const hoy = document.createElement('button');
    hoy.type = 'button'; hoy.className = 'btn btn-sm btn-outline'; hoy.textContent = 'Hoy';
    hoy.addEventListener('click', (e) => { e.stopPropagation(); pick(todayStr); });
    foot.appendChild(hoy);
    const legendHtml = opts.legend !== undefined ? opts.legend : '<i class="in"></i> entrada <i class="out"></i> salida';
    if (legendHtml) {
      const legend = document.createElement('span');
      legend.className = 'cal-legend';
      legend.innerHTML = legendHtml;
      foot.appendChild(legend);
    }
    pop.appendChild(foot);
  };

  const shift = (delta) => {
    const d = new Date(vy, vm + delta, 1);
    setView(d.getFullYear(), d.getMonth());
    render();
    if (onMonthChange) onMonthChange(monthRange().start, monthRange().end);
  };

  const close = () => pop.classList.add('hidden');

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = !pop.classList.contains('hidden');
    document.querySelectorAll('.cal-pop').forEach((p) => p.classList.add('hidden'));
    if (wasOpen) return;
    pop.classList.remove('hidden');
    if (onMonthChange) onMonthChange(monthRange().start, monthRange().end);
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.cal')) close(); });

  const refreshMarks = async () => {
    const { start, end } = monthRange();
    let days;
    if (opts.loadMarks) {
      days = await opts.loadMarks(start, end);
    } else {
      const r = await api.stock.movementDays(start, end);
      days = r.days || [];
    }
    marks = {};
    (days || []).forEach((d) => { marks[d.day] = d; });
    render();
  };

  mount.appendChild(root);
  renderTrigger();
  render();

  return {
    getValue: () => val,
    setValue(day) {
      val = day;
      const p = String(day).split('-');
      setView(Number(p[0]), Number(p[1]) - 1);
      renderTrigger();
      render();
    },
    refreshMarks,
  };
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function openModal(html, modalId) {
  let backdrop = document.getElementById(modalId || 'modalBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = modalId || 'modalBackdrop';
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(backdrop); });
    document.body.appendChild(backdrop);
  }
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = html;
  backdrop.innerHTML = '';
  backdrop.appendChild(modal);
  backdrop.classList.add('show');
  return modal;
}

function closeModal(backdrop) {
  backdrop.classList.remove('show');
}

function confirmDialog(message, onOk, danger = true) {
  const modal = openModal(`
    <h3>Confirmar acción</h3>
    <p class="mb">${message}</p>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="cxlBtn">Cancelar</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-success'}" id="okBtn">Aceptar</button>
    </div>`, 'confirmModal');
  modal.querySelector('#cxlBtn').addEventListener('click', () => closeModal(modal.closest('.modal-backdrop')));
  modal.querySelector('#okBtn').addEventListener('click', () => {
    closeModal(modal.closest('.modal-backdrop'));
    onOk();
  });
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function readJsonFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  return data.products ? data.products : Array.isArray(data) ? data : [data];
}
