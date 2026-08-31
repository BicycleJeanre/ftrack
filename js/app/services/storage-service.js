/**
 * storage-service.js
 * Web-only persistence using localStorage with quota management
 * Single source of truth for data persistence operations
 */

import {
    assertCurrentSchemaVersion,
    createDefaultAppData,
    sanitizeAppDataForWrite
} from '../../shared/app-data-utils.js';

// Web storage key
export const STORAGE_KEY = 'ftrack:app-data';

let transactionQueue = Promise.resolve(); // serialize transactions (read-modify-write) to avoid races

/**
 * Read the entire app data from localStorage
 * @returns {Promise<Object>} - The complete app data object
 */
export async function read() {
    let parsed = null;
    try {
        const dataString = localStorage.getItem(STORAGE_KEY);
        if (!dataString) {
            return createDefaultAppData();
        }

        parsed = JSON.parse(dataString);
        assertCurrentSchemaVersion(parsed);
        return sanitizeAppDataForWrite(parsed);
    } catch (err) {
        if (err && err.name === 'SchemaVersionError' && parsed) {
            // Legacy browser data must be reviewed through the in-app upgrade
            // center. Never replace the raw cache before the user has seen the
            // change and validation report.
            throw err;
        }
        return createDefaultAppData();
    }
}

/**
 * Write the entire app data to localStorage
 * @param {Object} data - The complete data object to write
 * @returns {Promise<void>}
 */
export async function write(data) {
    try {
        assertCurrentSchemaVersion(data);
        const sanitized = sanitizeAppDataForWrite(data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    } catch (err) {
        if (err.name === 'QuotaExceededError') {
            throw new Error('Storage quota exceeded. Please export and clear old data.');
        }
        throw err;
    }
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
    const operation = transactionQueue.catch(() => undefined).then(async () => {
        const data = await read();
        const modified = await modifyFn(data);
        await write(modified);
        return modified;
    });

    transactionQueue = operation.catch(() => undefined);
    return operation;
}

/**
 * Clear all data
 * @returns {Promise<void>}
 */
export async function clear() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('ftrack:plan-actuals-workspaces:v1');
}
