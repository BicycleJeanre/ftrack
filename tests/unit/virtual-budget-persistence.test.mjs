import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultAppData, sanitizeAppDataForWrite, CURRENT_SCHEMA_VERSION } from '../../js/shared/app-data-utils.js';
import { migrateAppData } from '../../js/shared/migration-utils.js';
import { validateAppData } from '../../js/app/services/validation-service.js';
import { encodeCloudSnapshot, decodeCloudSnapshot } from '../../js/app/services/cloud-snapshot-codec.js';
import { analyzeAppDataUpgrade } from '../../js/app/services/data-upgrade-service.js';
import * as Store from '../../js/app/services/storage-service.js';
import * as Budget from '../../js/app/managers/virtual-budget-manager.js';
import * as Account from '../../js/app/managers/account-manager.js';

const memory = new Map();
globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
const allocation = () => ({ id: 'running', virtualAccountId: 2, fundingAccountId: 1,
  fundingOccurrenceKey: 'occurrence:1', startDate: '2026-11-01', endDate: '2026-11-30',
  mode: 'fixed', allowance: 2000, baselineAmount: 2000, closed: false,
  detailOccurrenceKeys: ['occurrence:2'] });
function seed({ virtual = true } = {}) {
  const data = createDefaultAppData();
  data.scenarios = [{ id: 1, version: 1, name: 'Synthetic budget test',
    accounts: [1, 2, 3].map((id) => ({ id, name: `Synthetic ${id}`, type: 1, currency: 1,
      startingBalance: id === 1 ? 5000 : 0, openDate: '2026-01-01',
      behavior: virtual && id === 2 ? 'virtual' : 'standard',
      ...(virtual && id === 2 ? { behaviorEffectiveDate: '2026-11-01' } : {}) })),
    transactions: [], transactionOccurrences: [
      { id: 1, occurrenceKey: 'occurrence:1', origin: 'manual', status: 'planned', scheduledDate: '2026-11-01',
        primaryAccountId: 1, secondaryAccountId: 2, transactionTypeId: 2, plannedAmount: 2000 },
      { id: 2, occurrenceKey: 'occurrence:2', origin: 'manual', status: 'actual', scheduledDate: '2026-11-05', actualDate: '2026-11-05',
        primaryAccountId: 2, secondaryAccountId: 3, transactionTypeId: 2, plannedAmount: 500, actualAmount: 650 }
    ], virtualBudgetAllocations: [], timeframe: { startDate: '2026-01-01', endDate: '2026-12-31', periodTypeId: 3 }
  }];
  return sanitizeAppDataForWrite(data);
}

test('schema 46 migration keeps transactions and statement mappings intact, defaults to Standard', () => {
  const old = seed({ virtual: false }); old.schemaVersion = 46;
  old.scenarios[0].accounts.forEach((account) => delete account.behavior);
  delete old.scenarios[0].virtualBudgetAllocations;
  const original = structuredClone(old);
  const next = migrateAppData(old, { now: '2026-11-27T12:00:00Z' });
  assert.equal(next.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.ok(next.scenarios[0].accounts.every((account) => account.behavior === 'standard'));
  assert.deepEqual(next.scenarios[0].transactionOccurrences, original.scenarios[0].transactionOccurrences);
  assert.deepEqual(next.scenarios[0].statementMappings, original.scenarios[0].statementMappings);
  assert.deepEqual(next.scenarios[0].virtualBudgetAllocations, []);
  assert.equal(next.migrationReport.virtualAccountUpgrade.convertedVirtualAccounts, 0);
  assert.equal(validateAppData(next).isValid, true, JSON.stringify(validateAppData(next)));
  assert.deepEqual(old, original);
});

test('allocation settings survive storage, JSON and cloud chunks without changing source actuals', async () => {
  await Store.write(seed()); await Budget.save(1, allocation());
  const saved = await Store.read();
  assert.deepEqual(saved.scenarios[0].virtualBudgetAllocations, [allocation()]);
  assert.equal(validateAppData(saved).isValid, true, JSON.stringify(validateAppData(saved)));
  const encoded = await encodeCloudSnapshot(saved, { chunkBytes: 1024 });
  const decoded = await decodeCloudSnapshot(encoded, encoded.chunks);
  assert.deepEqual(decoded.scenarios[0].virtualBudgetAllocations, [allocation()]);
  assert.deepEqual(decoded.scenarios[0].accounts, saved.scenarios[0].accounts);
  assert.deepEqual(decoded.scenarios[0].transactionOccurrences, saved.scenarios[0].transactionOccurrences);
});

test('invalid links and conversion dates are checker failures, never silently removed', () => {
  const data = seed(); data.scenarios[0].virtualBudgetAllocations = [{ ...allocation(), detailOccurrenceKeys: ['missing'] }];
  const checked = analyzeAppDataUpgrade(data, { sourceKind: 'file' });
  assert.equal(checked.canApply, false);
  assert.deepEqual(checked.data.scenarios[0].virtualBudgetAllocations[0].detailOccurrenceKeys, ['missing']);
  data.scenarios[0].virtualBudgetAllocations = [{ ...allocation(), startDate: '2026-10-01' }];
  assert.equal(validateAppData(data).isValid, false);
});

test('close and reopen are deliberate commands; changing current allowance retains baseline', async () => {
  await Store.write(seed()); await Budget.save(1, allocation());
  await Budget.setClosed(1, 'running', true);
  await assert.rejects(() => Budget.save(1, { ...allocation(), allowance: 3000 }), /Reopen/);
  await Budget.setClosed(1, 'running', false);
  await Budget.save(1, { ...allocation(), allowance: 3000, baselineAmount: 999 });
  const saved = (await Store.read()).scenarios[0];
  assert.equal(saved.virtualBudgetAllocations[0].baselineAmount, 2000);
  assert.equal(saved.virtualBudgetAllocations[0].allowance, 3000);
  assert.equal(saved.transactionOccurrences[1].actualAmount, 650);
});

test('invalid allocation save is atomic and deleting a referenced account is blocked', async () => {
  await Store.write(seed()); await Budget.save(1, allocation());
  const before = await Store.read();
  await assert.rejects(() => Budget.save(1, { ...allocation(), fundingAccountId: 3 }), /identity/);
  assert.deepEqual(await Store.read(), before);
  await assert.rejects(() => Account.remove(1, 2), /Virtual budget/);
  assert.deepEqual(await Store.read(), before);
});

test('conversion keeps prior records untouched and ordinary account updates cannot bypass it', async () => {
  const data = seed({ virtual: false }); await Store.write(data);
  await assert.rejects(() => Account.update(1, 2, { behavior: 'virtual' }), /conversion command/);
  await Budget.convertAccount(1, 2, '2026-11-01');
  const after = (await Store.read()).scenarios[0];
  assert.equal(after.accounts[1].behavior, 'virtual');
  assert.equal(after.accounts[1].behaviorEffectiveDate, '2026-11-01');
  assert.deepEqual(after.transactionOccurrences, data.scenarios[0].transactionOccurrences);
  await assert.rejects(() => Budget.convertAccount(1, 3, '2026-02-30'), /valid effective/);
});

test('schema 46 in-app review reports a valid upgrade and retains historical recovery notes', () => {
  const old = seed({ virtual: false }); old.schemaVersion = 46;
  old.migrationReport = { fromSchemaVersion: 43, toSchemaVersion: 46,
    migratedAt: '2026-10-01T00:00:00Z', summary: { warningCount: 0, recoveryRecordCount: 0 }, scenarios: [] };
  const result = analyzeAppDataUpgrade(old, { sourceKind: 'browser' });
  assert.equal(result.canApply, true, JSON.stringify(result.validation));
  assert.equal(result.toSchemaVersion, 47);
  assert.equal(result.data.migrationReport.fromSchemaVersion, 43);
  assert.deepEqual(result.data.migrationReport.scenarios, old.migrationReport.scenarios);
  assert.ok(result.changes.some((entry) => entry.path === 'schemaVersion'));
});

test('nested persisted allocations validate parent-first and reject removing an active parent', async () => {
  const data = seed();
  data.scenarios[0].accounts.push({ id: 4, name: 'Synthetic sub-budget', type: 1, currency: 1,
    startingBalance: 0, openDate: '2026-01-01', behavior: 'virtual', behaviorEffectiveDate: '2026-11-01' });
  data.scenarios[0].transactionOccurrences[1].primaryAccountId = 4;
  data.scenarios[0].transactionOccurrences.push({ id: 3, occurrenceKey: 'occurrence:3', origin: 'manual',
    status: 'planned', scheduledDate: '2026-11-01', primaryAccountId: 2, secondaryAccountId: 4,
    transactionTypeId: 2, plannedAmount: 1000 });
  await Store.write(data);
  await Budget.save(1, { ...allocation(), baselineAmount: null, detailOccurrenceKeys: [] });
  await Budget.save(1, { ...allocation(), id: 'nested', virtualAccountId: 4, fundingAccountId: 2,
    fundingOccurrenceKey: 'occurrence:3', allowance: 1000 });
  const saved = await Store.read();
  assert.equal(validateAppData(saved).isValid, true, JSON.stringify(validateAppData(saved)));
  await assert.rejects(() => Budget.remove(1, 'running'), /same reporting window/);
  assert.deepEqual(await Store.read(), saved);
});
