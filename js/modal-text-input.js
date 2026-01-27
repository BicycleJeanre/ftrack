// modal-text-input.js
// Simple modal to accept a short text input and call onSave with the value
export function openTextInputModal(title, defaultValue = '', placeholder = '', onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal-content modal-text-input';

  modal.innerHTML = `
    <h2 class="modal-text-input-title">${title}</h2>
    <div class="modal-text-input-body">
      <input id="modalTextInput" class="modal-text-input-input" placeholder="${placeholder}" value="${defaultValue}">
    </div>
    <div class="modal-text-input-actions">
      <button id="modalCancel" class="modal-text-input-button modal-text-input-cancel">Cancel</button>
      <button id="modalSave" class="modal-text-input-button modal-text-input-save">Save</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const input = modal.querySelector('#modalTextInput');
  const cancelBtn = modal.querySelector('#modalCancel');
  const saveBtn = modal.querySelector('#modalSave');

  const close = () => { overlay.remove(); };

  cancelBtn.addEventListener('click', () => close());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  saveBtn.addEventListener('click', () => {
    const value = (input.value || '').trim();
    if (!value) return; // ignore empty
    onSave(value);
    close();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { saveBtn.click(); }
    else if (e.key === 'Escape') { cancelBtn.click(); }
  });

  // focus
  setTimeout(() => { input.focus(); input.select(); }, 10);

  return {
    close
  };
}
