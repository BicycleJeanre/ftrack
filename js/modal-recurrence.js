/**
 * Recurrence Modal Module
 *
 * This module provides a modal dialog for editing the recurrence
 * properties of a transaction.
 */
export class RecurrenceModal {
    static show(recurrenceData, onSave) {
        // Create or get the modal element
        let modal = document.getElementById('recurrenceModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'recurrenceModal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        const data = recurrenceData || { frequency: 'monthly', dayOfMonth: 1, endDate: '' };

        modal.innerHTML = `
            <div class="modal-content">
                <span class="close-btn">&times;</span>
                <h2>Edit Recurrence</h2>
                <div class="form-group">
                    <label for="recFrequency">Frequency</label>
                    <select id="recFrequency">
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly" selected>Monthly</option>
                        <option value="yearly">Yearly</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="recDayOfMonth">Day of Month (1-31)</label>
                    <input type="number" id="recDayOfMonth" min="1" max="31" value="${data.dayOfMonth || 1}">
                </div>
                <div class="form-group">
                    <label for="recEndDate">End Date</label>
                    <input type="date" id="recEndDate" value="${data.endDate || ''}">
                </div>
                <div class="modal-actions">
                    <button id="saveRecurrenceBtn" class="btn">Save</button>
                    <button id="cancelRecurrenceBtn" class="btn btn-secondary">Cancel</button>
                </div>
            </div>
        `;

        // Populate initial values
        document.getElementById('recFrequency').value = data.frequency;

        // Event Listeners
        const closeModal = () => modal.style.display = 'none';
        modal.querySelector('.close-btn').onclick = closeModal;
        document.getElementById('cancelRecurrenceBtn').onclick = closeModal;

        document.getElementById('saveRecurrenceBtn').onclick = () => {
            const updatedRecurrence = {
                frequency: document.getElementById('recFrequency').value,
                dayOfMonth: parseInt(document.getElementById('recDayOfMonth').value, 10),
                endDate: document.getElementById('recEndDate').value
            };
            onSave(updatedRecurrence);
            closeModal();
        };

        modal.style.display = 'block';
    }
}
