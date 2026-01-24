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
    const pattern = currentValue?.pattern || 'Monthly';
    const startDate = currentValue?.startDate || formatDateOnly(new Date());
    const endDate = currentValue?.endDate || '';
    const frequency = currentValue?.frequency || 1;
    const interval = currentValue?.interval || 1;

    modal.innerHTML = `
        <h2 style="margin-top: 0; color: #4ec9b0; border-bottom: 2px solid #4ec9b0; padding-bottom: 10px;">
            Edit Recurrence
        </h2>
        
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Pattern:</label>
            <select id="pattern" style="width: 100%; padding: 8px; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3e3e42; border-radius: 3px;">
                <option value="Daily" ${pattern === 'Daily' ? 'selected' : ''}>Daily</option>
                <option value="Weekly" ${pattern === 'Weekly' ? 'selected' : ''}>Weekly</option>
                <option value="Monthly" ${pattern === 'Monthly' ? 'selected' : ''}>Monthly</option>
                <option value="Yearly" ${pattern === 'Yearly' ? 'selected' : ''}>Yearly</option>
            </select>
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Start Date:</label>
            <input type="date" id="startDate" value="${startDate}" 
                style="width: 100%; padding: 8px; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3e3e42; border-radius: 3px;">
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">End Date (optional):</label>
            <input type="date" id="endDate" value="${endDate}" 
                style="width: 100%; padding: 8px; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3e3e42; border-radius: 3px;">
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Frequency:</label>
            <input type="number" id="frequency" value="${frequency}" min="1" 
                style="width: 100%; padding: 8px; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3e3e42; border-radius: 3px;">
            <small style="color: #999;">How many times per interval (e.g., 2 for bi-weekly)</small>
        </div>

        <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Interval:</label>
            <input type="number" id="interval" value="${interval}" min="1" 
                style="width: 100%; padding: 8px; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3e3e42; border-radius: 3px;">
            <small style="color: #999;">Every N periods (e.g., 2 for every 2 months)</small>
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
        const recurrence = {
            pattern: modal.querySelector('#pattern').value,
            startDate: modal.querySelector('#startDate').value,
            endDate: modal.querySelector('#endDate').value || null,
            frequency: parseInt(modal.querySelector('#frequency').value),
            interval: parseInt(modal.querySelector('#interval').value),
            recurrenceType: { 
                id: modal.querySelector('#pattern').value === 'Monthly' ? 3 : 1,
                name: modal.querySelector('#pattern').value 
            }
        };

        onSave(recurrence);
        close();
    });
}
