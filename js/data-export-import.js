// data-export-import.js
// Export and import functionality for app data

import { exportAppData, importAppData, getPlatformInfo } from './data-manager.js';

/**
 * Download app data as JSON file
 * Works in both Electron and web browsers
 */
export async function downloadAppData() {
  try {
    const blob = await exportAppData();
    const filename = `ftrack-backup-${new Date().toISOString().split('T')[0]}.json`;
    
    const platform = getPlatformInfo();
    
    if (platform.isElectron) {
      // Electron: use save dialog
      const { dialog } = window.require('electron').remote;
      const fs = window.require('fs').promises;
      
      const { filePath } = await dialog.showSaveDialog({
        title: 'Export FTrack Data',
        defaultPath: filename,
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      if (filePath) {
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        await fs.writeFile(filePath, buffer);
        console.log('[Export] Data exported to:', filePath);
        return true;
      }
      return false;
    } else {
      // Web: trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('[Export] Data exported as:', filename);
      return true;
    }
  } catch (err) {
    console.error('[Export] Failed to export data:', err);
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
    
    if (platform.isElectron) {
      // Electron: use open dialog
      const { dialog } = window.require('electron').remote;
      const fs = window.require('fs').promises;
      
      const { filePaths } = await dialog.showOpenDialog({
        title: 'Import FTrack Data',
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });
      
      if (!filePaths || filePaths.length === 0) {
        return false;
      }
      
      jsonString = await fs.readFile(filePaths[0], 'utf8');
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
    
    alert('Data imported successfully! The page will reload.');
    window.location.reload();
    
    return true;
  } catch (err) {
    console.error('[Import] Failed to import data:', err);
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
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
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
      resolve(null);
    };
    
    input.click();
  });
}
