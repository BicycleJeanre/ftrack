// main.js
// Main process for Electron app

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;

// Use standard Electron userData directory for writable files
let userDataPath;
if (isDev) {
  // Development: use project directory (matches app-paths.js)
  userDataPath = path.join(process.cwd(), 'userData');
} else {
  // Production: use Electron's userData path
  userDataPath = app.getPath('userData');
}

// Ensure logs directory exists
const logsPath = path.join(userDataPath, 'logs');
if (!fs.existsSync(logsPath)) {
  fs.mkdirSync(logsPath, { recursive: true });
}

// Setup debug logging
const debugLogPath = path.join(logsPath, 'debug.log');
// Clear log on startup
fs.writeFileSync(debugLogPath, `[${new Date().toISOString()}] App Started\n`);

function writeToLog(source, level, message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${source}] [${level}] ${message}\n`;
  try {
    fs.appendFileSync(debugLogPath, logLine);
    // Also echo to console for terminal visibility
    console.log(logLine.trim());
  } catch (err) {
    console.error('Failed to write to log:', err);
  }
}

// IPC Handlers for logging
ipcMain.on('log-message', (event, { source, level, message }) => {
  writeToLog(source, level, message);
});

const userAssetsPath = path.join(userDataPath, 'assets');

console.log('[Main] isDev:', isDev);
console.log('[Main] User data path:', userDataPath);
console.log('[Main] User assets path:', userAssetsPath);

/**
 * Initialize user data on first run
 * Copies bundled app-data.json to userData directory
 */
async function initializeUserData() {
  const userDataFile = path.join(userAssetsPath, 'app-data.json');
  
  // Check if user already has data
  if (!fs.existsSync(userDataFile)) {
    console.log('[Main] First run - initializing user data');
    
    // Create assets directory in userData
    fs.mkdirSync(userAssetsPath, { recursive: true });
    
    // Find bundled sample data
    const bundledDataPath = isDev
      ? path.join(process.cwd(), 'assets', 'app-data.sample.json')
      : path.join(process.resourcesPath, 'app.asar', 'assets', 'app-data.sample.json');
    
    console.log('[Main] Looking for bundled data at:', bundledDataPath);
    
    // Copy bundled sample data to writable location as app-data.json
    if (fs.existsSync(bundledDataPath)) {
      fs.copyFileSync(bundledDataPath, userDataFile);
      console.log('[Main] Sample data copied to:', userDataFile);
    } else {
      console.error('[Main] Bundled app-data.json not found at:', bundledDataPath);
    }
  } else {
    console.log('[Main] Using existing user data at:', userDataFile);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  win.loadFile('pages/home.html');
}

app.whenReady().then(async () => {
  await initializeUserData();
  createWindow();

  app.on('activate', function () {
    // On macOS, re-create a window when the dock icon is clicked and there are no other windows open
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', function () {
  // Quit the app when all windows are closed, including on macOS
  app.quit();
});
