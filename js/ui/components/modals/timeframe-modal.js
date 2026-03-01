// timeframe-modal.js
// Modal for setting projection or budget generation timeframes (start date, end date, period type)

import { formatDateOnly, parseDateOnly } from '../../../shared/date-utils.js';
import { createModal } from './modal-factory.js';
import { notifyError } from '../../../shared/notifications.js';

/**
 * Calculate default dates: next 12 months from today
 * @returns {Object} {startDate, endDate}
 */
function getDefaultDates() {
  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endDate = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate() - 1); // 12 months - 1 day
  
  return {
    startDate: formatDateOnly(startDate),
    endDate: formatDateOnly(endDate)
  };
}

/**
 * Open a modal to set timeframe for projection or budget generation
 * @param {Object} options - Configuration
 * @param {string} options.title - Modal title (e.g., "Generate Projections")
 * @param {boolean} options.showPeriodType - Whether to show period type selector (true for projections, false for budget)
 * @param {number} options.defaultPeriodTypeId - Default period type (1-5)
 * @param {Function} options.onConfirm - Callback with {startDate, endDate, periodTypeId}
 */
export function openTimeframeModal({
  title = 'Set Timeframe',
  showPeriodType = false,
  defaultPeriodTypeId = 3, // Month
  onConfirm
} = {}) {
  const { modal, close } = createModal({ contentClass: 'modal-timeframe' });

  const defaults = getDefaultDates();
  const startDate = defaults.startDate;
  const endDate = defaults.endDate;

  modal.innerHTML = `
    <h2 class="modal-periodic-title">${escapeHtml(title)}</h2>
    
    <div class="modal-periodic-form-group">
      <label class="modal-periodic-label">Start Date:</label>
      <input type="date" id="timeframe-start-date" value="${startDate}" class="modal-periodic-input">
    </div>

    <div class="modal-periodic-form-group">
      <label class="modal-periodic-label">End Date:</label>
      <input type="date" id="timeframe-end-date" value="${endDate}" class="modal-periodic-input">
    </div>

    ${showPeriodType ? `
      <div class="modal-periodic-form-group">
        <label class="modal-periodic-label">Period Type:</label>
        <select id="timeframe-period-type" class="modal-periodic-select">
          <option value="1" ${defaultPeriodTypeId === 1 ? 'selected' : ''}>Day</option>
          <option value="2" ${defaultPeriodTypeId === 2 ? 'selected' : ''}>Week</option>
          <option value="3" ${defaultPeriodTypeId === 3 ? 'selected' : ''}>Month</option>
          <option value="4" ${defaultPeriodTypeId === 4 ? 'selected' : ''}>Quarter</option>
          <option value="5" ${defaultPeriodTypeId === 5 ? 'selected' : ''}>Year</option>
        </select>
      </div>
    ` : ''}

    <div class="modal-periodic-actions">
      <button id="timeframe-cancel-btn" class="icon-btn" title="Cancel">
        ✕
      </button>
      <button id="timeframe-confirm-btn" class="icon-btn icon-btn--primary" title="Generate">
        ✓
      </button>
    </div>
  `;

  const startDateInput = modal.querySelector('#timeframe-start-date');
  const endDateInput = modal.querySelector('#timeframe-end-date');
  const periodTypeSelect = modal.querySelector('#timeframe-period-type');

  modal.querySelector('#timeframe-confirm-btn').addEventListener('click', () => {
    const start = startDateInput.value;
    const end = endDateInput.value;

    if (!start || !end) {
      notifyError('Please enter both start and end dates.');
      return;
    }

    const startParsed = parseDateOnly(start);
    const endParsed = parseDateOnly(end);

    if (startParsed > endParsed) {
      notifyError('Start date must be before end date.');
      return;
    }

    const result = {
      startDate: start,
      endDate: end
    };

    if (showPeriodType) {
      result.periodTypeId = Number(periodTypeSelect.value);
    }

    if (typeof onConfirm === 'function') {
      onConfirm(result);
    }

    close();
  });

  modal.querySelector('#timeframe-cancel-btn').addEventListener('click', () => {
    close();
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
