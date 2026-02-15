// modal-factory.js
// Shared modal creator to standardize overlay, escape handling, and teardown

export function createModal(options = {}) {
  const {
    contentClass = '',
    closeOnOverlay = true,
    closeOnEscape = true,
    onClose = null
  } = options;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = ['modal-content', contentClass].filter(Boolean).join(' ');
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
    }
  };

  function cleanup() {
    if (closeOnEscape) {
      document.removeEventListener('keydown', handleKeyDown);
    }
    overlay.remove();
    if (typeof onClose === 'function') {
      onClose();
    }
  }

  if (closeOnOverlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
      }
    });
  }

  if (closeOnEscape) {
    document.addEventListener('keydown', handleKeyDown);
  }

  return { overlay, modal, close: cleanup };
}
