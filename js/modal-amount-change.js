/**
 * Amount Change Modal Module
 *
 * This module provides a modal dialog for editing the amountChange
 * properties of a transaction, which models how its value changes over time.
 */
export class AmountChangeModal {
    static show(amountChangeData, onSave) {
        // Create or get the modal element
        let modal = document.getElementById('amountChangeModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'amountChangeModal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        const data = amountChangeData || { type: 'value', value: 0, frequency: 'yearly' };

        modal.innerHTML = `
            <div class="modal-content">
                <span class="close-btn">&times;</span>
                <h2>Edit Amount Change</h2>
                <div class="form-group">
                    <label for="acType">Change Type</label>
                    <select id="acType">
                        <option value="value">Fixed Value</option>
                        <option value="percentage">Percentage</option>
                        <option value="ratio">Ratio</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="acValue">Change Value</label>
                    <input type="number" id="acValue" value="${data.value || 0}">
                </div>
                <div class="form-group">
                    <label for="acFrequency">Frequency of Change</label>
                    <select id="acFrequency">
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                    </select>
                </div>
                <div class="modal-actions">
                    <button id="saveAmountChangeBtn" class="btn">Save</button>
                    <button id="removeAmountChangeBtn" class="btn btn-danger">Remove</button>
                    <button id="cancelAmountChangeBtn" class="btn btn-secondary">Cancel</button>
                </div>
            </div>
        `;

        // Populate initial values
        document.getElementById('acType').value = data.type;
        document.getElementById('acFrequency').value = data.frequency;

        // Event Listeners
        const closeModal = () => modal.style.display = 'none';
        modal.querySelector('.close-btn').onclick = closeModal;
        document.getElementById('cancelAmountChangeBtn').onclick = closeModal;

        document.getElementById('removeAmountChangeBtn').onclick = () => {
            if (confirm('Are you sure you want to remove the amount change rule?')) {
                onSave(null); // Pass null to indicate removal
                closeModal();
            }
        };

        document.getElementById('saveAmountChangeBtn').onclick = () => {
            const updatedAmountChange = {
                type: document.getElementById('acType').value,
                value: parseFloat(document.getElementById('acValue').value),
                frequency: document.getElementById('acFrequency').value
            };
            onSave(updatedAmountChange);
            closeModal();
        };

        modal.style.display = 'block';
    }
}
