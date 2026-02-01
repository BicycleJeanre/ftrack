// platform.js
// Centralized helpers for Electron vs Web environments

const isElectron = typeof window !== 'undefined' && typeof window.require !== 'undefined';

let cached;

function compute() {
  if (cached) return cached;

  if (!isElectron) {
    cached = {
      isElectron: false,
      isDev: false,
      platform: 'web',
      path: null,
      fs: null,
      userDataPath: '/ftrack-web/userData',
      bundledAssetsPath: '/assets',
      userAssetsPath: '/ftrack-web/userData/assets'
    };
    return cached;
  }

  const path = window.require('path');
  const fs = window.require('fs');
  const isDev = !__dirname.includes('.asar');

  const appName = 'ftrack';
  let userDataPath;

  if (isDev) {
    userDataPath = path.join(process.cwd(), 'userData');
  } else if (process.platform === 'win32') {
    userDataPath = path.join(process.env.APPDATA, appName);
  } else if (process.platform === 'darwin') {
    userDataPath = path.join(process.env.HOME, 'Library', 'Application Support', appName);
  } else {
    userDataPath = path.join(process.env.HOME, '.config', appName);
  }

  const bundledAssetsPath = isDev
    ? path.join(process.cwd(), 'assets')
    : path.join(__dirname, '..', 'assets');
  const userAssetsPath = path.join(userDataPath, 'assets');

  cached = {
    isElectron: true,
    isDev,
    platform: process.platform,
    path,
    fs,
    userDataPath,
    userAssetsPath,
    bundledAssetsPath
  };

  return cached;
}

export function isElectronEnv() {
  return isElectron;
}

export function isWebEnv() {
  return !isElectron;
}

export function getIsDev() {
  return compute().isDev;
}

export function getPathModule() {
  return compute().path;
}

export function getFsModule() {
  return compute().fs;
}

export function getFsPromises() {
  const fs = compute().fs;
  return fs ? fs.promises : null;
}

export function getUserDataPath() {
  return compute().userDataPath;
}

export function getUserAssetsPath() {
  return compute().userAssetsPath;
}

export function getBundledAssetsPath() {
  return compute().bundledAssetsPath;
}

export function getPlatformInfo() {
  const info = compute();
  return {
    isElectron: info.isElectron,
    isWeb: !info.isElectron,
    isDev: info.isDev,
    platform: info.platform,
    storageType: info.isElectron ? 'filesystem' : 'localStorage'
  };
}
