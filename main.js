// main.js
// Main process for Electron app

const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      nodeIntegration: true, // ENABLE Node.js integration for renderer
      contextIsolation: false // DISABLE context isolation for window.require
      // preload: path.join(__dirname, 'preload.js') // Remove or comment out if not needed
    }
  });
  win.loadFile('pages/home.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    // On macOS, re-create a window when the dock icon is clicked and there are no other windows open
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
  // On macOS, do not quit the app when all windows are closed
});
