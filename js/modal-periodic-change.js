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
    const value = currentValue?.value || 0;
    const changeModeId = currentValue?.changeMode?.id || 1;
    const changeTypeId = currentValue?.changeType?.id || 1;

    modal.innerHTML = `
        <h2 style="margin-top: 0; color: #4ec9b0; border-bottom: 2px solid #4ec9b0; padding-bottom: 10px;">
            Edit Periodic Change
        </h2>
        
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Change Mode:</label>
            <select id="changeMode" style="width: 100%; padding: 8px; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3e3e42; border-radius: 3px;">
                <option value="1" ${changeModeId === 1 ? 'selected' : ''}>Percentage Rate</option>
                <option value="2" ${changeModeId === 2 ? 'selected' : ''}>Fixed Amount</option>
            </select>
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Change Type:</label>
            <select id="changeType" style="width: 100%; padding: 8px; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3e3e42; border-radius: 3px;">
                <option value="1" ${changeTypeId === 1 ? 'selected' : ''}>Nominal Annual (No Compounding)</option>
                <option value="2" ${changeTypeId === 2 ? 'selected' : ''}>Nominal Annual, Compounded Monthly</option>
                <option value="3" ${changeTypeId === 3 ? 'selected' : ''}>Nominal Annual, Compounded Quarterly</option>
                <option value="4" ${changeTypeId === 4 ? 'selected' : ''}>Nominal Annual, Compounded Semi-Annually</option>
            </select>
        </div>

        <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Value:</label>
            <input type="number" id="value" value="${value}" step="0.01" 
                style="width: 100%; padding: 8px; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3e3e42; border-radius: 3px;">
            <small id="valueHint" style="color: #999;">Enter percentage (e.g., 3 for 3% growth)</small>
        </div>

        <div style="background: #1e1e1e; border: 1px solid #3e3e42; border-radius: 3px; padding: 10px; margin-bottom: 20px;">
            <strong style="color: #4ec9b0;">Examples:</strong>
            <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.9em;">
                <li>3% annual salary increase: Percentage Rate, Nominal Annual, Value = 3</li>
                <li>5% compounded savings growth: Percentage Rate, Compounded Monthly, Value = 5</li>
                <li>$50/month fixed increase: Fixed Amount, Value = 50</li>
            </ul>
        </div>

        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="clearBtn" style="padding: 8px 16px; background: #d73027; color: #fff; border: none; border-radius: 3px; cursor: pointer;">
                Clear
            </button>
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
        
        const changeModeName = changeModeId === 1 ? 'Percentage Rate' : 'Fixed Amount';
        const changeTypeNames = {
            1: 'Nominal Annual (No Compounding)',
            2: 'Nominal Annual, Compounded Monthly',
            3: 'Nominal Annual, Compounded Quarterly',
            4: 'Nominal Annual, Compounded Semi-Annually'
        };

        const periodicChange = {
            value: parseFloat(modal.querySelector('#value').value),
            changeMode: { id: changeModeId, name: changeModeName },
            changeType: { id: changeTypeId, name: changeTypeNames[changeTypeId] }
        };

        onSave(periodicChange);
        close();
    });
}
