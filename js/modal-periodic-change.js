// modal-periodic-change.js
// Modal for editing periodic change (escalation/growth)

/**
 * Open a modal to edit periodic change data
 * @param {Object} currentValue - Current periodic change object
 * @param {Function} onSave - Callback when saved
 */
export function openPeriodicChangeModal(currentValue, onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal-content modal-periodic';

    // Extract current values or use defaults
    const value = currentValue?.value || 0;
    const changeModeId = currentValue?.changeMode?.id || 1;
    const changeTypeId = currentValue?.changeType?.id || 1;

    modal.innerHTML = `
        <h2 class="modal-periodic-title">Edit Periodic Change</h2>
        
        <div class="modal-periodic-form-group">
            <label class="modal-periodic-label">Change Mode:</label>
            <select id="changeMode" class="modal-periodic-select">
                <option value="1" ${changeModeId === 1 ? 'selected' : ''}>Percentage Rate</option>
                <option value="2" ${changeModeId === 2 ? 'selected' : ''}>Fixed Amount</option>
            </select>
        </div>

        <div class="modal-periodic-form-group">
            <label class="modal-periodic-label">Change Type:</label>
            <select id="changeType" class="modal-periodic-select">
                <option value="1" ${changeTypeId === 1 ? 'selected' : ''}>Nominal Annual (No Compounding)</option>
                <option value="2" ${changeTypeId === 2 ? 'selected' : ''}>Nominal Annual, Compounded Monthly</option>
                <option value="3" ${changeTypeId === 3 ? 'selected' : ''}>Nominal Annual, Compounded Quarterly</option>
                <option value="4" ${changeTypeId === 4 ? 'selected' : ''}>Nominal Annual, Compounded Semi-Annually</option>
            </select>
        </div>

        <div class="modal-periodic-form-group">
            <label class="modal-periodic-label">Value:</label>
            <input type="number" id="value" class="modal-periodic-input" value="${value}" step="0.01">
            <div id="valueHint" class="modal-periodic-hint">Enter percentage (e.g., 3 for 3% growth)</div>
        </div>

        <div class="modal-periodic-examples">
            <div class="modal-periodic-examples-title">Examples:</div>
            <ul class="modal-periodic-examples-list">
                <li>3% annual salary increase: Percentage Rate, Nominal Annual, Value = 3</li>
                <li>5% compounded savings growth: Percentage Rate, Compounded Monthly, Value = 5</li>
                <li>\$50/month fixed increase: Fixed Amount, Value = 50</li>
            </ul>
        </div>

        <div class="modal-periodic-actions">
            <button id="clearBtn" class="modal-periodic-button modal-periodic-clear">
                Clear
            </button>
            <button id="cancelBtn" class="modal-periodic-button modal-periodic-cancel">
                Cancel
            </button>
            <button id="saveBtn" class="modal-periodic-button modal-periodic-save">
                Save
            </button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Update hint text based on change mode
    const changeModeSelect = modal.querySelector('#changeMode');
    const valueHint = modal.querySelector('#valueHint');
    
    changeModeSelect.addEventListener('change', () => {
        if (changeModeSelect.value === '1') {
            valueHint.textContent = 'Enter percentage (e.g., 3 for 3% growth)';
        } else {
            valueHint.textContent = 'Enter dollar amount per period';
        }
    });

    // Event handlers
    const cancelBtn = modal.querySelector('#cancelBtn');
    const saveBtn = modal.querySelector('#saveBtn');
    const clearBtn = modal.querySelector('#clearBtn');

    const close = () => {
        overlay.remove();
    };

    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    clearBtn.addEventListener('click', () => {
        onSave(null);
        close();
    });

    saveBtn.addEventListener('click', () => {
        const changeModeId = parseInt(modal.querySelector('#changeMode').value);
        const changeTypeId = parseInt(modal.querySelector('#changeType').value);

        const periodicChange = {
            value: parseFloat(modal.querySelector('#value').value),
            changeMode: changeModeId,
            changeType: changeTypeId
        };

        onSave(periodicChange);
        close();
    });
}
