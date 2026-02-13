/**
 * export-service.js
 * Web-only export and import functionality for app data
 */

import { exportAppData, importAppData } from './data-service.js';
import { notifyError, notifySuccess } from '../../shared/notifications.js';

/**
 * Download app data as JSON file
 */
export async function downloadAppData() {
  try {
    const blob = await exportAppData();
    const filename = `ftrack-backup-${new Date().toISOString().split('T')[0]}.json`;
    
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
  } catch (err) {
    notifyError(`Export failed: ${err.message}`);
    return false;
  }
}

/**
 * Select and read file using file input
 * @returns {Promise<string>} - JSON string from file
 */
async function selectAndReadFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) {
        resolve(null);
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        resolve(event.target.result);
      };
      reader.onerror = () => {
        notifyError('Failed to read file');
        resolve(null);
      };
      reader.readAsText(file);
    };
    
    input.click();
  });
}

/**
 * Upload and import app data from JSON file
 * @param {boolean} merge - Whether to merge or replace data
 */
export async function uploadAppData(merge = false) {
  try {
    const jsonString = await selectAndReadFile();
    
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
    
    notifySuccess('Data imported successfully! The page will reload.');
    setTimeout(() => window.location.reload(), 1000);
    
    return true;
  } catch (err) {
    notifyError(`Import failed: ${err.message}`);
    return false;
  }
}
