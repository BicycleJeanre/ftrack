// File management logic partial

// --- Auto-save/load to localStorage ---
function saveToLocal() {
    const data = {
        accounts,
        transactions,
        forecastResults: window.forecastResults || [] // Ensure forecastResults exists
    };
    localStorage.setItem('forecastData', JSON.stringify(data));
}

function loadFromLocal() {
    const data = localStorage.getItem('forecastData');
    if (data) {
        try {
            const parsed = JSON.parse(data);
            if (parsed.accounts && parsed.transactions) {
                window.accounts = parsed.accounts;
                window.transactions = parsed.transactions;
                window.forecastResults = parsed.forecastResults || [];
                if (typeof window.afterDataChange === 'function') {
                    window.afterDataChange();
                }
                return true;
            }
        } catch (e) {
            console.error('Error parsing localStorage data:', e);
        }
    }
    return false;
}

// Overwrite afterDataChange to automatically save to local storage
const _afterDataChange = window.afterDataChange || function() {};
window.afterDataChange = function() {
    _afterDataChange();
    saveToLocal();
    if(typeof updateActiveDataSourceDisplay === 'function') updateActiveDataSourceDisplay();
};

// On page load, data is now handled by data-startup.js
document.addEventListener('DOMContentLoaded', function() {
    // Reset to Default button logic
    const resetBtn = document.getElementById('resetToDefaultBtn');
    if (resetBtn) {
        resetBtn.onclick = function() {
            localStorage.removeItem('forecastData');
            // Re-run startup logic to load defaults
            if(typeof loadDefaultData === 'function') {
                loadDefaultData();
            }
            activeDataSource = 'Default';
            if(typeof updateActiveDataSourceDisplay === 'function') {
                updateActiveDataSourceDisplay();
            }
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
                if (data.accounts && data.transactions) {
                    window.accounts = data.accounts;
                    window.transactions = data.transactions;
                    window.forecastResults = data.forecastResults || [];
                    activeDataSource = 'Imported: ' + file.name;
                    if(typeof afterDataChange === 'function') afterDataChange();
                    if(typeof updateActiveDataSourceDisplay === 'function') updateActiveDataSourceDisplay();
                    alert('Forecast data imported!');
                } else {
                    alert('Invalid forecast data file.');
                }
            } catch (err) {
                alert('Error reading file: ' + err.message);
            }
        };
        reader.readAsText(file);
    });
}

function updateActiveDataSourceDisplay() {
    // Placeholder for a UI element to show the data source
}
