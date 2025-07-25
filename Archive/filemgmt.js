// File management logic partial

// --- Auto-save/load to localStorage ---
function saveToLocal() {
    const data = {
        accounts,
        transactions,
        forecastResults: window.forecastResults || [] // Ensure forecastResults exists
    };
    console.log('[filemgmt] saveToLocal called, saving:', data);
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
                // TEMPORARILY COMMENTED OUT TO TEST ACCOUNTS SAVE ONLY
                // if (typeof window.afterDataChange === 'function') {
                //     window.afterDataChange();
                // }
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
    console.log('[filemgmt] afterDataChange called, window.accounts:', window.accounts, 'window.transactions:', window.transactions);
    _afterDataChange();
    // Always save to disk in Electron/Node.js
    const data = {
        accounts: window.accounts,
        transactions: window.transactions,
        forecastResults: window.forecastResults || [],
        forecast: window.forecast || [],
        budget: window.budget || []
    };
    // TEMPORARILY COMMENTED OUT TO TEST ACCOUNTS SAVE ONLY
    // saveAppDataToFile(data);
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
                    // TEMPORARILY COMMENTED OUT TO TEST ACCOUNTS SAVE ONLY
                    // if(typeof afterDataChange === 'function') afterDataChange();
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

// --- File-based App Data Management ---

const path = window.require ? window.require('path') : null;
const fs = window.require ? window.require('fs') : null;
// For Electron/Node.js, always resolve from the app root, never use browser fetch path
const APP_DATA_PATH = (fs && path)
    ? path.resolve(process.cwd(), 'assets/app-data.json')
    : '/assets/app-data.json';

async function loadAppDataFromFile() {
    try {
        if (fs && path) {
            const dataRaw = fs.readFileSync(APP_DATA_PATH, 'utf-8');
            const data = JSON.parse(dataRaw);
            window.accounts = data.accounts || [];
            window.transactions = data.transactions || [];
            window.forecast = data.forecast || [];
            window.budget = data.budget || [];
            // Store the full data structure for preservation
            window.globalAppData = data;
            return data;
        } else {
            // Fallback for browser: fetch
            const response = await fetch(APP_DATA_PATH);
            if (!response.ok) throw new Error('Failed to load app data file');
            const data = await response.json();
            window.accounts = data.accounts || [];
            window.transactions = data.transactions || [];
            window.forecast = data.forecast || [];
            window.budget = data.budget || [];
            // Store the full data structure for preservation
            window.globalAppData = data;
            return data;
        }
    } catch (err) {
        console.error('Error loading app data:', err);
        window.accounts = [];
        window.transactions = [];
        window.forecast = [];
        window.budget = [];
        // Initialize with empty structure
        window.globalAppData = { accounts: [], transactions: [], forecast: [], budget: [] };
        return { accounts: [], transactions: [], forecast: [], budget: [] };
    }
}

async function saveAppDataToFile(data) {
    try {
        console.log('[filemgmt] saveAppDataToFile called with:', data);
        console.log('[filemgmt] fs available:', !!fs);
        console.log('[filemgmt] path available:', !!path);
        console.log('[filemgmt] APP_DATA_PATH:', APP_DATA_PATH);
        
        if (fs && path) {
            console.log('[filemgmt] Writing to file system');
            const jsonString = JSON.stringify(data, null, 2);
            console.log('[filemgmt] JSON string length:', jsonString.length);
            fs.writeFileSync(APP_DATA_PATH, jsonString, 'utf-8');
            console.log('[filemgmt] File written successfully');
        } else {
            // In browser: no-op or could trigger a download
            console.log('[filemgmt] Saving app data (browser mode):', data);
        }
    } catch (err) {
        console.error('[filemgmt] Error saving app data:', err);
        throw err; // Re-throw to see the error in the calling code
    }
}

window.filemgmt = {
    loadAppDataFromFile,
    saveAppDataToFile
};
