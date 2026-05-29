import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() {
    this.items = new Map();
  }

  getItem(key) {
    return this.items.has(key) ? this.items.get(key) : null;
  }

  setItem(key, value) {
    this.items.set(key, String(value));
  }

  removeItem(key) {
    this.items.delete(key);
  }

  clear() {
    this.items.clear();
  }
}

globalThis.localStorage = new MemoryStorage();
globalThis.document = {
  createElement() {
    return {
      className: '',
      textContent: '',
      style: {},
      appendChild() {},
      addEventListener() {},
      remove() {}
    };
  },
  body: {
    appendChild() {}
  }
};
globalThis.requestAnimationFrame = (fn) => fn();

const { generateRecurrenceDates } = await import('../../js/domain/calculations/recurrence-calculations.js');
const { calculatePeriodicChange } = await import('../../js/domain/calculations/financial-calculations.js');
const DataStore = await import('../../js/app/services/storage-service.js');
const DataService = await import('../../js/app/services/data-service.js');
const { formatDateOnly, parseDateOnly } = await import('../../js/shared/date-utils.js');

function isoDates(dates) {
  return dates.map((date) => formatDateOnly(date));
}

function baseAppData(name = 'Seed') {
  return {
    schemaVersion: 43,
    uiState: {
      lastWorkflowId: 'general',
      lastScenarioId: 1,
      lastScenarioVersion: 1,
      viewPeriodTypeIds: {},
      accordionStates: {}
    },
    scenarios: [
      {
        id: 1,
        version: 1,
        name,
        description: null,
        lineage: null,
        accounts: [],
        accountGroups: [],
        splitTransactionSets: [],
        transactions: [],
        budgets: [],
        projection: {
          config: {
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            periodTypeId: 3,
            source: 'transactions'
          },
          rows: [],
          generatedAt: null
        },
        planning: null
      }
    ]
  };
}

test.beforeEach(async () => {
  globalThis.localStorage.clear();
  await DataStore.write(baseAppData());
});

test('recurrence generator handles month-end, leap-year, and custom dates', () => {
  const windowStart = parseDateOnly('2028-01-01');
  const windowEnd = parseDateOnly('2028-03-31');

  assert.deepEqual(
    isoDates(generateRecurrenceDates({
      recurrenceType: 4,
      startDate: '2028-01-31',
      dayOfMonth: 31
    }, windowStart, windowEnd)),
    ['2028-01-31', '2028-02-29', '2028-03-31']
  );

  assert.deepEqual(
    isoDates(generateRecurrenceDates({
      recurrenceType: 7,
      startDate: '2028-01-01',
      month: 2,
      dayOfYear: 29
    }, windowStart, windowEnd)),
    ['2028-02-29']
  );

  assert.deepEqual(
    isoDates(generateRecurrenceDates({
      recurrenceType: 11,
      startDate: '2028-01-01',
      customDates: '2028-01-05, 2028-03-10, 2028-04-01'
    }, windowStart, windowEnd)),
    ['2028-01-05', '2028-03-10']
  );
});

test('periodic change math covers fixed amount, nominal compounding, and custom compounding', () => {
  assert.equal(calculatePeriodicChange(100, {
    value: 10,
    changeMode: 2,
    changeType: 1,
    period: 3
  }, 1), 220);

  assert.ok(Math.abs(calculatePeriodicChange(1000, {
    value: 12,
    changeMode: 1,
    changeType: 2
  }, 1) - 1126.83) < 0.01);

  assert.ok(Math.abs(calculatePeriodicChange(1000, {
    value: 12,
    changeMode: 1,
    changeType: 8,
    ratePeriod: 1,
    frequency: 4
  }, 1) - 1125.51) < 0.01);
});

test('import replaces and merges app data while preserving current selection on merge', async () => {
  await DataService.importAppData(JSON.stringify(baseAppData('Replacement')), false);
  let data = await DataStore.read();
  assert.equal(data.scenarios.length, 1);
  assert.equal(data.scenarios[0].name, 'Replacement');

  await DataService.importAppData(JSON.stringify(baseAppData('Merged Scenario')), true);
  data = await DataStore.read();
  assert.equal(data.scenarios.length, 2);
  assert.deepEqual(data.scenarios.map((scenario) => scenario.id), [1, 2]);
  assert.equal(data.scenarios[1].name, 'Merged Scenario');
  assert.equal(data.uiState.lastScenarioId, null);
});

test('import rejects malformed and structurally invalid app data', async () => {
  await assert.rejects(() => DataService.importAppData('not json', false), /not valid JSON|Unexpected token/);
  await assert.rejects(
    () => DataService.importAppData(JSON.stringify({ schemaVersion: 43, uiState: {} }), false),
    /missing scenarios array/
  );
  await assert.rejects(
    () => DataService.importAppData(JSON.stringify({ schemaVersion: 43, scenarios: [] }), false),
    /missing uiState object/
  );
});
