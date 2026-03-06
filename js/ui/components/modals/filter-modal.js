// filter-modal.js
// Generic filter modal component
// Displays filter controls in a popover-style modal positioned relative to trigger button
// Filters apply immediately as user interacts with controls

/**
 * Create a filter modal instance
 * @param {Object} config - Configuration object
 * @param {string} config.id - Unique ID for the modal
 * @param {string} config.title - Modal title/header text
 * @param {HTMLElement} config.trigger - Button element that opens/closes modal
 * @param {Array} config.items - Array of filter item configs
 *   Each item: { id, label, control (HTMLElement), helpText (optional) }
 * @param {Function} config.onOpen - Optional callback fired when modal opens
 * @param {Function} config.onClose - Optional callback fired when modal closes
 * @returns {Object} Modal instance with control methods
 */
export function createFilterModal({
  id = 'filter-modal',
  title = 'Filters',
  trigger = null,
  items = [],
  onOpen = null,
  onClose = null
} = {}) {
  if (!trigger) {
    throw new Error('filterModal: trigger element is required');
  }

  let isOpen = false;
  let modalEl = null;
  let overlayEl = null;

  /**
   * Create and render the modal DOM structure
   */
  const createModalDOM = () => {
    // Overlay (click-outside to close)
    overlayEl = document.createElement('div');
    overlayEl.className = 'filter-modal-overlay';
    overlayEl.setAttribute('data-modal-id', id);
    overlayEl.addEventListener('click', close);

    // Modal container
    modalEl = document.createElement('div');
    modalEl.className = 'filter-modal';
    modalEl.setAttribute('data-modal-id', id);
    modalEl.id = id;

    // Header
    const headerEl = document.createElement('div');
    headerEl.className = 'filter-modal-header';
    headerEl.textContent = title;
    modalEl.appendChild(headerEl);

    // Content container for filter items
    const contentEl = document.createElement('div');
    contentEl.className = 'filter-modal-content';

    items.forEach((item) => {
      const itemWrapper = document.createElement('div');
      itemWrapper.className = 'modal-filter-item';
      itemWrapper.setAttribute('data-filter-id', item.id);

      // Label
      const labelEl = document.createElement('label');
      labelEl.htmlFor = item.control.id || item.id;
      labelEl.className = 'modal-filter-label';
      labelEl.textContent = item.label;
      itemWrapper.appendChild(labelEl);

      // Control (select, buttons, etc.)
      itemWrapper.appendChild(item.control);

      contentEl.appendChild(itemWrapper);
    });

    modalEl.appendChild(contentEl);

    // Prevent modal clicks from closing modal
    modalEl.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  };

  /**
   * Position modal relative to trigger button
   */
  const positionModal = () => {
    if (!modalEl || !overlayEl) return;

    const triggerRect = trigger.getBoundingClientRect();
    const modal = modalEl;

    // Calculate position: below trigger, aligned to right edge
    const top = triggerRect.bottom + 8; // 8px gap below button
    const left = triggerRect.right - modal.offsetWidth;

    // Clamp to viewport boundaries
    const viewportWidth = window.innerWidth;
    const maxLeft = Math.max(8, Math.min(left, viewportWidth - modal.offsetWidth - 8));

    modal.style.position = 'fixed';
    modal.style.top = `${top}px`;
    modal.style.left = `${maxLeft}px`;
    modal.style.zIndex = '1050';

    overlayEl.style.position = 'fixed';
    overlayEl.style.zIndex = '1049';
  };

  /**
   * Open the modal
   */
  const open = () => {
    if (isOpen) return;

    if (!modalEl) {
      createModalDOM();
    }

    // Add to DOM
    document.body.appendChild(overlayEl);
    document.body.appendChild(modalEl);

    // Position after rendering
    requestAnimationFrame(() => {
      positionModal();
    });

    // Set focus to first control
    const firstControl = items[0]?.control;
    if (firstControl) {
      firstControl.focus();
    }

    isOpen = true;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('filter-modal-open');

    if (onOpen) onOpen();
  };

  /**
   * Close the modal
   */
  const close = () => {
    if (!isOpen) return;

    if (modalEl) {
      modalEl.remove();
      overlayEl.remove();
    }

    isOpen = false;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.classList.remove('filter-modal-open');

    if (onClose) onClose();
  };

  /**
   * Toggle modal open/closed
   */
  const toggle = () => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  };

  /**
   * Destroy modal instance and clean up
   */
  const destroy = () => {
    close();
    trigger.removeEventListener('click', toggle);
    modalEl = null;
    overlayEl = null;
  };

  /**
   * Update filter items
   */
  const setItems = (newItems) => {
    items.splice(0, items.length, ...newItems);
    if (isOpen) {
      close();
      open();
    }
  };

  // Wire up trigger button
  trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  });

  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape' && isOpen) {
      close();
    }
  };
  document.addEventListener('keydown', handleEscape);

  // Reposition on window resize
  const handleResize = () => {
    if (isOpen) {
      positionModal();
    }
  };
  window.addEventListener('resize', handleResize);

  // Return public API
  return {
    open,
    close,
    toggle,
    destroy,
    setItems,
    get isOpen() {
      return isOpen;
    }
  };
}
