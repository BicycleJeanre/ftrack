const { describe, it, before } = require('node:test');
const assert = require('node:assert');

const {
  MS_PER_YEAR,
  buildScenario,
  getAccountProjections,
  getExpectedOutputs,
  getLookupData,
  loadCoreModules,
  roundToCents,
  toPeriodicChangeIds
} = require('./helpers');

const expectedOutputs = getExpectedOutputs();
const lookupData = getLookupData();
let calculationUtils;
let dateUtils;
let financialUtils;
let periodicChangeUtils;
let projectionEngine;

before(async () => {
  ({
    calculationUtils,
    dateUtils,
    financialUtils,
    periodicChangeUtils,
    projectionEngine
  } = await loadCoreModules());
});

describe('Projection Engine - Period Boundaries', () => {
  const runPeriodTest = async ({ startDate, endDate, periodicity, expectedDates }) => {
    const scenario = buildScenario({
      startDate,
      endDate,
      projectionPeriodName: 'Month',
      accounts: [
        {
          id: 1,
          name: 'A1',
          type: { id: 1, name: 'Asset' },
          currency: null,
          startingBalance: 0,
          openDate: startDate,
          periodicChange: null
        }
      ],
      transactions: []
    });

    const projections = await projectionEngine.generateProjectionsForScenario(
      scenario,
      { periodicity },
      lookupData
    );

    const dates = getAccountProjections(projections, 1).map((projection) => projection.date);
    assert.deepStrictEqual(dates, expectedDates);
  };

  it('generates daily period boundaries', async () => {
    await runPeriodTest({
      startDate: '2026-01-30',
      endDate: '2026-02-02',
      periodicity: 'daily',
      expectedDates: ['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']
    });
  });

  it('generates weekly period boundaries', async () => {
    await runPeriodTest({
      startDate: '2026-01-07',
      endDate: '2026-01-20',
      periodicity: 'weekly',
      expectedDates: ['2026-01-07', '2026-01-12', '2026-01-19']
    });
  });

  it('generates monthly period boundaries', async () => {
    await runPeriodTest({
      startDate: '2026-01-15',
      endDate: '2026-03-20',
      periodicity: 'monthly',
      expectedDates: ['2026-01-15', '2026-02-01', '2026-03-01']
    });
  });
});

describe('Projection Engine - Recurrence Integration', () => {
  expectedOutputs.functionTests.recurrenceDates.forEach((testCase) => {
    it(testCase.description, async () => {
      const startDate = testCase.projectionStart;
      const endDate = testCase.projectionEnd;
      const recurrence = testCase.recurrence;

      const scenario = buildScenario({
        startDate,
        endDate,
        projectionPeriodName: 'Month',
        accounts: [
          {
            id: 1,
            name: 'A1',
            type: 1,  // Asset
            currency: 1,  // ZAR
            startingBalance: 0,
            openDate: startDate,
            periodicChange: null,
            goalAmount: null,
            goalDate: null
          }
        ],
        transactions: [
          {
            id: 1,
            primaryAccountId: 1,
            secondaryAccountId: 1,
            transactionTypeId: 1,
            amount: 100,
            effectiveDate: startDate,
            description: 'QC recurrence integration',
            recurrence,
            periodicChange: null,
            status: { name: 'planned', actualAmount: null, actualDate: null },
            tags: []
          }
        ]
      });

      const projections = await projectionEngine.generateProjectionsForScenario(
        scenario,
        { periodicity: 'monthly' },
        lookupData
      );

      const recurrenceDates = calculationUtils.generateRecurrenceDates(
        recurrence,
        dateUtils.parseDateOnly(startDate),
        dateUtils.parseDateOnly(endDate)
      );

      const expectedBalance = roundToCents(recurrenceDates.length * 100);
      const lastProjection = projections[projections.length - 1];

      assert.strictEqual(
        lastProjection.balance,
        expectedBalance,
        `Expected balance ${expectedBalance}, got ${lastProjection.balance}`
      );
    });
  });
});

describe('Projection Engine - Account Periodic Change', () => {
  expectedOutputs.functionTests.applyPeriodicChangeAccounts.forEach((testCase) => {
    it(testCase.description, async () => {
      const startDate = '2026-01-01';
      const endDate = '2026-12-31';
      const periodicChange = toPeriodicChangeIds(testCase.periodicChange);

      const scenario = buildScenario({
        startDate,
        endDate,
        projectionPeriodName: 'Month',
        accounts: [
          {
            id: 1,
            name: 'A1',
            type: { id: 1, name: 'Asset' },
            currency: null,
            startingBalance: testCase.principal,
            openDate: startDate,
            periodicChange
          }
        ],
        transactions: []
      });

      const projections = await projectionEngine.generateProjectionsForScenario(
        scenario,
        { periodicity: 'monthly' },
        lookupData
      );

      const expandedPC = periodicChangeUtils.expandPeriodicChangeForCalculation(periodicChange, lookupData);
      assert.ok(expandedPC, 'Expected periodic change to expand for account integration test');

      const start = dateUtils.parseDateOnly(startDate);
      const end = dateUtils.parseDateOnly(endDate);
      const startMinusDay = new Date(start);
      startMinusDay.setDate(startMinusDay.getDate() - 1);
      startMinusDay.setHours(0, 0, 0, 0);

      const totalYears = (end - startMinusDay) / MS_PER_YEAR;
      const expectedBalance = roundToCents(
        financialUtils.applyPeriodicChange(testCase.principal, expandedPC, totalYears)
      );

      const lastProjection = projections[projections.length - 1];

      assert.strictEqual(
        lastProjection.balance,
        expectedBalance,
        `Expected balance ${expectedBalance}, got ${lastProjection.balance}`
      );
    });
  });
});

describe('Projection Engine - Transaction Periodic Change', () => {
  expectedOutputs.functionTests.applyPeriodicChangeTransactions.forEach((testCase) => {
    it(testCase.description, async () => {
      const startDate = '2026-01-01';
      const endDate = '2026-12-31';
      const periodicChange = toPeriodicChangeIds(testCase.periodicChange);
      const recurrence = {
        recurrenceType: { id: 4, name: 'Monthly - Day of Month' },
        startDate,
        endDate: null,
        interval: 1,
        dayOfWeek: null,
        dayOfMonth: 1,
        weekOfMonth: null,
        dayOfWeekInMonth: null,
        dayOfQuarter: null,
        month: null,
        dayOfYear: null,
        customDates: null,
        id: null
      };

      const scenario = buildScenario({
        startDate,
        endDate,
        projectionPeriodName: 'Month',
        accounts: [
          {
            id: 1,
            name: 'A1',
            type: { id: 1, name: 'Asset' },
            currency: null,
            startingBalance: 0,
            openDate: startDate,
            periodicChange: null
          }
        ],
        transactions: [
          {
            id: 1,
            primaryAccountId: 1,
            secondaryAccountId: null,
            transactionTypeId: 1,
            amount: 100,
            effectiveDate: startDate,
            description: 'QC transaction periodic change integration',
            recurrence,
            periodicChange,
            status: { name: 'planned' },
            tags: []
          }
        ]
      });

      const projections = await projectionEngine.generateProjectionsForScenario(
        scenario,
        { periodicity: 'monthly' },
        lookupData
      );

      const expandedPC = periodicChangeUtils.expandPeriodicChangeForCalculation(periodicChange, lookupData);
      assert.ok(expandedPC, 'Expected periodic change to expand for transaction integration test');

      const recurrenceDates = calculationUtils.generateRecurrenceDates(
        recurrence,
        dateUtils.parseDateOnly(startDate),
        dateUtils.parseDateOnly(endDate)
      );

      const start = dateUtils.parseDateOnly(startDate);
      const total = recurrenceDates.reduce((sum, date) => {
        const yearsDiff = (date - start) / MS_PER_YEAR;
        const adjustedAmount = financialUtils.applyPeriodicChange(100, expandedPC, yearsDiff);
        return sum + adjustedAmount;
      }, 0);

      const expectedBalance = roundToCents(total);
      const lastProjection = projections[projections.length - 1];

      assert.strictEqual(
        lastProjection.balance,
        expectedBalance,
        `Expected balance ${expectedBalance}, got ${lastProjection.balance}`
      );
    });
  });
});

describe('Projection Engine - Sign Handling', () => {
  it('applies money in/out for primary and secondary accounts', async () => {
    const startDate = '2026-01-01';
    const endDate = '2026-01-31';

    const scenario = buildScenario({
      startDate,
      endDate,
      projectionPeriodName: 'Month',
      accounts: [
        {
          id: 1,
          name: 'A1',
          type: { id: 1, name: 'Asset' },
          currency: null,
          startingBalance: 0,
          openDate: startDate,
          periodicChange: null
        },
        {
          id: 2,
          name: 'A2',
          type: { id: 1, name: 'Asset' },
          currency: null,
          startingBalance: 0,
          openDate: startDate,
          periodicChange: null
        }
      ],
      transactions: [
        {
          id: 1,
          primaryAccountId: 1,
          secondaryAccountId: 2,
          transactionTypeId: 1,
          amount: 100,
          effectiveDate: '2026-01-15',
          description: 'Money in',
          recurrence: null,
          periodicChange: null,
          status: { name: 'planned' }
        },
        {
          id: 2,
          primaryAccountId: 1,
          secondaryAccountId: 2,
          transactionTypeId: 2,
          amount: 40,
          effectiveDate: '2026-01-20',
          description: 'Money out',
          recurrence: null,
          periodicChange: null,
          status: { name: 'planned' }
        }
      ]
    });

    const projections = await projectionEngine.generateProjectionsForScenario(
      scenario,
      { periodicity: 'monthly' },
      lookupData
    );

    const a1Projection = getAccountProjections(projections, 1).slice(-1)[0];
    const a2Projection = getAccountProjections(projections, 2).slice(-1)[0];

    assert.strictEqual(a1Projection.balance, 60, 'Account 1 balance mismatch');
    assert.strictEqual(a2Projection.balance, -60, 'Account 2 balance mismatch');
  });
});

describe('Projection Engine - Interest Timing', () => {
  it('applies periodic change before and after transactions', async () => {
    const startDate = '2026-01-01';
    const endDate = '2026-01-31';
    const periodicChange = { value: 6, changeMode: 1, changeType: 2 };

    const scenario = buildScenario({
      startDate,
      endDate,
      projectionPeriodName: 'Month',
      accounts: [
        {
          id: 1,
          name: 'A1',
          type: { id: 1, name: 'Asset' },
          currency: null,
          startingBalance: 1000,
          openDate: startDate,
          periodicChange
        }
      ],
      transactions: [
        {
          id: 1,
          primaryAccountId: 1,
          secondaryAccountId: null,
          transactionTypeId: 1,
          amount: 100,
          effectiveDate: startDate,
          description: 'Interest timing',
          recurrence: null,
          periodicChange: null,
          status: { name: 'planned' }
        }
      ]
    });

    const projections = await projectionEngine.generateProjectionsForScenario(
      scenario,
      { periodicity: 'monthly' },
      lookupData
    );

    const expandedPC = periodicChangeUtils.expandPeriodicChangeForCalculation(periodicChange, lookupData);
    assert.ok(expandedPC, 'Expected periodic change to expand for interest timing test');

    const periodStart = dateUtils.parseDateOnly(startDate);
    const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0);
    periodEnd.setHours(23, 59, 59, 999);

    const startMinusDay = new Date(periodStart);
    startMinusDay.setDate(startMinusDay.getDate() - 1);
    startMinusDay.setHours(0, 0, 0, 0);

    const yearsToStart = (periodStart - startMinusDay) / MS_PER_YEAR;
    const yearsInPeriod = (periodEnd - periodStart) / MS_PER_YEAR;

    const beforeTx = financialUtils.applyPeriodicChange(1000, expandedPC, yearsToStart);
    const afterTx = beforeTx + 100;
    const expected = roundToCents(
      financialUtils.applyPeriodicChange(afterTx, expandedPC, yearsInPeriod)
    );

    const lastProjection = getAccountProjections(projections, 1).slice(-1)[0];
    assert.strictEqual(lastProjection.balance, expected);
  });
});

describe('Projection Engine - Performance Guardrails', () => {
  it('generates projections within a reasonable time', async () => {
    const startDate = '2026-01-01';
    const endDate = '2026-12-31';
    const accounts = Array.from({ length: 25 }, (_, idx) => ({
      id: idx + 1,
      name: `A${idx + 1}`,
      type: { id: 1, name: 'Asset' },
      currency: null,
      startingBalance: 1000,
      openDate: startDate,
      periodicChange: null
    }));

    const transactions = Array.from({ length: 50 }, (_, idx) => ({
      id: idx + 1,
      primaryAccountId: 1,
      secondaryAccountId: null,
      transactionTypeId: idx % 2 === 0 ? 1 : 2,
      amount: 25,
      effectiveDate: startDate,
      description: 'Perf tx',
      recurrence: {
        recurrenceType: { id: 4, name: 'Monthly - Day of Month' },
        startDate,
        endDate: null,
        interval: 1,
        dayOfWeek: null,
        dayOfMonth: 1,
        weekOfMonth: null,
        dayOfWeekInMonth: null,
        dayOfQuarter: null,
        month: null,
        dayOfYear: null,
        customDates: null,
        id: null
      },
      periodicChange: null,
      status: { name: 'planned' }
    }));

    const scenario = buildScenario({
      startDate,
      endDate,
      projectionPeriodName: 'Month',
      accounts,
      transactions
    });

    const startTime = Date.now();
    await projectionEngine.generateProjectionsForScenario(
      scenario,
      { periodicity: 'monthly' },
      lookupData
    );
    const duration = Date.now() - startTime;

    assert.ok(duration < 5000, `Projection generation took ${duration}ms`);
  });
});
