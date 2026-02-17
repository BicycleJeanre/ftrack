/**
 * storage-service.js
 * Web-only persistence using localStorage with quota management
 * Single source of truth for data persistence operations
 */

// Web storage key
const STORAGE_KEY = 'ftrack:app-data';
const BACKUP_KEY = 'ftrack:backup';

let writeQueue = Promise.resolve(); // serialize writes to avoid concurrent truncation
let transactionQueue = Promise.resolve(); // serialize transactions (read-modify-write) to avoid races

/**
 * Read the entire app data from localStorage
 * @returns {Promise<Object>} - The complete app data object
 */
export async function read() {
    try {
        const dataString = localStorage.getItem(STORAGE_KEY);
        if (!dataString) {
            return { scenarios: [] };
        }

        const parsed = JSON.parse(dataString);
        if (!parsed || typeof parsed !== 'object') {
            return { scenarios: [] };
        }
        if (!Array.isArray(parsed.scenarios)) {
            parsed.scenarios = [];
        }
        return parsed;
    } catch (_) {
        return { scenarios: [] };
    }
}

/**
 * Write the entire app data to localStorage
 * @param {Object} data - The complete data object to write
 * @returns {Promise<void>}
 */
export async function write(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
    transactionQueue = transactionQueue.then(async () => {
        const data = await read();
        const modified = await modifyFn(data);
        await write(modified);
        return modified;
    });
    return transactionQueue;
}

/**
 * Backup current data
 * @returns {Promise<void>}
 */
export async function backup() {
    const data = await read();
    localStorage.setItem(BACKUP_KEY, JSON.stringify(data));
}

/**
 * Restore from backup
 * @returns {Promise<void>}
 */
export async function restore() {
    const backup = localStorage.getItem(BACKUP_KEY);
    if (backup) {
        localStorage.setItem(STORAGE_KEY, backup);
    }
}

/**
 * Clear all data
 * @returns {Promise<void>}
 */
export async function clear() {
    localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get storage usage information
 * @returns {Object} - Object with used, quota, and percentage
 */
export function getStorageUsage() {
    const data = localStorage.getItem(STORAGE_KEY) || '';
    return {
        used: new Blob([data]).size,
        quota: 5 * 1024 * 1024, // 5MB typical limit
        percentage: (new Blob([data]).size / (5 * 1024 * 1024)) * 100
    };
}
