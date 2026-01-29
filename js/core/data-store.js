// data-store.js
// Generic CRUD layer for data persistence
// Single source of truth for file I/O operations
// Delegates to data-manager.js in web environment for localStorage

import { getAppDataPath } from '../app-paths.js';

// Platform detection
const isElectron = typeof window !== 'undefined' && typeof window.require !== 'undefined';

let fs, path, dataPath;
if (isElectron) {
  fs = window.require('fs').promises;
  path = window.require('path');
  dataPath = getAppDataPath();
}

let writeQueue = Promise.resolve(); // serialize writes to avoid concurrent truncation
let transactionQueue = Promise.resolve(); // serialize transactions (read-modify-write) to avoid races

// Lazy import data-manager for web mode
let dataManager;
async function getDataManager() {
  if (!dataManager) {
    dataManager = await import('../data-manager.js');
  }
  return dataManager;
}

// Web storage key (must match data-manager.js)
const WEB_STORAGE_KEY = 'ftrack:app-data';

/**
 * Read the entire app-data.json file (Electron) or localStorage (web)
 * @returns {Promise<Object>} - The complete app data object
 */
export async function read() {
    if (!isElectron) {
        // Web: read complete structure from localStorage
        const dataString = localStorage.getItem(WEB_STORAGE_KEY);
        if (!dataString) {
            return { scenarios: [] };
        }
        return JSON.parse(dataString);
    }
    try {
        const dataFile = await fs.readFile(dataPath, 'utf8');
        if (!dataFile || dataFile.trim() === '') return { scenarios: [] };
        return JSON.parse(dataFile);
    } catch (err) {
        console.error('[DataStore] Failed to read app-data.json:', err);
        throw err;
    }
}

/**
 * Write the entire app-data.json file (Electron) or localStorage (web)
 * @param {Object} data - The complete data object to write
 * @returns {Promise<void>}
 */
export async function write(data) {
    if (!isElectron) {
        const dm = await getDataManager();
        // For web, we need to call the internal write function
        // Since data-manager exports specific methods, we'll need to work with scenarios
        // This is a bit awkward - we may need to expose a writeAppData in data-manager
        // For now, let's use a workaround
        const WEB_STORAGE_KEY = 'ftrack:app-data';
        localStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(data));
        return;
    }
    // Serialize writes through a promise chain and use atomic write (temp file + rename)
    writeQueue = writeQueue.then(async () => {
        const tmpPath = dataPath + '.tmp';
        try {
            console.log('[DataStore.write] target', dataPath);
            await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
            await fs.rename(tmpPath, dataPath);
            // console.log('[DataStore] Data saved successfully');
        } catch (err) {
            console.error('[DataStore] Failed to write app-data.json atomically:', err);
            // try to cleanup temp file
            try { await fs.unlink(tmpPath); } catch (e) { /* ignore */ }
            throw err;
        }
    });
    return writeQueue;
}

/**
 * Query a specific property from app data
 * @param {string} path - Dot-notation path to property (e.g., 'scenarios', 'profile')
 * @returns {Promise<any>} - The queried data
 */
export async function query(path) {
    const data = await read();
    const keys = path.split('.');
    let result = data;
    
    for (const key of keys) {
        if (result === undefined || result === null) {
            return undefined;
        }
        result = result[key];
    }
    
    return result;
}

/**
 * Update a specific property in app data
 * @param {string} path - Dot-notation path to property
 * @param {any} value - The value to set
 * @returns {Promise<void>}
 */
export async function update(path, value) {
    return await transaction(async (data) => {
        const keys = path.split('.');
        let current = data;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (current[key] === undefined || current[key] === null) {
                current[key] = {};
            }
            current = current[key];
        }
        
        const finalKey = keys[keys.length - 1];
        current[finalKey] = value;
        
        return data;
    });
}

/**
 * Atomic transaction - read, modify, write
 * @param {Function} modifyFn - Function that receives data and returns modified data
 * @returns {Promise<Object>} - The modified data
 */
export async function transaction(modifyFn) {
    // Ensure transactions happen sequentially to avoid race conditions when generating new IDs
    transactionQueue = transactionQueue.then(async () => {
        const data = await read();
        const modified = await modifyFn(data);
        console.log('[DataStore.transaction] writing data');
        await write(modified);
        console.log('[DataStore.transaction] write complete');
        return modified;
    });
    return transactionQueue;
}
