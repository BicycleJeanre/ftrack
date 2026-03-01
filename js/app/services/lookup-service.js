/**
 * lookup-service.js
 * Cached loader for lookup JSON files (web-only)
 */

const cache = new Map();

/**
 * Load lookup data from assets folder
 * @param {string} schemaName - Name of lookup file (default: 'lookup-data.json')
 * @returns {Promise<Object>} - Parsed lookup data
 */
export async function loadLookup(schemaName = 'lookup-data.json') {
  if (cache.has(schemaName)) {
    return cache.get(schemaName);
  }

  // IMPORTANT: Use a relative assets path so GitHub Pages subpaths work (e.g. /ftrack/).
  // Absolute URLs like `/assets/...` break because they drop the repo base path.
  const lookupUrl = new URL(`../assets/${schemaName}`, window.location.href);
  const response = await fetch(lookupUrl.toString());
  const raw = await response.text();
  const parsed = JSON.parse(raw);
  
  cache.set(schemaName, parsed);
  return parsed;
}

