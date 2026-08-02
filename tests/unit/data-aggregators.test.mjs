import test from 'node:test';
import assert from 'node:assert/strict';

const {
  calculateBudgetTotals,
  calculateResolvedOccurrenceTotals
} = await import('../../js/ui/transforms/data-aggregators.js');

test('budget totals treat an explicit zero actual as resolved and add signed commitments to forecast', () => {
  const totals = calculateBudgetTotals([
    {
      transactionTypeId: 2,
      plannedAmount: -100,
      actualAmount: 0,
      status: { name: 'actual' }
    },
    {
      transactionTypeId: 2,
      plannedAmount: -50,
      actualAmount: null,
      status: { name: 'planned' }
    }
  ]);

  assert.equal(totals.actualNet, 0);
  assert.equal(totals.plannedOutstanding, -50);
  assert.equal(totals.plannedNetBalance, -50);
});

test('budget totals exclude skipped rows from current-plan and commitment totals', () => {
  const totals = calculateBudgetTotals([
    {
      transactionTypeId: 1,
      plannedAmount: 125,
      actualAmount: null,
      status: { name: 'skipped' }
    },
    {
      transactionTypeId: 2,
      plannedAmount: 100,
      actualAmount: null,
      status: { name: 'skipped' }
    }
  ]);

  assert.equal(totals.moneyIn, 0);
  assert.equal(totals.moneyOut, 0);
  assert.equal(totals.net, 0);
  assert.equal(totals.actualNet, 0);
  assert.equal(totals.plannedOutstanding, 0);
  assert.equal(totals.plannedNetBalance, 0);
  assert.equal(totals.unplanned, 0);
});

test('resolved occurrence totals compare baseline, current plan, actuals, commitments, and unbudgeted activity', () => {
  const totals = calculateResolvedOccurrenceTotals([
    {
      transactionTypeId: 1,
      baselineAmount: 1000,
      plannedAmount: 1100,
      actualAmount: 1050,
      status: 'actual',
      isIncludedInForecast: true
    },
    {
      transactionTypeId: 2,
      baselineAmount: 400,
      plannedAmount: 450,
      actualAmount: null,
      status: 'planned',
      isIncludedInForecast: true
    },
    {
      transactionTypeId: 2,
      baselineAmount: 0,
      plannedAmount: 0,
      actualAmount: 75,
      status: 'actual',
      isUnbudgetedActual: true,
      isIncludedInForecast: true
    },
    {
      transactionTypeId: 2,
      baselineAmount: 25,
      plannedAmount: 25,
      actualAmount: null,
      status: 'skipped',
      isIncludedInForecast: false
    }
  ]);

  assert.deepEqual(totals, {
    baselineIncome: 1000,
    baselineExpenses: 425,
    baselineNet: 575,
    currentPlannedIncome: 1100,
    currentPlannedExpenses: 450,
    currentPlannedNet: 650,
    actualIncome: 1050,
    actualExpenses: 75,
    actualNet: 975,
    remainingCommitments: -450,
    forecastNet: 525,
    actualVsBaselineVariance: 400,
    actualVsCurrentPlanVariance: 325,
    unbudgetedActuals: -75
  });
});

test('resolved occurrence totals keep frozen baseline direction separate from the current plan', () => {
  const totals = calculateResolvedOccurrenceTotals([{
    transactionTypeId: 1,
    baselineTransactionTypeId: 2,
    baselineAmount: 100,
    plannedAmount: 140,
    actualAmount: null,
    status: 'planned',
    isIncludedInForecast: true
  }]);

  assert.equal(totals.baselineIncome, 0);
  assert.equal(totals.baselineExpenses, 100);
  assert.equal(totals.baselineNet, -100);
  assert.equal(totals.currentPlannedIncome, 140);
  assert.equal(totals.currentPlannedNet, 140);
});
