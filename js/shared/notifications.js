// notifications.js
// Toast notifications and async confirm dialog.
// Replaces native alert()/confirm() which are blocked in sandboxed iframes (e.g. VS Code Live Preview).

import { createModal } from '../ui/components/modals/modal-factory.js';

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `notify-toast notify-toast-${type}`;
  toast.textContent = String(message ?? '');
  document.body.appendChild(toast);

  // Trigger enter animation
  requestAnimationFrame(() => toast.classList.add('notify-toast-visible'));

  const dismiss = () => {
    toast.classList.remove('notify-toast-visible');
    toast.classList.add('notify-toast-hiding');
    setTimeout(() => toast.remove(), 300);
  };

  toast.addEventListener('click', dismiss);
  setTimeout(dismiss, 4000);
}

export function notifySuccess(message) {
  showToast(message, 'success');
}

export function notifyError(message) {
  showToast(message, 'error');
}

/**
 * Async replacement for native confirm().
 * Returns a Promise<boolean> — true if confirmed, false if cancelled.
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export function confirmDialog(message) {
  return new Promise((resolve) => {
    const { modal, close } = createModal({
      contentClass: 'confirm-dialog',
      closeOnOverlay: false,
      closeOnEscape: true,
      onClose: () => resolve(false)
    });

    const msgEl = document.createElement('p');
    msgEl.className = 'confirm-dialog-message';
    msgEl.textContent = String(message ?? 'Are you sure?');

    const btnRow = document.createElement('div');
    btnRow.className = 'confirm-dialog-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn';
    cancelBtn.textContent = 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-danger';
    confirmBtn.textContent = 'Confirm';

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    modal.appendChild(msgEl);
    modal.appendChild(btnRow);

    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      close();
    };

    confirmBtn.addEventListener('click', () => settle(true));
    cancelBtn.addEventListener('click', () => settle(false));

    requestAnimationFrame(() => confirmBtn.focus());
  });
}
