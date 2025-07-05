// File management logic partial
// --- Auto-save/load to localStorage ---
function saveToLocal() {
    const data = {
        accounts,
        transactions,
        simulationResults
    };
    localStorage.setItem('simulationData', JSON.stringify(data));
}
function loadFromLocal() {
    const data = localStorage.getItem('simulationData');
    if (data) {
        try {
            const parsed = JSON.parse(data);
            console.log('Loaded from localStorage:', parsed);
            if (parsed.accounts && parsed.transactions && parsed.simulationResults) {
                accounts = parsed.accounts;
                transactions = parsed.transactions;
                simulationResults = parsed.simulationResults;
                activeDataSource = 'Local (autosave)';
                afterDataChange();
                updateActiveDataSourceDisplay();
                return true;
            } else {
                console.warn('Local data missing required properties:', parsed);
            }
        } catch (e) {
            console.error('Error parsing localStorage data:', e);
        }
    }
    return false;
}
const _afterDataChange = afterDataChange;
afterDataChange = function() {
    console.log('afterDataChange: accounts', accounts, 'transactions', transactions, 'results', simulationResults);
    _afterDataChange();
    saveToLocal();
    updateActiveDataSourceDisplay();
};
// On page load, try localStorage, else load default
document.addEventListener('DOMContentLoaded', function() {
    if (!loadFromLocal()) {
        loadDefaultSimulationData();
    }
    // Reset to Default button logic
    const resetBtn = document.getElementById('resetToDefaultBtn');
    if (resetBtn) {
        resetBtn.onclick = function() {
            localStorage.removeItem('simulationData');
            loadDefaultSimulationData();
            activeDataSource = 'Default (simulation-testset.json)';
            updateActiveDataSourceDisplay();
        };
    }
});
// Update import logic to show file name
const importInput = document.getElementById('importJsonInput');
if (importInput) {
    importInput.addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                if (data.accounts && data.transactions && data.simulationResults) {
                    accounts = data.accounts;
                    transactions = data.transactions;
                    simulationResults = data.simulationResults;
                    activeDataSource = 'Imported: ' + file.name;
                    afterDataChange();
                    updateActiveDataSourceDisplay();
                    alert('Simulation data imported!');
                } else {
                    alert('Invalid simulation data file.');
                }
            } catch (err) {
                alert('Error reading file: ' + err.message);
            }
        };
        reader.readAsText(file);
    });
}
