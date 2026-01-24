// app-paths.js
// Provides consistent path resolution for data and config files
// Schemas: Bundled in app (read-only)
// User Data: userData directory (writable)
// Works in dev, Windows, and Mac without dependencies on main process

const path = window.require('path');
const fs = window.require('fs');

// Detect if we're in development or production
// In dev: __dirname is /path/to/project/js
// In prod: __dirname contains .asar
const isDev = !__dirname.includes('.asar');

// Calculate userData path based on platform
// This matches Electron's app.getPath('userData') behavior
let userDataPath;
if (isDev) {
  // Development: use project directory for easy access
  userDataPath = path.join(process.cwd(), 'userData');
} else {
  // Production: use standard OS-specific paths
  const appName = 'ftrack';
  if (process.platform === 'win32') {
    userDataPath = path.join(process.env.APPDATA, appName);
  } else if (process.platform === 'darwin') {
    userDataPath = path.join(process.env.HOME, 'Library', 'Application Support', appName);
  } else {
    // Linux
    userDataPath = path.join(process.env.HOME, '.config', appName);
  }
}

// Bundled assets path (schemas, read-only)
let bundledAssetsPath;
if (isDev) {
  // Development: assets in project directory
  bundledAssetsPath = path.join(process.cwd(), 'assets');
} else {
  // Production: assets in app.asar (one level up from __dirname which is /app.asar/js)
  bundledAssetsPath = path.join(__dirname, '..', 'assets');
}

// User assets path (app-data.json, writable)
const userAssetsPath = path.join(userDataPath, 'assets');

/**
 * Get path to user's app-data.json (writable)
 * @returns {string} - Full path to user data file
 */
export function getAppDataPath() {
  return path.join(userAssetsPath, 'app-data.json');
}

/**
 * Get path to a grid schema file (read-only, bundled)
 * @param {string} schemaName - Name of schema file (e.g., 'accounts-grid-unified.json')
 * @returns {string} - Full path to schema file
 */
export function getSchemaPath(schemaName) {
  return path.join(bundledAssetsPath, schemaName);
}
