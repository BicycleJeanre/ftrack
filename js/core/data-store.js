// data-store.js
// Generic CRUD layer for data persistence
// Single source of truth for file I/O operations

import { getAppDataPath } from '../app-paths.js';
import { getFsPromises, isElectronEnv } from './platform.js';

const isElectron = isElectronEnv();
const fs = getFsPromises();
const dataPath = isElectron ? getAppDataPath() : null;

let writeQueue = Promise.resolve(); // serialize writes to avoid concurrent truncation
let transactionQueue = Promise.resolve(); // serialize transactions (read-modify-write) to avoid races

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
    if (!fs || !dataPath) {
        throw new Error('[DataStore] Filesystem not available in Electron context');
    }
    try {
        const dataFile = await fs.readFile(dataPath, 'utf8');
        if (!dataFile || dataFile.trim() === '') return { scenarios: [] };
        return JSON.parse(dataFile);
    } catch (err) {
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
        localStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(data));
        return;
    }
    if (!fs || !dataPath) {
        throw new Error('[DataStore] Filesystem not available in Electron context');
    }
    // Serialize writes through a promise chain and use atomic write (temp file + rename)
    writeQueue = writeQueue.then(async () => {
        const tmpPath = dataPath + '.tmp';
        try {
            await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
            await fs.rename(tmpPath, dataPath);
        } catch (err) {
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
        await write(modified);
        return modified;
    });
    return transactionQueue;
}
