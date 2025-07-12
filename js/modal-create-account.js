/**
 * Create Account Modal Module
 *
 * This module provides a simplified modal for creating a new account
 * from the transactions page.
 */
export class CreateAccountModal {
    static show(onSave) {
        // Create or get the modal element
        let modal = document.getElementById('createAccountModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'createAccountModal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="modal-content">
                <span class="close-btn">&times;</span>
                <h2>Create New Account</h2>
                <div class="form-group">
                    <label for="newAccountName">Account Name</label>
                    <input type="text" id="newAccountName" placeholder="e.g., Groceries Card">
                </div>
                 <div class="form-group">
                    <label for="newAccountBalance">Starting Balance</label>
                    <input type="number" id="newAccountBalance" value="0">
                </div>
                <div class="modal-actions">
                    <button id="saveNewAccountBtn" class="btn">Create Account</button>
                    <button id="cancelNewAccountBtn" class="btn btn-secondary">Cancel</button>
                </div>
            </div>
        `;

        // Event Listeners
        const closeModal = () => modal.style.display = 'none';
        modal.querySelector('.close-btn').onclick = closeModal;
        document.getElementById('cancelNewAccountBtn').onclick = closeModal;

        document.getElementById('saveNewAccountBtn').onclick = () => {
            const name = document.getElementById('newAccountName').value;
            const balance = parseFloat(document.getElementById('newAccountBalance').value);
            
            if (!name) {
                alert('Account name is required.');
                return;
            }

            const newAccount = {
                name,
                balance,
                current_balance: balance,
                group: "Expense", // Default group as per plan
                tags: [],
                interest: 0,
                interest_period: 'year',
                compound_period: 'none',
                interest_type: 'simple'
            };

            onSave(newAccount);
            closeModal();
        };

        modal.style.display = 'block';
        document.getElementById('newAccountName').focus();
    }
}
