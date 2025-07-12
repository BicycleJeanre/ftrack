// --- Data Startup Logic ---
document.addEventListener('DOMContentLoaded', async function() {
    // Load all app data from file
    if (window.filemgmt && typeof window.filemgmt.loadAppDataFromFile === 'function') {
        await window.filemgmt.loadAppDataFromFile();
        if (typeof window.afterDataChange === 'function') {
            window.afterDataChange();
        }
    }
});
