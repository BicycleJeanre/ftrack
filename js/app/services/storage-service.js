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
const commitListeners = new Set();

function dispatchCommit(source) {
    const commit = { source, committedAt: new Date().toISOString() };
    commitListeners.forEach((listener) => {
        try {
            listener(commit);
        } catch (_) {
            // Persistence must remain successful even if a background observer fails.
        }
    });
}

export function subscribeToCommits(listener) {
    commitListeners.add(listener);
    return () => commitListeners.delete(listener);
}

/**
 * Read the entire app data from localStorage
 * @returns {Promise<Object>} - The complete app data object
 */
export async function read() {
    let parsed = null;
    try {
        const dataString = localStorage.getItem(STORAGE_KEY);
        if (dataString === null) {
            return createDefaultAppData();
        }

        parsed = JSON.parse(dataString);
        assertCurrentSchemaVersion(parsed);
        if (!Array.isArray(parsed.scenarios)) throw new Error('Missing scenario collection');
        return sanitizeAppDataForWrite(parsed);
    } catch (err) {
        if (err?.name === 'SchemaVersionError') {
            // Legacy browser data must be reviewed through the in-app upgrade
            // center. Never replace the raw cache before the user has seen the
            // change and validation report.
            throw err;
        }
        // A failed read is not an empty workspace. In particular, a later
        // transaction must never overwrite the unreadable original with defaults.
        const error = new Error('This device’s saved workspace could not be read. It has not been replaced.');
        error.name = 'LocalDataReadError';
        throw error;
    }
}

/**
 * Write the entire app data to localStorage
 * @param {Object} data - The complete data object to write
 * @returns {Promise<void>}
 */
async function writeUnlocked(data, options = {}) {
    try {
        assertCurrentSchemaVersion(data);
        const sanitized = sanitizeAppDataForWrite(data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
        dispatchCommit(options.source || 'local');
    } catch (err) {
        if (err.name === 'QuotaExceededError') {
            throw new Error('Storage quota exceeded. Please export and clear old data.');
        }
        throw err;
    }
}

// Coordinate writes across tabs. Disposable agent Workers have no document
// and only use their own in-memory localStorage.
const withWorkspaceLock = task =>
    typeof document !== 'undefined' && globalThis.navigator?.locks
        ? navigator.locks.request('ftrack:workspace-write', task)
        : task();

export async function write(data, options = {}) {
    return withWorkspaceLock(() => writeUnlocked(data, options));
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
export async function transaction(modifyFn, options = {}) {
    // Ensure transactions happen sequentially to avoid race conditions when generating new IDs
    const operation = transactionQueue.catch(() => undefined).then(() => withWorkspaceLock(async () => {
        const data = await read();
        const modified = await modifyFn(data);
        if (modified !== data || !options.skipUnchanged) await writeUnlocked(modified, options);
        return modified;
    }));

    transactionQueue = operation.catch(() => undefined);
    return operation;
}

/**
 * Clear all data
 * @returns {Promise<void>}
 */
export async function clear() {
    return withWorkspaceLock(() => {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('ftrack:plan-actuals-workspaces:v1');
        dispatchCommit('local');
    });
}
