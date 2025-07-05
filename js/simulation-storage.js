// Utility for saving/loading the full simulation state to/from LocalStorage and files
(function() {
    // Key for all simulation data
    const STORAGE_KEY = 'ftrack_simulation';

    // Get the current simulation state
    window.getSimulationState = function() {
        return {
            accounts: window.accounts || [],
            transactions: window.transactions || [],
            // Add other modules here as needed (e.g., simulation settings, calculator, etc.)
        };
    };

    // Set the simulation state (replace all data)
    window.setSimulationState = function(state) {
        window.accounts = state.accounts || [];
        window.transactions = state.transactions || [];
        if (typeof window.renderAccounts === 'function') window.renderAccounts();
        if (typeof window.renderTransactions === 'function') window.renderTransactions();
        if (typeof window.updateTxnAccountOptions === 'function') window.updateTxnAccountOptions();
    };

    // Save to LocalStorage
    window.saveSimulationToLocalStorage = function() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(window.getSimulationState()));
    };

    // Load from LocalStorage
    window.loadSimulationFromLocalStorage = function() {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            try {
                window.setSimulationState(JSON.parse(data));
            } catch (e) {
                console.warn('Failed to parse simulation from localStorage:', e);
            }
        }
    };

    // Download as file
    window.downloadSimulationFile = function() {
        const dataStr = JSON.stringify(window.getSimulationState(), null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ftrack-simulation.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    };

    // Load from file
    window.uploadSimulationFile = function(file, callback) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const state = JSON.parse(e.target.result);
                window.setSimulationState(state);
                window.saveSimulationToLocalStorage();
                if (callback) callback(true);
            } catch (err) {
                if (callback) callback(false);
            }
        };
        reader.readAsText(file);
    };

    // On page load, always load from LocalStorage
    document.addEventListener('DOMContentLoaded', window.loadSimulationFromLocalStorage);
})();
