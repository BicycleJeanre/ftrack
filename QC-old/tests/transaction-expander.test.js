const { describe, it, before } = require('node:test');
const assert = require('node:assert');

const { loadCoreModules } = require('./helpers');

let dateUtils;
let transactionExpander;

before(async () => {
  ({ dateUtils, transactionExpander } = await loadCoreModules());
});

describe('Transaction Expander', () => {
  it('expands planned recurring transactions within range', () => {
    const start = dateUtils.parseDateOnly('2026-01-01');
    const end = dateUtils.parseDateOnly('2026-02-01');

    const recurrence = {
      recurrenceType: 3,  // Weekly
      startDate: '2026-01-05',
      endDate: null,
      interval: 2,
      dayOfWeek: 1,  // Monday
      dayOfMonth: null,
      weekOfMonth: null,
      dayOfWeekInMonth: null,
      dayOfQuarter: null,
      month: null,
      dayOfYear: null,
      customDates: null,
      id: null
    };

    const tx = {
      id: 1,
      primaryAccountId: 1,
      secondaryAccountId: 1,
      transactionTypeId: 1,
      amount: 100,
      effectiveDate: '2026-01-05',
      description: 'Recurring weekly',
      recurrence,
      periodicChange: null,
      status: { name: 'planned', actualAmount: null, actualDate: null },
      tags: []
    };

    const expanded = transactionExpander.expandTransactions([tx], start, end);
    const dates = expanded.map((item) => item.effectiveDate);

    assert.deepStrictEqual(dates, ['2026-01-05', '2026-01-19']);
  });

  it('includes planned non-recurring transactions in range', () => {
    const start = dateUtils.parseDateOnly('2026-01-01');
    const end = dateUtils.parseDateOnly('2026-01-31');

    const tx = {
      id: 2,
      primaryAccountId: 1,
      secondaryAccountId: 1,
      transactionTypeId: 2,
      amount: 50,
      effectiveDate: '2026-01-15',
      description: 'One-off',
      recurrence: null,
      periodicChange: null,
      status: { name: 'planned', actualAmount: null, actualDate: null },
      tags: []
    };

    const expanded = transactionExpander.expandTransactions([tx], start, end);
    assert.strictEqual(expanded.length, 1);
    assert.strictEqual(expanded[0].effectiveDate, '2026-01-15');
  });

  it('includes actual transactions only when within range', () => {
    const start = dateUtils.parseDateOnly('2026-01-01');
    const end = dateUtils.parseDateOnly('2026-01-31');

    const actualInRange = {
      id: 3,
      primaryAccountId: 1,
      secondaryAccountId: 1,
      transactionTypeId: 1,
      amount: 200,
      effectiveDate: '2026-01-10',
      description: 'Actual in range',
      recurrence: null,
      periodicChange: null,
      status: { name: 'actual', actualAmount: 200, actualDate: '2026-01-10' },
      tags: []
    };

    const actualOutRange = {
      id: 4,
      primaryAccountId: 1,
      secondaryAccountId: 1,
      transactionTypeId: 1,
      amount: 200,
      effectiveDate: '2026-02-10',
      description: 'Actual out of range',
      recurrence: null,
      periodicChange: null,
      status: { name: 'actual', actualAmount: 200, actualDate: '2026-02-10' },
      tags: []

    };

    const expanded = transactionExpander.expandTransactions([actualInRange, actualOutRange], start, end);
    assert.strictEqual(expanded.length, 1);
    assert.strictEqual(expanded[0].effectiveDate, '2026-01-10');
  });
});
