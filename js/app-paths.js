// app-paths.js
// Provides consistent path resolution for data and config files
// Schemas: Bundled in app (read-only)
// User Data: userData directory (writable)
// Works in dev, Windows, Mac, and Web

import { isElectronEnv, getBundledAssetsPath, getPathModule, getUserAssetsPath } from './core/platform.js';

const isElectron = isElectronEnv();
const path = getPathModule();
const bundledAssetsPath = getBundledAssetsPath();
const userAssetsPath = getUserAssetsPath();

/**
 * Get path to user's app-data.json (writable)
 * Note: In web environment, this path is not used (data stored in localStorage)
 * @returns {string} - Full path to user data file
 */
export function getAppDataPath() {
  if (isElectron && path) {
    return path.join(userAssetsPath, 'app-data.json');
  } else {
    // Web: return dummy path (not used, data in localStorage)
    return '/ftrack-web/app-data.json';
  }
}

/**
 * Get path to a grid schema file (read-only, bundled)
 * @param {string} schemaName - Name of schema file (e.g., 'accounts-grid-unified.json')
 * @returns {string} - Full path to schema file
 */
export function getSchemaPath(schemaName) {
  if (isElectron && path) {
    return path.join(bundledAssetsPath, schemaName);
  } else {
    // Web: return absolute path from root (for use with fetch)
    return `../assets/${schemaName}`;
  }
}
