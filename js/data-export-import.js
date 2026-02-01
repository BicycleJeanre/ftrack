// data-export-import.js
// Export and import functionality for app data

import { exportAppData, importAppData, getPlatformInfo } from './data-manager.js';

// Electron detection - check if window.electronAPI is available (set by preload.js)
// or if running with nodeIntegration enabled
function isElectronEnv() {
  return typeof window !== 'undefined' && (
    !!window.electronAPI ||
    (typeof window.require === 'function' && 
     typeof window.process === 'object' && 
     window.process.type === 'renderer')
  );
}

/**
 * Download app data as JSON file
 * Works in both Electron and web browsers
 */
export async function downloadAppData() {
  try {
    const blob = await exportAppData();
    const filename = `ftrack-backup-${new Date().toISOString().split('T')[0]}.json`;
    
    const platform = getPlatformInfo();
    if (isElectronEnv() && window.electronAPI) {
      // Electron: use IPC to show save dialog and write file
      const jsonString = await blob.text();
      const result = await window.electronAPI.exportData(jsonString);
      if (result.success) {
        alert('Data exported successfully!');
        return true;
      } else {
        alert(`Export failed: ${result.message}`);
        return false;
      }
    } else if (platform.isWeb) {
      // Web: trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } else {
      alert('Export failed: Not running in Electron or supported web environment.');
      return false;
    }
  } catch (err) {
    alert(`Export failed: ${err.message}`);
    return false;
  }
}

/**
 * Upload and import app data from JSON file
 * Works in both Electron and web browsers
 * @param {boolean} merge - Whether to merge or replace data
 */
export async function uploadAppData(merge = false) {
  try {
    const platform = getPlatformInfo();
    let jsonString;
    if (isElectronEnv() && window.electronAPI) {
      // Electron: use IPC to show open dialog and read file
      const result = await window.electronAPI.importData();
      if (result.success) {
        jsonString = result.data;
      } else {
        alert(`Import failed: ${result.message}`);
        return false;
      }
    } else {
      // Web: use file input
      jsonString = await selectAndReadFile();
    }
    
    if (!jsonString) {
      return false;
    }
    
    // Confirm action
    const action = merge ? 'merge with' : 'replace';
    const confirmed = confirm(`This will ${action} your current data. Continue?`);
    
    if (!confirmed) {
      return false;
    }
    
    await importAppData(jsonString, merge);
    
    // Reload to show imported data (works in both Electron and web now that DataStore handles localStorage)
    alert('Data imported successfully! The page will reload.');
    setTimeout(() => window.location.reload(), 1000);
    
    return true;
  } catch (err) {
    alert(`Import failed: ${err.message}`);
    return false;
  }
}

/**
 * Helper: Select and read a file in the browser
 * @returns {Promise<string>} - File contents as string
 */
function selectAndReadFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      document.body.removeChild(input);
      if (!file) {
        resolve(null);
        return;
      }
      
      try {
        const text = await file.text();
        resolve(text);
      } catch (err) {
        reject(err);
      }
    };
    
    input.oncancel = () => {
      document.body.removeChild(input);
      resolve(null);
    };
    
    // Attach to DOM before clicking to ensure it's treated as a user action
    document.body.appendChild(input);
    input.click();
  });
}
