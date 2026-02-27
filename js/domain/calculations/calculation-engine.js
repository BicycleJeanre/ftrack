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

