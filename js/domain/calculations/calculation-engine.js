/**
 * calculation-engine.js
 * Calculation Engine Facade - Single entry point for all calculations
 * 
 * Usage:
 *   import * as Calc from './domain/calculations/calculation-engine.js';
 *   const result = Calc.calculatePeriodicChange(100, {type: 'percentage', value: 5}, 12);
 */

import * as FinancialCalc from './financial-calculations.js';
import * as RecurrenceCalc from './recurrence-calculations.js';

// Re-export calculation functions used by consumers
export const {
  calculatePeriodicChange
} = FinancialCalc;

// Re-export recurrence functions used by consumers
export const {
  generateRecurrenceDates
} = RecurrenceCalc;

