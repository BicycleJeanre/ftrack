// modal-text-input.js
// Simple modal to accept a short text input and call onSave with the value
import { createModal } from './modal-factory.js';

export function openTextInputModal(title, defaultValue = '', placeholder = '', onSave) {
  const { modal, close } = createModal({ contentClass: 'modal-text-input' });

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

  const input = modal.querySelector('#modalTextInput');
  const cancelBtn = modal.querySelector('#modalCancel');
  const saveBtn = modal.querySelector('#modalSave');

  cancelBtn.addEventListener('click', () => close());

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
