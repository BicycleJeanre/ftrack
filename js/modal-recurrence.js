// modal-recurrence.js
// Modal for editing transaction recurrence patterns

import { formatDateOnly } from './date-utils.js';

/**
 * Open a modal to edit recurrence data
 * @param {Object} currentValue - Current recurrence object
 * @param {Function} onSave - Callback when saved
 */
export function openRecurrenceModal(currentValue, onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `;

    const modal = document.createElement('div');
    modal.className = 'modal-content';
    modal.style.cssText = `
        background: #2d2d30;
        border: 1px solid #3e3e42;
        border-radius: 4px;
        padding: 20px;
        min-width: 500px;
        max-width: 600px;
        color: #d4d4d4;
    `;

    // Extract current values or use defaults
    const recurrenceTypeId = currentValue?.recurrenceType?.id || 1;
    const startDate = currentValue?.startDate || formatDateOnly(new Date());
    const endDate = currentValue?.endDate || '';
    const interval = currentValue?.interval || 1;
    const dayOfMonth = currentValue?.dayOfMonth || 1;

    modal.innerHTML = `
        <h2 style="margin-top: 0; color: #4ec9b0; border-bottom: 2px solid #4ec9b0; padding-bottom: 10px;">
            Edit Recurrence
        </h2>
        
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Recurrence Type:</label>
            <select id="recurrenceType" style="width: 100%; padding: 8px; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3e3e42; border-radius: 3px;">
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

        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Start Date:</label>
            <input type="date" id="startDate" value="${startDate}" 
                style="width: 100%; padding: 8px; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3e3e42; border-radius: 3px;">
        </div>

        <div style="margin-bottom: 15px;" id="endDateContainer">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">End Date (optional):</label>
            <input type="date" id="endDate" value="${endDate}" 
                style="width: 100%; padding: 8px; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3e3e42; border-radius: 3px;">
        </div>

        <div style="margin-bottom: 15px;" id="intervalContainer">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Interval:</label>
            <input type="number" id="interval" value="${interval}" min="1" 
                style="width: 100%; padding: 8px; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3e3e42; border-radius: 3px;">
            <small style="color: #999;">Repeat every N periods (e.g., 2 for every 2 months)</small>
        </div>

        <div style="margin-bottom: 20px; display: none;" id="dayOfMonthContainer">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Day of Month:</label>
            <input type="number" id="dayOfMonth" value="${dayOfMonth}" min="1" max="31" 
                style="width: 100%; padding: 8px; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3e3e42; border-radius: 3px;">
            <small style="color: #999;">Which day of the month (1-31)</small>
        </div>

        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="cancelBtn" style="padding: 8px 16px; background: #555; color: #fff; border: none; border-radius: 3px; cursor: pointer;">
                Cancel
            </button>
            <button id="saveBtn" style="padding: 8px 16px; background: #4ec9b0; color: #000; border: none; border-radius: 3px; cursor: pointer; font-weight: bold;">
                Save
            </button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Show/hide fields based on recurrence type
    const recurrenceTypeSelect = modal.querySelector('#recurrenceType');
    const intervalContainer = modal.querySelector('#intervalContainer');
    const endDateContainer = modal.querySelector('#endDateContainer');
    const dayOfMonthContainer = modal.querySelector('#dayOfMonthContainer');
    
    const updateFieldVisibility = () => {
        const selectedType = parseInt(recurrenceTypeSelect.value);
        
        if (selectedType === 1) {
            // One Time - hide all recurring fields
            intervalContainer.style.display = 'none';
            endDateContainer.style.display = 'none';
            dayOfMonthContainer.style.display = 'none';
        } else if (selectedType === 4) {
            // Monthly - Day of Month - show day of month
            intervalContainer.style.display = 'block';
            endDateContainer.style.display = 'block';
            dayOfMonthContainer.style.display = 'block';
        } else {
            // Other recurring types - show interval and end date, hide day of month
            intervalContainer.style.display = 'block';
            endDateContainer.style.display = 'block';
            dayOfMonthContainer.style.display = 'none';
        }
    };
    
    updateFieldVisibility();
    recurrenceTypeSelect.addEventListener('change', updateFieldVisibility);

    // Event handlers
    const cancelBtn = modal.querySelector('#cancelBtn');
    const saveBtn = modal.querySelector('#saveBtn');

    const close = () => {
        overlay.remove();
    };

    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

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
