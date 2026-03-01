// recurrence-modal.js
// Modal for editing transaction recurrence patterns

import { formatDateOnly } from '../../../shared/date-utils.js';
import { createModal } from './modal-factory.js';

/**
 * Open a modal to edit recurrence data
 * @param {Object} currentValue - Current recurrence object
 * @param {Function} onSave - Callback when saved
 */
export function openRecurrenceModal(currentValue, onSave) {
    const { modal, close } = createModal({ contentClass: 'modal-recurrence' });

    // Extract current values or use defaults
    const recurrenceTypeId = currentValue?.recurrenceType || 1;
    const startDate = currentValue?.startDate || formatDateOnly(new Date());
    const endDate = currentValue?.endDate || '';
    const interval = currentValue?.interval || 1;
    const dayOfMonth = currentValue?.dayOfMonth || 1;

    modal.innerHTML = `
        <h2 class="modal-periodic-title">
            Edit Recurrence
        </h2>
        
        <div class="modal-periodic-form-group">
            <label class="modal-periodic-label">Recurrence Type:</label>
            <select id="recurrenceType" class="modal-periodic-select">
                <option value="1" ${recurrenceTypeId === 1 ? 'selected' : ''}>One Time</option>
                <option value="2" ${recurrenceTypeId === 2 ? 'selected' : ''}>Daily</option>
                <option value="3" ${recurrenceTypeId === 3 ? 'selected' : ''}>Weekly</option>
                <option value="4" ${recurrenceTypeId === 4 ? 'selected' : ''}>Monthly - Day of Month</option>
                <option value="5" ${recurrenceTypeId === 5 ? 'selected' : ''}>Monthly - Week of Month</option>
                <option value="6" ${recurrenceTypeId === 6 ? 'selected' : ''}>Quarterly</option>
                <option value="7" ${recurrenceTypeId === 7 ? 'selected' : ''}>Yearly</option>
                <option value="11" ${recurrenceTypeId === 11 ? 'selected' : ''}>Custom Dates</option>
            </select>
        </div>

        <div class="modal-periodic-form-group" id="startDateContainer">
            <label class="modal-periodic-label">Start Date:</label>
            <input type="date" id="startDate" value="${startDate}" class="modal-periodic-input">
        </div>

        <div class="modal-periodic-form-group" id="endDateContainer">
            <label class="modal-periodic-label">End Date (optional):</label>
            <input type="date" id="endDate" value="${endDate}" class="modal-periodic-input">
        </div>

        <div class="modal-periodic-form-group" id="intervalContainer">
            <label class="modal-periodic-label">Interval:</label>
            <input type="number" id="interval" value="${interval}" min="1" class="modal-periodic-input">
            <div class="modal-periodic-hint">Repeat every N periods (e.g., 2 for every 2 months)</div>
        </div>

        <div class="modal-periodic-form-group hidden" id="dayOfMonthContainer">
            <label class="modal-periodic-label">Day of Month:</label>
            <input type="number" id="dayOfMonth" value="${dayOfMonth}" min="1" max="31" class="modal-periodic-input">
            <div class="modal-periodic-hint">Which day of the month (1-31)</div>
        </div>

        <div class="modal-periodic-actions">
            <button id="cancelBtn" class="icon-btn" title="Cancel">
                ✕
            </button>
            <button id="saveBtn" class="icon-btn icon-btn--primary" title="Save">
                ✓
            </button>
        </div>
    `;

    // Show/hide fields based on recurrence type
    const recurrenceTypeSelect = modal.querySelector('#recurrenceType');
    const intervalContainer = modal.querySelector('#intervalContainer');
    const endDateContainer = modal.querySelector('#endDateContainer');
    const dayOfMonthContainer = modal.querySelector('#dayOfMonthContainer');
    
    const setVisible = (el, visible) => {
        el.classList.toggle('hidden', !visible);
    };

    const updateFieldVisibility = () => {
        const selectedType = parseInt(recurrenceTypeSelect.value);
        
        if (selectedType === 1) {
            // One Time - hide all recurring fields
            setVisible(intervalContainer, false);
            setVisible(endDateContainer, false);
            setVisible(dayOfMonthContainer, false);
        } else if (selectedType === 4) {
            // Monthly - Day of Month - show day of month
            setVisible(intervalContainer, true);
            setVisible(endDateContainer, true);
            setVisible(dayOfMonthContainer, true);
        } else {
            // Other recurring types - show interval and end date, hide day of month
            setVisible(intervalContainer, true);
            setVisible(endDateContainer, true);
            setVisible(dayOfMonthContainer, false);
        }
    };
    
    updateFieldVisibility();
    recurrenceTypeSelect.addEventListener('change', updateFieldVisibility);

    // Event handlers
    const cancelBtn = modal.querySelector('#cancelBtn');
    const saveBtn = modal.querySelector('#saveBtn');

    cancelBtn.addEventListener('click', close);

    saveBtn.addEventListener('click', () => {
        const selectedTypeId = parseInt(modal.querySelector('#recurrenceType').value);
        const typeNames = {
            1: 'One Time',
            2: 'Daily',
            3: 'Weekly',
            4: 'Monthly - Day of Month',
            5: 'Monthly - Week of Month',
            6: 'Quarterly',
            7: 'Yearly',
            11: 'Custom Dates'
        };
        
        const recurrence = {
            recurrenceType: {
                id: selectedTypeId,
                name: typeNames[selectedTypeId]
            },
            startDate: modal.querySelector('#startDate').value,
            endDate: modal.querySelector('#endDate').value || null,
            interval: selectedTypeId === 1 ? null : parseInt(modal.querySelector('#interval').value),
            dayOfWeek: null,
            dayOfMonth: selectedTypeId === 4 ? parseInt(modal.querySelector('#dayOfMonth').value) : null,
            weekOfMonth: null,
            dayOfWeekInMonth: null,
            dayOfQuarter: null,
            month: null,
            dayOfYear: null,
            customDates: null,
            id: null
        };

        onSave(recurrence);
        close();
    });
}
