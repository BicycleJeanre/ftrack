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

  const lookupPath = `/assets/${schemaName}`;
  const response = await fetch(lookupPath);
  const raw = await response.text();
  const parsed = JSON.parse(raw);
  
  cache.set(schemaName, parsed);
  return parsed;
}

/**
 * Clear lookup cache
 */
export function clearCache() {
  cache.clear();
}
