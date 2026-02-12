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
      recurrenceType: { id: 3, name: 'Weekly' },
      startDate: '2026-01-05',
      interval: 2,
      dayOfWeek: { id: 1, name: 'Monday' }
    };

    const tx = {
      id: 1,
      primaryAccountId: 1,
      secondaryAccountId: null,
      transactionTypeId: 1,
      amount: 100,
      effectiveDate: '2026-01-05',
      description: 'Recurring weekly',
      recurrence,
      status: { name: 'planned' }
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
      secondaryAccountId: null,
      transactionTypeId: 2,
      amount: 50,
      effectiveDate: '2026-01-15',
      description: 'One-off',
      recurrence: null,
      status: { name: 'planned' }
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
      transactionTypeId: 1,
      amount: 200,
      effectiveDate: '2026-01-10',
      status: { name: 'actual', actualDate: '2026-01-10' }
    };

    const actualOutRange = {
      id: 4,
      primaryAccountId: 1,
      transactionTypeId: 1,
      amount: 200,
      effectiveDate: '2026-02-10',
      status: { name: 'actual', actualDate: '2026-02-10' }
    };

    const expanded = transactionExpander.expandTransactions([actualInRange, actualOutRange], start, end);
    assert.strictEqual(expanded.length, 1);
    assert.strictEqual(expanded[0].effectiveDate, '2026-01-10');
  });
});
