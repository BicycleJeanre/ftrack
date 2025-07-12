// --- Data Startup Logic ---
console.log('[data-startup] Script loaded');
document.addEventListener('DOMContentLoaded', async function() {
    console.log('[data-startup] DOMContentLoaded');
    // Load all app data from file
    if (window.filemgmt && typeof window.filemgmt.loadAppDataFromFile === 'function') {
        console.log('[data-startup] filemgmt and loadAppDataFromFile found');
        await window.filemgmt.loadAppDataFromFile();
        if (typeof window.afterDataChange === 'function') {
            console.log('[data-startup] afterDataChange found, calling');
            window.afterDataChange();
        }
        // Dispatch a custom event to signal data is loaded
        console.log('[data-startup] Dispatching appDataLoaded');
        document.dispatchEvent(new CustomEvent('appDataLoaded'));
    } else {
        console.error('[data-startup] filemgmt or loadAppDataFromFile not found');
    }
});
