// periodic-change-utils.js
// Utilities for periodic change display and ID expansion

import { loadLookup } from '../../app/services/lookup-service.js';

// Cache for lookup data
let lookupDataCache = null;

/**
 * Load lookup data from file
 * @returns {Promise<Object>} - Lookup data object
 */
async function loadLookupData() {
  if (lookupDataCache) return lookupDataCache;

  lookupDataCache = await loadLookup('lookup-data.json');
  return lookupDataCache;
}

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
    return null;
  }
  
  const expanded = {
    value: pc.value,
    changeMode: mode,
    changeType: type
  };

  // Rate period is used for nominal-period-aware change types.
  // - changeType=7 stores its settings in customCompounding (kept below)
  // - changeType=8 uses ratePeriod as the nominal period selector
  if (pc.ratePeriod && (pc.changeType === 7 || pc.changeType === 8)) {
    const ratePeriod = lookupData.ratePeriods.find((rp) => rp.id === pc.ratePeriod);
    if (ratePeriod) {
      expanded.ratePeriod = ratePeriod;
    }
  }
  
  // For Fixed Amount mode: period defines the application frequency
  if (pc.period) {
    const period = lookupData.frequencies.find(f => f.id === pc.period);
    expanded.period = period;
  }
  
  // For custom compounding (changeType ID 7): frequency and ratePeriod define compounding
  if (pc.changeType === 7) {
    // Extract rate period if provided
    if (pc.ratePeriod) {
      const ratePeriod = lookupData.ratePeriods.find(rp => rp.id === pc.ratePeriod);
      expanded.ratePeriod = ratePeriod;
    }
    
    // For custom compounding, 'frequency' at top level becomes customCompounding.frequency
    if (pc.frequency !== undefined) {
      expanded.customCompounding = {
        period: pc.ratePeriod || 1, // Rate period becomes compounding period (usually Annual)
        frequency: pc.frequency // Compounding frequency per period
      };
    } else if (pc.customCompounding) {
      // Or use explicitly provided customCompounding structure
      expanded.customCompounding = pc.customCompounding;
    }
  }
  
  // For legacy/compatibility: preserve frequency if provided (but not for custom type)
  if (pc.frequency && pc.changeType !== 7) {
    const freq = lookupData.frequencies.find(f => f.id === pc.frequency);
    expanded.frequency = freq;
  }
  
  return expanded;
}

/**
 * Get human-readable description of periodic change
 * @param {Object} pc - Periodic change with ID-only references
 * @returns {Promise<string>} - Display text (empty string if no periodic change)
 */
export async function getPeriodicChangeDescription(pc) {
  if (!pc?.value) return '';
  
  const lookupData = await loadLookupData();
  const mode = lookupData.changeModes.find(m => m.id === pc.changeMode);
  const type = lookupData.periodicChangeTypes.find(t => t.id === pc.changeType);
  const freq = pc.frequency ? lookupData.frequencies.find(f => f.id === pc.frequency) : null;
  const nominalRatePeriod = pc.ratePeriod ? lookupData.ratePeriods.find(rp => rp.id === pc.ratePeriod) : null;
  
  const value = pc.value;
  const modeName = mode?.name;
  const typeName = type?.name;
  const freqName = freq?.name?.toLowerCase();
  
  if (modeName === 'Fixed Amount') {
    const frequencyText = freqName || 'per period';
    let scheduleText = '';
    
    // Add day of month if specified (e.g., "on 15th")
    if (pc.dayOfMonth) {
      const day = pc.dayOfMonth;
      const suffix = day === 1 || day === 21 || day === 31 ? 'st' : 
                     day === 2 || day === 22 ? 'nd' : 
                     day === 3 || day === 23 ? 'rd' : 'th';
      scheduleText = ` on ${day}${suffix}`;
    }
    
    // Add day of week if specified (e.g., "on Monday")
    if (pc.dayOfWeek) {
      const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const weekPrefix = pc.weekOfMonth ? 
        (pc.weekOfMonth === -1 ? 'last ' : ['', '1st ', '2nd ', '3rd ', '4th '][pc.weekOfMonth]) : '';
      scheduleText = ` on ${weekPrefix}${days[pc.dayOfWeek]}`;
    }
    
    return `$${value.toFixed(2)} ${frequencyText}${scheduleText}`;
  }
  
  // Custom nominal/compounding
  if (type?.id === 8) {
    const nominalName = nominalRatePeriod?.name?.toLowerCase() || 'annual';
    const compName = freq?.name?.toLowerCase() || 'monthly';
    return `${value}% nominal ${nominalName}, compounded ${compName}`;
  }

  // Handle custom compounding
  if (typeName?.includes('Custom') && pc.customCompounding?.frequency) {
    const compFreq = pc.customCompounding.frequency;
    const periodId = pc.customCompounding.period || 1; // Default to Annual
    
    const period = lookupData.ratePeriods.find(p => p.id === periodId);
    const periodName = period?.name?.toLowerCase() || 'annual';
    
    // Try to simplify common patterns
    let compDesc = `${compFreq}x/${periodName}`;
    
    if (periodId === 1) { // Annual
      if (compFreq === 1) compDesc = 'annually';
      else if (compFreq === 4) compDesc = 'quarterly';
      else if (compFreq === 12) compDesc = 'monthly';
      else if (compFreq === 52) compDesc = 'weekly';
      else if (compFreq === 365) compDesc = 'daily';
    } else if (periodId === 2 && compFreq === 30) { // Monthly with ~30 times
      compDesc = 'daily/month';
    } else if (periodId === 3 && compFreq === 4) { // Quarterly with 4 times
      compDesc = 'monthly/quarter';
    }
    
    return `${value}% compounded ${compDesc}`;
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
  if (typeName?.includes('Compounded Annually')) {
    return `${value}% annual, compounded annually`;
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
  if (typeName?.includes('Simple Interest') || typeName?.includes('No Compounding')) {
    return `${value}% simple interest`;
  }
  
  return `${value}% annual`;
}
