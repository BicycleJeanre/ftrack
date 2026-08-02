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
const { getRecurrenceDescription } = await import('../../js/domain/calculations/recurrence-utils.js');
const { calculatePeriodicChange } = await import('../../js/domain/calculations/financial-calculations.js');
const DataStore = await import('../../js/app/services/storage-service.js');
const DataService = await import('../../js/app/services/data-service.js');
const { getDefaultProjectionWindowDates } = await import('../../js/shared/app-data-utils.js');
const { formatDateOnly, parseDateOnly } = await import('../../js/shared/date-utils.js');
const { migrateAppData } = await import('../../js/shared/migration-utils.js');

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

test('monthly recurrence intervals preserve the start-month anchor when filtering one month', () => {
  assert.deepEqual(
    isoDates(generateRecurrenceDates({
      recurrenceType: { id: 4, name: 'Monthly - Day of Month' },
      startDate: '2026-01-01',
      interval: 2,
      dayOfMonth: 1
    }, parseDateOnly('2026-02-01'), parseDateOnly('2026-02-28'))),
    []
  );

  assert.deepEqual(
    isoDates(generateRecurrenceDates({
      recurrenceType: { id: 4, name: 'Monthly - Day of Month' },
      startDate: '2026-01-01',
      interval: 2,
      dayOfMonth: 1
    }, parseDateOnly('2026-03-01'), parseDateOnly('2026-03-31'))),
    ['2026-03-01']
  );
});

test('daily recurrence intervals preserve the saved start-date anchor in filtered windows', () => {
  assert.deepEqual(
    isoDates(generateRecurrenceDates({
      recurrenceType: { id: 2, name: 'Daily' },
      startDate: '2026-01-01',
      interval: 3
    }, parseDateOnly('2026-01-02'), parseDateOnly('2026-01-08'))),
    ['2026-01-04', '2026-01-07']
  );
});

test('recurrence summary includes the saved start date for recurring entries', () => {
  assert.equal(
    getRecurrenceDescription({
      recurrenceType: { id: 4, name: 'Monthly - Day of Month' },
      startDate: '2026-06-01',
      endDate: null,
      interval: 1,
      dayOfMonth: 1
    }),
    'Every month on day 1 from 2026-06-01'
  );

  assert.equal(
    getRecurrenceDescription({
      recurrenceType: { id: 1, name: 'One Time' },
      startDate: '2026-06-01'
    }),
    'One time on 2026-06-01'
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

test('projection as-of and open-commitment boundaries survive normalization', async () => {
  const imported = baseAppData('As-of projection');
  imported.scenarios[0].projection.config.asOfDate = '2026-06-15';
  imported.scenarios[0].projection.config.openCommitmentStartDate = '2026-01-01';

  await DataService.importAppData(JSON.stringify(imported), false);

  const config = (await DataStore.read()).scenarios[0].projection.config;
  assert.equal(config.asOfDate, '2026-06-15');
  assert.equal(config.openCommitmentStartDate, '2026-01-01');
});

test('projection config normalization drops invalid and misaligned date-policy values', async () => {
  const imported = baseAppData('Invalid projection policy');
  imported.scenarios[0].projection.config.asOfDate = '2026-02-30';
  imported.scenarios[0].projection.config.openCommitmentStartDate = '2025/12/31';

  await DataService.importAppData(JSON.stringify(imported), false);

  let config = (await DataStore.read()).scenarios[0].projection.config;
  assert.equal(Object.prototype.hasOwnProperty.call(config, 'asOfDate'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(config, 'openCommitmentStartDate'), false);

  imported.scenarios[0].projection.config.asOfDate = '2026-06-15';
  imported.scenarios[0].projection.config.openCommitmentStartDate = '2026-01-02';
  await DataService.importAppData(JSON.stringify(imported), false);

  config = (await DataStore.read()).scenarios[0].projection.config;
  assert.equal(config.asOfDate, '2026-06-15');
  assert.equal(Object.prototype.hasOwnProperty.call(config, 'openCommitmentStartDate'), false);
});

test('projection config normalization repairs invalid or inverted projection windows', async () => {
  const defaults = getDefaultProjectionWindowDates();
  const imported = baseAppData('Invalid projection window');
  imported.scenarios[0].projection.config.startDate = '2026-12-31';
  imported.scenarios[0].projection.config.endDate = '2026-01-01';

  await DataService.importAppData(JSON.stringify(imported), false);

  let config = (await DataStore.read()).scenarios[0].projection.config;
  assert.equal(config.startDate, defaults.startDate);
  assert.equal(config.endDate, defaults.endDate);

  imported.scenarios[0].projection.config.startDate = '2026-02-30';
  imported.scenarios[0].projection.config.endDate = 'not-a-date';
  await DataService.importAppData(JSON.stringify(imported), false);

  config = (await DataStore.read()).scenarios[0].projection.config;
  assert.equal(config.startDate, defaults.startDate);
  assert.equal(config.endDate, defaults.endDate);
});

test('legacy migration applies projection date-policy normalization before persistence', () => {
  const legacy = baseAppData('Legacy projection policy');
  legacy.schemaVersion = 42;
  legacy.scenarios[0].projection.config.asOfDate = '06/15/2026';
  legacy.scenarios[0].projection.config.openCommitmentStartDate = '2026-01-02';

  const config = migrateAppData(legacy).scenarios[0].projection.config;

  assert.equal(config.startDate, '2026-01-01');
  assert.equal(config.endDate, '2026-12-31');
  assert.equal(Object.prototype.hasOwnProperty.call(config, 'asOfDate'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(config, 'openCommitmentStartDate'), false);
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
