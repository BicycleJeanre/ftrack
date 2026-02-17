// modal-periodic-change.js
// Modal for editing periodic change (escalation/growth)

import { createModal } from './modal-factory.js';
import { loadLookup } from '../../../app/services/lookup-service.js';

/**
 * Open a modal to edit periodic change data
 * @param {Object} currentValue - Current periodic change object
 * @param {Function} onSave - Callback when saved
 */
export async function openPeriodicChangeModal(currentValue, onSave) {
    // Load lookup data for frequencies and compounding options
    const lookupData = await loadLookup('lookup-data.json');
    
    const { modal, close } = createModal({ contentClass: 'modal-periodic' });

    // Extract current values or use defaults
    const value = currentValue?.value || 0;
    const changeModeId = currentValue?.changeMode || 1;
    const changeTypeId = currentValue?.changeType || 1;
    const frequencyId = currentValue?.frequency || 3; // Default to Monthly
    const dayOfMonth = currentValue?.dayOfMonth || null;
    const dayOfWeek = currentValue?.dayOfWeek || null;
    const weekOfMonth = currentValue?.weekOfMonth || null;
    const customCompoundingFrequency = currentValue?.customCompounding?.frequency || 12; // Default to 12 times
    const customCompoundingPeriod = currentValue?.customCompounding?.period || 1; // Default to per year
    const nominalPeriodId = currentValue?.ratePeriod || 1; // Default to Annual
    const nominalCompoundingPeriodId = currentValue?.frequency || 3; // Default to Monthly

    modal.innerHTML = `
        <h2 class="modal-periodic-title">Edit Periodic Change</h2>
        
        <div class="modal-periodic-form-group">
            <label class="modal-periodic-label">Change Mode:</label>
            <select id="changeMode" class="modal-periodic-select">
                <option value="1" ${changeModeId === 1 ? 'selected' : ''}>Percentage Rate</option>
                <option value="2" ${changeModeId === 2 ? 'selected' : ''}>Fixed Amount</option>
            </select>
        </div>

        <div class="modal-periodic-form-group" id="changeTypeGroup">
            <label class="modal-periodic-label">Change Type:</label>
            <select id="changeType" class="modal-periodic-select">
                ${lookupData.periodicChangeTypes.map(type => 
                    `<option value="${type.id}" ${changeTypeId === type.id ? 'selected' : ''}>${type.name}</option>`
                ).join('')}
            </select>
        </div>

        <div class="modal-periodic-form-group" id="frequencyGroup" style="display: none;">
            <label class="modal-periodic-label">Application Frequency:</label>
            <select id="frequency" class="modal-periodic-select">
                ${lookupData.frequencies.map(freq => 
                    `<option value="${freq.id}" ${frequencyId === freq.id ? 'selected' : ''}>${freq.name}</option>`
                ).join('')}
            </select>
            <div class="modal-periodic-hint">How often is the fixed amount applied?</div>
        </div>

        <div class="modal-periodic-form-group" id="dayOfMonthGroup" style="display: none;">
            <label class="modal-periodic-label">Day of Month:</label>
            <input type="number" id="dayOfMonth" class="modal-periodic-input" value="${dayOfMonth || ''}" min="1" max="31" placeholder="e.g., 15">
            <div class="modal-periodic-hint">Which day? (1-31, leave empty for any day)</div>
        </div>

        <div class="modal-periodic-form-group" id="dayOfWeekGroup" style="display: none;">
            <label class="modal-periodic-label">Day of Week:</label>
            <select id="dayOfWeek" class="modal-periodic-select">
                <option value="">Any day</option>
                <option value="1" ${dayOfWeek === 1 ? 'selected' : ''}>Monday</option>
                <option value="2" ${dayOfWeek === 2 ? 'selected' : ''}>Tuesday</option>
                <option value="3" ${dayOfWeek === 3 ? 'selected' : ''}>Wednesday</option>
                <option value="4" ${dayOfWeek === 4 ? 'selected' : ''}>Thursday</option>
                <option value="5" ${dayOfWeek === 5 ? 'selected' : ''}>Friday</option>
                <option value="6" ${dayOfWeek === 6 ? 'selected' : ''}>Saturday</option>
                <option value="7" ${dayOfWeek === 7 ? 'selected' : ''}>Sunday</option>
            </select>
        </div>

        <div class="modal-periodic-form-group" id="weekOfMonthGroup" style="display: none;">
            <label class="modal-periodic-label">Week of Month:</label>
            <select id="weekOfMonth" class="modal-periodic-select">
                <option value="">Any week</option>
                <option value="1" ${weekOfMonth === 1 ? 'selected' : ''}>1st week</option>
                <option value="2" ${weekOfMonth === 2 ? 'selected' : ''}>2nd week</option>
                <option value="3" ${weekOfMonth === 3 ? 'selected' : ''}>3rd week</option>
                <option value="4" ${weekOfMonth === 4 ? 'selected' : ''}>4th week</option>
                <option value="-1" ${weekOfMonth === -1 ? 'selected' : ''}>Last week</option>
            </select>
        </div>

        <div class="modal-periodic-form-group" id="customCompoundingGroup" style="display: none;">
            <label class="modal-periodic-label">Compounding Frequency:</label>
            <input type="number" id="customCompounding" class="modal-periodic-input" value="${customCompoundingFrequency}" min="1" step="1">
            <div class="modal-periodic-hint">How many times to compound</div>
        </div>

        <div class="modal-periodic-form-group" id="customCompoundingPeriodGroup" style="display: none;">
            <label class="modal-periodic-label">Compounding Period:</label>
            <select id="customCompoundingPeriod" class="modal-periodic-select">
                ${lookupData.ratePeriods.map(period => 
                    `<option value="${period.id}" ${customCompoundingPeriod === period.id ? 'selected' : ''}>${period.name}</option>`
                ).join('')}
            </select>
            <div class="modal-periodic-hint">Per what time period?</div>
        </div>

        <div class="modal-periodic-form-group" id="nominalPeriodGroup" style="display: none;">
            <label class="modal-periodic-label">Nominal Period:</label>
            <select id="nominalPeriod" class="modal-periodic-select">
                ${lookupData.ratePeriods.map(period =>
                    `<option value="${period.id}" ${nominalPeriodId === period.id ? 'selected' : ''}>${period.name}</option>`
                ).join('')}
            </select>
            <div class="modal-periodic-hint">What time period does the entered rate apply to?</div>
        </div>

        <div class="modal-periodic-form-group" id="nominalCompoundingPeriodGroup" style="display: none;">
            <label class="modal-periodic-label">Compounding Period:</label>
            <select id="nominalCompoundingPeriod" class="modal-periodic-select">
                ${lookupData.frequencies.map(freq =>
                    `<option value="${freq.id}" ${nominalCompoundingPeriodId === freq.id ? 'selected' : ''}>${freq.name}</option>`
                ).join('')}
            </select>
            <div class="modal-periodic-hint">How often should the nominal rate compound?</div>
        </div>

        <div class="modal-periodic-form-group">
            <label class="modal-periodic-label">Value:</label>
            <input type="number" id="value" class="modal-periodic-input" value="${value}" step="0.01">
            <div id="valueHint" class="modal-periodic-hint">Enter percentage (e.g., 3 for 3% growth)</div>
        </div>

        <div class="modal-periodic-examples">
            <div class="modal-periodic-examples-title">Examples:</div>
            <ul class="modal-periodic-examples-list" id="examplesList">
                <li>3% annual salary increase: Percentage Rate, Nominal Annual, Value = 3</li>
                <li>5% compounded savings growth: Percentage Rate, Compounded Monthly, Value = 5</li>
                <li>\$50/month fixed increase: Fixed Amount, Monthly, Value = 50</li>
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

    // Get DOM elements
    const changeModeSelect = modal.querySelector('#changeMode');
    const changeTypeSelect = modal.querySelector('#changeType');
    const valueHint = modal.querySelector('#valueHint');
    const changeTypeGroup = modal.querySelector('#changeTypeGroup');
    const frequencyGroup = modal.querySelector('#frequencyGroup');
    const dayOfMonthGroup = modal.querySelector('#dayOfMonthGroup');
    const dayOfWeekGroup = modal.querySelector('#dayOfWeekGroup');
    const weekOfMonthGroup = modal.querySelector('#weekOfMonthGroup');
    const customCompoundingGroup = modal.querySelector('#customCompoundingGroup');
    const customCompoundingPeriodGroup = modal.querySelector('#customCompoundingPeriodGroup');
    const nominalPeriodGroup = modal.querySelector('#nominalPeriodGroup');
    const nominalCompoundingPeriodGroup = modal.querySelector('#nominalCompoundingPeriodGroup');
    const examplesList = modal.querySelector('#examplesList');
    const frequencySelect = modal.querySelector('#frequency');
    
    // Update UI based on current selections
    function updateUI() {
        const modeId = parseInt(changeModeSelect.value);
        const typeId = parseInt(changeTypeSelect.value);
        const freqId = frequencySelect ? parseInt(frequencySelect.value) : 3;
        
        if (modeId === 2) {
            // Fixed Amount mode
            valueHint.textContent = 'Enter dollar amount';
            changeTypeGroup.style.display = 'none';
            frequencyGroup.style.display = 'block';
            customCompoundingGroup.style.display = 'none';
            customCompoundingPeriodGroup.style.display = 'none';
            
            // Show/hide scheduling fields based on frequency
            if (freqId === 3) { // Monthly
                dayOfMonthGroup.style.display = 'block';
                dayOfWeekGroup.style.display = 'none';
                weekOfMonthGroup.style.display = 'none';
                examplesList.innerHTML = `
                    <li>\$100 on 15th of every month: Monthly, Day of Month = 15</li>
                    <li>\$500 monthly (any day): Monthly, Day of Month = (empty)</li>
                `;
            } else if (freqId === 2) { // Weekly
                dayOfMonthGroup.style.display = 'none';
                dayOfWeekGroup.style.display = 'block';
                weekOfMonthGroup.style.display = 'none';
                examplesList.innerHTML = `
                    <li>\$50 every Monday: Weekly, Day of Week = Monday</li>
                    <li>\$75 weekly (any day): Weekly, Day of Week = Any day</li>
                `;
            } else {
                // Daily, Quarterly, Yearly
                dayOfMonthGroup.style.display = 'none';
                dayOfWeekGroup.style.display = 'none';
                weekOfMonthGroup.style.display = 'none';
                examplesList.innerHTML = `
                    <li>\$10 daily: Daily, Value = 10</li>
                    <li>\$500 quarterly: Quarterly, Value = 500</li>
                    <li>\$1000 yearly: Yearly, Value = 1000</li>
                `;
            }
        } else {
            // Percentage Rate mode
            valueHint.textContent = 'Enter percentage (e.g., 3 for 3% growth)';
            changeTypeGroup.style.display = 'block';
            frequencyGroup.style.display = 'none';
            dayOfMonthGroup.style.display = 'none';
            dayOfWeekGroup.style.display = 'none';
            weekOfMonthGroup.style.display = 'none';
            nominalPeriodGroup.style.display = 'none';
            nominalCompoundingPeriodGroup.style.display = 'none';
            
            if (typeId === 7) {
                // Custom change type selected
                customCompoundingGroup.style.display = 'block';
                customCompoundingPeriodGroup.style.display = 'block';
                examplesList.innerHTML = `
                    <li>3% compounded 12 times per year: Custom, Frequency = 12, Period = Annual</li>
                    <li>5% compounded 30 times per month: Custom, Frequency = 30, Period = Monthly</li>
                    <li>2% compounded 4 times per quarter: Custom, Frequency = 4, Period = Quarterly</li>
                `;
            } else if (typeId === 8) {
                // Custom nominal + compounding selection
                customCompoundingGroup.style.display = 'none';
                customCompoundingPeriodGroup.style.display = 'none';
                nominalPeriodGroup.style.display = 'block';
                nominalCompoundingPeriodGroup.style.display = 'block';
                examplesList.innerHTML = `
                    <li>1% per month, compounded monthly: Nominal Period = Monthly, Compounding Period = Monthly</li>
                    <li>0.25% per week, compounded weekly: Nominal Period = Weekly, Compounding Period = Weekly</li>
                    <li>3% per quarter, compounded monthly: Nominal Period = Quarterly, Compounding Period = Monthly</li>
                `;
            } else {
                customCompoundingGroup.style.display = 'none';
                customCompoundingPeriodGroup.style.display = 'none';
                examplesList.innerHTML = `
                    <li>3% annual salary increase: Percentage Rate, Nominal Annual, Value = 3</li>
                    <li>5% compounded savings: Percentage Rate, Compounded Monthly, Value = 5</li>
                    <li>2% simple interest: Percentage Rate, No Compounding, Value = 2</li>
                `;
            }
        }
    }
    
    // Initialize UI
    updateUI();
    
    // Update on change
    changeModeSelect.addEventListener('change', updateUI);
    changeTypeSelect.addEventListener('change', updateUI);
    if (frequencySelect) {
        frequencySelect.addEventListener('change', updateUI);
    }

    // Event handlers
    const cancelBtn = modal.querySelector('#cancelBtn');
    const saveBtn = modal.querySelector('#saveBtn');
    const clearBtn = modal.querySelector('#clearBtn');

    cancelBtn.addEventListener('click', close);

    clearBtn.addEventListener('click', () => {
        onSave(null);
        close();
    });

    saveBtn.addEventListener('click', () => {
        const changeModeId = parseInt(modal.querySelector('#changeMode').value);
        const changeTypeId = parseInt(modal.querySelector('#changeType').value);
        const valueInput = parseFloat(modal.querySelector('#value').value);

        const periodicChange = {
            value: valueInput,
            changeMode: changeModeId,
            changeType: changeTypeId
        };
        
        // Add frequency for Fixed Amount mode
        if (changeModeId === 2) {
            periodicChange.frequency = parseInt(modal.querySelector('#frequency').value);
            
            // Add day/week specifications if provided
            const dayOfMonthInput = modal.querySelector('#dayOfMonth').value;
            const dayOfWeekSelect = modal.querySelector('#dayOfWeek').value;
            const weekOfMonthSelect = modal.querySelector('#weekOfMonth').value;
            
            if (dayOfMonthInput) {
                periodicChange.dayOfMonth = parseInt(dayOfMonthInput);
            }
            if (dayOfWeekSelect) {
                periodicChange.dayOfWeek = parseInt(dayOfWeekSelect);
            }
            if (weekOfMonthSelect) {
                periodicChange.weekOfMonth = parseInt(weekOfMonthSelect);
            }
        }
        
        // Add custom compounding frequency for Custom change type
        if (changeModeId === 1 && changeTypeId === 7) {
            periodicChange.customCompounding = {
                frequency: parseInt(modal.querySelector('#customCompounding').value),
                period: parseInt(modal.querySelector('#customCompoundingPeriod').value)
            };
        }

        // Add nominal + compounding selection for Custom nominal/compounding type
        if (changeModeId === 1 && changeTypeId === 8) {
            periodicChange.ratePeriod = parseInt(modal.querySelector('#nominalPeriod').value);
            periodicChange.frequency = parseInt(modal.querySelector('#nominalCompoundingPeriod').value);
        }

        onSave(periodicChange);
        close();
    });
}
