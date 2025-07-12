// js/global-app.js
// Defines global app-level functions and objects for all modules/pages.

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
