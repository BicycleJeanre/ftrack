// --- Global Helper Functions ---
export function loadGlobals() {
        // Adds a global helper to get an element by its ID
        window.getEl = (id) => document.getElementById(id);

        // Adds a global helper to append a child element to a parent element
        window.add = (parentElement, childElement) => parentElement.appendChild(childElement);

        // Adds a global helper to toggle the display of an element (accordion style)
        window.toggleAccordion = (id) => {
            const panel = document.getElementById(id);
            panel.style.display = (panel.style.display === 'none') ? 'block' : 'none';
        };
        // window.updateTxnAccountOptions = () => {};
}


// (function loadGlobals() {
//     // Dynamically load filemgmt.js if not already loaded
//     if (!window.filemgmt) {
//         const script = document.createElement('script');
//         script.src = '../js/filemgmt.js';
//         script.onload = function() {
//             console.log('[global-app] filemgmt.js loaded');
//         };
//         document.head.appendChild(script);
//     }
//     // Dynamically load data-startup.js if not already loaded
//     if (!window._dataStartupLoaded) {
//         const script = document.createElement('script');
//         script.src = '../js/data-startup.js';
//         script.onload = function() {
//             window._dataStartupLoaded = true;
//             console.log('[global-app] data-startup.js loaded');
//         };
//         document.head.appendChild(script);
//     }
//     // Dynamically load navbar.js if not already loaded
//     if (!window._navbarLoaded) {
//         const script = document.createElement('script');
//         script.src = '../js/navbar.js';
//         script.onload = function() {
//             window._navbarLoaded = true;
//             console.log('[global-app] navbar.js loaded');
//         };
//         document.head.appendChild(script);
//     }
// })();

// if (typeof window.afterDataChange !== 'function') {
//     window.afterDataChange = function() {};
// }
// if (typeof window.setForecastState !== 'function') {
//     window.setForecastState = function() {};
// }
// if (typeof window.saveForecastToLocalStorage !== 'function') {
//     window.saveForecastToLocalStorage = function() {};
// }
// // Add other global helpers as needed
