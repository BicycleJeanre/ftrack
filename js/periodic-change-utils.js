// periodic-change-utils.js
// Utilities for periodic change display and ID expansion

import { loadLookupData } from './config.js';

/**
 * Convert periodic change IDs to full objects for calculations
 * @param {Object} pc - Periodic change with ID-only references
 * @param {Object} lookupData - Lookup data containing type/mode definitions
 * @returns {Object|null} - Expanded periodic change with full objects, or null if empty
 */
export function expandPeriodicChangeForCalculation(pc, lookupData) {
  if (!pc?.value) return null;
  
  const mode = lookupData.changeModes.find(m => m.id === pc.changeMode);
  const type = lookupData.periodicChangeTypes.find(t => t.id === pc.changeType);
  
  if (!mode || !type) {
    console.warn('[PeriodicChangeUtils] Invalid periodic change IDs:', pc);
    return null;
  }
  
  return {
    value: pc.value,
    changeMode: mode,
    changeType: type
  };
}

/**
 * Get human-readable description of periodic change
 * @param {Object} pc - Periodic change with ID-only references
 * @returns {string} - Display text (empty string if no periodic change)
 */
export function getPeriodicChangeDescription(pc) {
  if (!pc?.value) return '';
  
  const lookupData = loadLookupData();
  const mode = lookupData.changeModes.find(m => m.id === pc.changeMode);
  const type = lookupData.periodicChangeTypes.find(t => t.id === pc.changeType);
  
  const value = pc.value;
  const modeName = mode?.name;
  const typeName = type?.name;
  
  if (modeName === 'Fixed Amount') {
    return `$${value.toFixed(2)} fixed`;
  }
  
  if (typeName?.includes('Monthly')) {
    return `${value}% annual, compounded monthly`;
  }
  if (typeName?.includes('Daily')) {
    return `${value}% annual, compounded daily`;
  }
  if (typeName?.includes('Quarterly')) {
    return `${value}% annual, compounded quarterly`;
  }
  if (typeName?.includes('Semi-Annually')) {
    return `${value}% annual, compounded semi-annually`;
  }
  if (typeName?.includes('Continuous')) {
    return `${value}% continuous`;
  }
  if (typeName?.includes('Effective')) {
    return `${value}% effective annual`;
  }
  if (typeName?.includes('No Compounding')) {
    return `${value}% simple interest`;
  }
  
  return `${value}% annual`;
}
