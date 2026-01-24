// modal-text-input.js
// Simple modal to accept a short text input and call onSave with the value
export function openTextInputModal(title, defaultValue = '', placeholder = '', onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const modal = document.createElement('div');
  modal.className = 'modal-content';
  modal.style.cssText = `
    background: #2d2d30;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    padding: 18px;
    min-width: 360px;
    max-width: 560px;
    color: #d4d4d4;
  `;

  modal.innerHTML = `
    <h2 style="margin-top:0;color:#4ec9b0;">${title}</h2>
    <div style="margin:10px 0;">
      <input id="modalTextInput" placeholder="${placeholder}" value="${defaultValue}" style="width:100%; padding:8px; background:#1e1e1e; color:#d4d4d4; border:1px solid #3e3e42; border-radius:3px;">
    </div>
    <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:10px;">
      <button id="modalCancel" style="padding:8px 14px; background:#555; color:#fff; border:none; border-radius:3px; cursor:pointer;">Cancel</button>
      <button id="modalSave" style="padding:8px 14px; background:#4ec9b0; color:#000; border:none; border-radius:3px; cursor:pointer; font-weight:bold;">Save</button>
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
