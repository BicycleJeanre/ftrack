const dismissalCleanupByRoot = new WeakMap();

const FLOATING_UI_SELECTOR = [
  '.modal-overlay',
  '.modal-content',
  '.selection-dialog-overlay',
  '.notification-container',
  '.notify-toast',
  '.app-tooltip'
].join(', ');

export function cleanupItemDetailDismissal(root) {
  const cleanup = root ? dismissalCleanupByRoot.get(root) : null;
  cleanup?.();
}

export function installItemDetailDismissal({
  root,
  detailsSelector,
  ownerSelector,
  isOpen = () => true,
  onDismiss
}) {
  if (!root || !detailsSelector || typeof onDismiss !== 'function') return;
  cleanupItemDetailDismissal(root);

  const handlePointerDown = (event) => {
    if (!root.isConnected) {
      cleanupItemDetailDismissal(root);
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) return;
    // Account, recurrence, confirmation, and other floating dialogs belong to
    // the open editor even though they are mounted outside the item card.
    if (target.closest(FLOATING_UI_SELECTOR)) return;

    root.querySelectorAll(detailsSelector).forEach((details) => {
      if (!isOpen(details)) return;
      const owner = ownerSelector ? details.closest(ownerSelector) : null;
      if (details.contains(target) || owner?.contains(target)) return;
      onDismiss(details, owner, event);
    });
  };

  document.addEventListener('pointerdown', handlePointerDown, true);
  const cleanup = () => {
    document.removeEventListener('pointerdown', handlePointerDown, true);
    if (dismissalCleanupByRoot.get(root) === cleanup) {
      dismissalCleanupByRoot.delete(root);
    }
  };
  dismissalCleanupByRoot.set(root, cleanup);
  return cleanup;
}
