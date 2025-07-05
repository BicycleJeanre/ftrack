// --- Ensure simulation-storage.js and default-data.js are loaded ---
// This should be at the top of both accounts.js and transactions.js, but is missing.
// Dynamically load them if not present (for standalone/partial pages)
(function ensureSharedScripts() {
    function loadScript(src) {
        return new Promise(function(resolve, reject) {
            if (document.querySelector('script[src="' + src + '"]')) return resolve();
            var s = document.createElement('script');
            s.src = src;
            s.onload = function() { console.log('[DEBUG] Loaded script:', src); resolve(); };
            s.onerror = function(e) { console.error('[DEBUG] Failed to load script:', src, e); reject(e); };
            document.head.appendChild(s);
        });
    }
    if (!window.getSimulationState || !window.saveSimulationToLocalStorage) {
        console.log('[DEBUG] simulation-storage.js not loaded, loading...');
        loadScript('js/simulation-storage.js');
    }
    if (!window.accounts || !window.transactions) {
        console.log('[DEBUG] default-data.js not loaded, loading...');
        loadScript('js/default-data.js');
    }
})();

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
        renderAccounts(); // Ensure table updates after closing modal
    };
    getEl('cancelInterestBtn').onclick = function() {
        document.getElementById('interestModal').style.display = 'none';
        renderAccounts(); // Ensure table updates after canceling modal
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
        renderAccounts(); // Ensure table updates after saving modal
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

    // --- LocalStorage Save/Load for full simulation ---
    const originalAfterDataChange = window.afterDataChange;
    window.afterDataChange = function() {
        if (originalAfterDataChange) originalAfterDataChange();
        window.saveSimulationToLocalStorage();
    };
    // Add Save button to page if not present
    function addSaveButton() {
        if (!document.getElementById('saveAccountsBtn')) {
            const btn = document.createElement('button');
            btn.id = 'saveAccountsBtn';
            btn.textContent = 'Save Simulation';
            btn.style = 'margin: 12px 0 24px 0; float:right;';
            btn.onclick = function() {
                console.log('[DEBUG] Save Simulation button clicked');
                if (window.downloadSimulationFile) {
                    window.downloadSimulationFile();
                    console.log('[DEBUG] Simulation state downloaded:', window.getSimulationState());
                } else {
                    console.error('[DEBUG] downloadSimulationFile is not defined');
                }
            };
            const container = document.querySelector('.container');
            if (container) container.insertBefore(btn, container.firstChild.nextSibling);
        }
    }
    addSaveButton();
    // Warn on close if not saved
    let lastSaved = JSON.stringify(window.getSimulationState());
    window.addEventListener('beforeunload', function(e) {
        if (JSON.stringify(window.getSimulationState()) !== lastSaved) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Save before leaving?';
            return e.returnValue;
        }
    });
    // On manual save, update lastSaved
    var saveBtn = document.getElementById('saveAccountsBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            lastSaved = JSON.stringify(window.getSimulationState());
            console.log('[DEBUG] lastSaved updated:', lastSaved);
        });
    }
    // Load from LocalStorage on page load
    window.loadSimulationFromLocalStorage();
    renderAccounts();

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
    renderAccounts();
});
