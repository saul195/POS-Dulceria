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
