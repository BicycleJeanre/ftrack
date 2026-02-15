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

// Re-export all financial calculations
export const {
  calculatePeriodicChange,
  calculateFutureValue,
  calculatePresentValue,
  calculateCompoundInterest,
  calculateEffectiveRate,
  calculatePayment,
  calculatePeriods
} = FinancialCalc;

// Re-export all recurrence calculations
export const {
  getNthWeekdayOfMonth,
  getQuartersBetween,
  getPeriodsBetween,
  generateRecurrenceDates
} = RecurrenceCalc;

// Engine metadata
export const ENGINE_VERSION = '1.0.0';
export const ENGINE_INFO = {
  version: ENGINE_VERSION,
  capabilities: [
    'financial-calculations',
    'recurrence-generation',
    'goal-planning',
    'projection-engine',
    'transaction-expansion'
  ]
};
