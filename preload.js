// preload.js
// Preload script for Electron


// Expose IPC-safe APIs for export/import to renderer
try {
  const { contextBridge, ipcRenderer } = require('electron');
  if (contextBridge && ipcRenderer) {
    contextBridge.exposeInMainWorld('electronAPI', {
      exportData: async (data) => ipcRenderer.invoke('export-data', data),
      importData: async () => ipcRenderer.invoke('import-data')
    });
  }
} catch (e) {
  // Fallback for nodeIntegration: true (legacy)
  window.electronAPI = {
    exportData: async (data) => require('electron').ipcRenderer.invoke('export-data', data),
    importData: async () => require('electron').ipcRenderer.invoke('import-data')
  };
}
