/**
 * export-service.js
 * Web-only export and import functionality for app data
 */

import { exportAppData } from './data-service.js';
import { notifyError } from '../../shared/notifications.js';

/**
 * Download a JavaScript value as a formatted JSON file.
 */
export function downloadJsonData(value, filename) {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

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
 * @returns {Promise<{name: string, text: string}|null>}
 */
export async function selectJsonDataFile() {
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
        resolve({
          name: file.name || 'selected-data.json',
          text: String(event.target.result || '')
        });
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
