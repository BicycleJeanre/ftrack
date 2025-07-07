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
    // Ensure updateTxnAccountOptions is always defined before use
    if (typeof window.updateTxnAccountOptions === 'undefined') {
        window.updateTxnAccountOptions = function() {};
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // --- Account Table ---
    window.renderAccounts = function() {
        const accountsTable = getEl('accountsTable');
        if (!accountsTable) return;
        const tbody = accountsTable.querySelector('tbody');
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
    const interestModal = document.getElementById('interestModal');
    if (interestModal) {
        window.openInterestModal = function(idx) {
            const acct = accounts[idx];
            interestModal.style.display = 'flex';
            interestModal.dataset.idx = idx;
            getEl('modal_acct_interest').value = acct.interest !== undefined ? acct.interest : 0;
            getEl('modal_acct_interest_period').value = acct.interest_period || 'month';
            getEl('modal_acct_compound_period').value = acct.compound_period || 'month';
            getEl('modal_acct_interest_type').value = acct.interest_type || 'compound';
        };
        getEl('closeInterestModal').onclick = function() {
            interestModal.style.display = 'none';
        };
        getEl('cancelInterestBtn').onclick = function() {
            interestModal.style.display = 'none';
        };
        getEl('saveInterestBtn').onclick = function() {
            const idx = interestModal.dataset.idx;
            if (idx !== undefined && accounts[idx]) {
                accounts[idx].interest = parseFloat(getEl('modal_acct_interest').value);
                accounts[idx].interest_period = getEl('modal_acct_interest_period').value;
                accounts[idx].compound_period = getEl('modal_acct_compound_period').value;
                accounts[idx].interest_type = getEl('modal_acct_interest_type').value;
                afterDataChange();
            }
            interestModal.style.display = 'none';
        };
    }

    // --- Account Form ---
    const accountForm = getEl('accountForm');
    if (accountForm) {
        accountForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const acct = {
                name: getEl('acct_name').value,
                balance: parseFloat(getEl('acct_balance').value),
                interest: 0
            };
            if (editingAccount !== null) {
                accounts[editingAccount] = acct;
                editingAccount = null;
            } else {
                accounts.push(acct);
            }
            this.reset();
            afterDataChange();
        });
    }

    // Initial render
    if (document.getElementById('accountsTable')) {
        renderAccounts();
    }
});

// --- Account Management ---
let editingAccount = null;

function editAccount(idx) {
    const acct = accounts[idx];
    getEl('acct_name').value = acct.name;
    getEl('acct_balance').value = acct.balance;
    editingAccount = idx;
}

function deleteAccount(idx) {
    accounts.splice(idx, 1);
    afterDataChange();
}

// Overwrite afterDataChange to trigger rerender
if(typeof window.afterDataChange === 'function'){
    const _afterDataChange = window.afterDataChange;
    window.afterDataChange = function() {
        _afterDataChange();
        if (document.getElementById('accountsTable')) {
            renderAccounts();
        }
    };
}
