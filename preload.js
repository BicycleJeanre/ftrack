const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('ftrackRuntime', {
  platform: process.platform
});
