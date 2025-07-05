// --- Standalone/Helper Functions (must be first!) ---
if (typeof window !== 'undefined') {
    if (typeof window.getEl === 'undefined') {
        window.getEl = function(id) { return document.getElementById(id); };
    }
    if (typeof window.toggleAccordion === 'undefined') {
        window.toggleAccordion = function(id) {
            var panel = document.getElementById(id);
            var content = panel.querySelector('.panel-content');
            content.style.display = (content.style.display === 'none') ? 'block' : 'none';
        };
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // --- Account Table ---
    window.renderAccounts = function() {
        const tbody = getEl('accountsTable').querySelector('tbody');
        tbody.innerHTML = '';
        accounts.forEach((acct, idx) => {
            const interestPeriod = acct.interest_period || 'month';
            const compoundPeriod = acct.compound_period || 'month';
            const interestType = acct.interest_type || 'compound';
            const interestDisplay = (acct.interest !== undefined && acct.interest !== null && acct.interest !== 0)
                ? `${acct.interest} (${interestPeriod}, ${interestType}, comp: ${compoundPeriod})`
                : '<span style="color:#888">None</span>';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${acct.name}</td>
                <td>${acct.balance}</td>
                <td>${interestDisplay}</td>
                <td>
                    <button onclick="editAccount(${idx})">Edit</button>
                    <button onclick="deleteAccount(${idx})">Delete</button>
                    <button onclick="openInterestModal(${idx})">Add/Edit Interest</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        updateTxnAccountOptions();
    };

    // --- Interest Modal Logic ---
    window.openInterestModal = function(idx) {
        const acct = accounts[idx];
        const modal = document.getElementById('interestModal');
        modal.style.display = 'flex';
        modal.dataset.idx = idx;
        getEl('modal_acct_interest').value = acct.interest !== undefined ? acct.interest : 0;
        getEl('modal_acct_interest_period').value = acct.interest_period || 'month';
        getEl('modal_acct_compound_period').value = acct.compound_period || 'month';
        getEl('modal_acct_interest_type').value = acct.interest_type || 'compound';
    };
    getEl('closeInterestModal').onclick = function() {
        document.getElementById('interestModal').style.display = 'none';
    };
    getEl('cancelInterestBtn').onclick = function() {
        document.getElementById('interestModal').style.display = 'none';
    };
    getEl('saveInterestBtn').onclick = function() {
        const idx = document.getElementById('interestModal').dataset.idx;
        if (idx !== undefined && accounts[idx]) {
            accounts[idx].interest = parseFloat(getEl('modal_acct_interest').value);
            accounts[idx].interest_period = getEl('modal_acct_interest_period').value;
            accounts[idx].compound_period = getEl('modal_acct_compound_period').value;
            accounts[idx].interest_type = getEl('modal_acct_interest_type').value;
            afterDataChange();
        }
        document.getElementById('interestModal').style.display = 'none';
    };

    // --- Account Form ---
    getEl('accountForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const acct = {
            name: getEl('acct_name').value,
            balance: parseFloat(getEl('acct_balance').value)
        };
        let newIdx = null;
        if (editingAccount !== null) {
            // preserve interest settings if present
            Object.assign(acct, accounts[editingAccount]);
            acct.name = getEl('acct_name').value;
            acct.balance = parseFloat(getEl('acct_balance').value);
            accounts[editingAccount] = acct;
            newIdx = editingAccount;
            editingAccount = null;
        } else {
            accounts.push(acct);
            newIdx = accounts.length - 1;
        }
        this.reset();
        afterDataChange();
        // Immediately open interest modal for new/edited account
        openInterestModal(newIdx);
        setTimeout(() => {
            console.log('[DEBUG] accounts:', window.accounts);
            console.log('[DEBUG] editingAccount:', window.editingAccount);
        }, 0);
    });

    window.editAccount = function(idx) {
        const acct = accounts[idx];
        getEl('acct_name').value = acct.name;
        getEl('acct_balance').value = acct.balance;
        editingAccount = idx;
    };

    window.deleteAccount = function(idx) {
        accounts.splice(idx, 1);
        afterDataChange();
    };

    // Provide a minimal accounts array and afterDataChange for demo/standalone
    if (typeof window.accounts === 'undefined') {
        window.accounts = [
            { name: 'Checking', balance: 1200.00, interest: 0.5, interest_period: 'month', compound_period: 'month', interest_type: 'compound' },
            { name: 'Savings', balance: 5000.00, interest: 1.2, interest_period: 'year', compound_period: 'year', interest_type: 'simple' }
        ];
    }
    if (typeof window.editingAccount === 'undefined') {
        window.editingAccount = null;
    }
    if (typeof window.afterDataChange === 'undefined') {
        window.afterDataChange = function() { renderAccounts(); };
    }
    if (typeof window.updateTxnAccountOptions === 'undefined') {
        window.updateTxnAccountOptions = function() {};
    }

    renderAccounts();
});
