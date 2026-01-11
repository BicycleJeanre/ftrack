// data-store.js
// Generic CRUD layer for data persistence
// Single source of truth for file I/O operations

import { getAppDataPath } from '../app-paths.js';

const fs = window.require('fs').promises;
const dataPath = getAppDataPath();

/**
 * Read the entire app-data.json file
 * @returns {Promise<Object>} - The complete app data object
 */
export async function read() {
    try {
        const dataFile = await fs.readFile(dataPath, 'utf8');
        return JSON.parse(dataFile);
    } catch (err) {
        console.error('[DataStore] Failed to read app-data.json:', err);
        throw err;
    }
}

/**
 * Write the entire app-data.json file
 * @param {Object} data - The complete data object to write
 * @returns {Promise<void>}
 */
export async function write(data) {
    try {
        await fs.writeFile(dataPath, JSON.stringify(data, null, 2), 'utf8');
        console.log('[DataStore] Data saved successfully');
    } catch (err) {
        console.error('[DataStore] Failed to write app-data.json:', err);
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
    const data = await read();
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = data;
    
    for (const key of keys) {
        if (!(key in target)) {
            target[key] = {};
        }
        target = target[key];
    }
    
    target[lastKey] = value;
    await write(data);
}

/**
 * Atomic transaction - read, modify, write
 * @param {Function} modifyFn - Function that receives data and returns modified data
 * @returns {Promise<Object>} - The modified data
 */
export async function transaction(modifyFn) {
    const data = await read();
    const modified = await modifyFn(data);
    await write(modified);
    return modified;
}
