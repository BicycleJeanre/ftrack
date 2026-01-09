// preload.js
// Preload script for Electron

// The app uses nodeIntegration: true, so we don't need contextBridge
// Main process sets global.appBasePath which is accessible via remote

window.addEventListener('DOMContentLoaded', () => {
  console.log('[Preload] Ready');
});
