// lookup-loader.js
// Cached loader for bundled lookup JSON files

import { getSchemaPath } from './app-paths.js';
import { isElectronEnv } from './core/platform.js';

const cache = new Map();

export async function loadLookup(schemaName = 'lookup-data.json') {
  if (cache.has(schemaName)) {
    return cache.get(schemaName);
  }

  const lookupPath = getSchemaPath(schemaName);
  let raw;

  if (isElectronEnv()) {
    const fs = window.require('fs').promises;
    raw = await fs.readFile(lookupPath, 'utf8');
  } else {
    const response = await fetch(lookupPath);
    raw = await response.text();
  }

  const parsed = JSON.parse(raw);
  cache.set(schemaName, parsed);
  return parsed;
}
