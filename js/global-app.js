// js/global-app.js
// Defines global app-level functions and objects for all modules/pages.

// --- Import and expose filemgmt globally ---
// (Assume filemgmt.js is not a module, so just include its code here)
// If you want to keep filemgmt.js as a separate file, you can use:
// <script src="../js/filemgmt.js"></script> before this script in HTML.

// --- Import and expose modal-interest globally (for non-module use) ---
// If you want to use modal-interest.js as a module, you must import it in each module file.
// Otherwise, you can expose its main class globally here if needed.

(function loadGlobals() {
    // Dynamically load filemgmt.js if not already loaded
    if (!window.filemgmt) {
        const script = document.createElement('script');
        script.src = '../js/filemgmt.js';
        script.onload = function() {
            console.log('[global-app] filemgmt.js loaded');
        };
        document.head.appendChild(script);
    }
    // Dynamically load data-startup.js if not already loaded
    if (!window._dataStartupLoaded) {
        const script = document.createElement('script');
        script.src = '../js/data-startup.js';
        script.onload = function() {
            window._dataStartupLoaded = true;
            console.log('[global-app] data-startup.js loaded');
        };
        document.head.appendChild(script);
    }
    // Dynamically load navbar.js if not already loaded
    if (!window._navbarLoaded) {
        const script = document.createElement('script');
        script.src = '../js/navbar.js';
        script.onload = function() {
            window._navbarLoaded = true;
            console.log('[global-app] navbar.js loaded');
        };
        document.head.appendChild(script);
    }
})();

if (typeof window.afterDataChange !== 'function') {
    window.afterDataChange = function() {};
}
if (typeof window.setForecastState !== 'function') {
    window.setForecastState = function() {};
}
if (typeof window.saveForecastToLocalStorage !== 'function') {
    window.saveForecastToLocalStorage = function() {};
}
// Add other global helpers as needed
