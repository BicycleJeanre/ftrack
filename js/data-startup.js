// --- Data Startup Logic ---
document.addEventListener('DOMContentLoaded', function() {
    // Function to load default data
    function loadDefaultData() {
        // In a real app, you might fetch this from a server or have it embedded.
        // For now, we use the data from default-data.js
        console.log('Attempting to load default data...');
        if (window.accounts && window.transactions) {
            // The default data is already on the window object.
            // Now, we need to make sure the forecast state is set with this data.
            if (window.setForecastState) {
                window.setForecastState({ 
                    accounts: window.accounts, 
                    transactions: window.transactions 
                });
            }

            console.log('Loaded default data into application state.');
            // Optionally, save the default data to local storage right away
            if (window.saveForecastToLocalStorage) {
                window.saveForecastToLocalStorage();
            }
            // Update UI if needed
            if (typeof window.afterDataChange === 'function') {
                window.afterDataChange();
            }
        }
    }

    // Main data loading sequence
    if (window.loadForecastFromLocalStorage) {
        if (!window.loadForecastFromLocalStorage()) {
            // If nothing in local storage, load defaults
            loadDefaultData();
        }
    } else {
        // If storage functions aren't available, just load defaults
        loadDefaultData();
    }
});
