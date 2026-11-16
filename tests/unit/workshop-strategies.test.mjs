import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultAppData, sanitizeAppDataForWrite } from '../../js/shared/app-data-utils.js';
import { resolveWorkshopStrategy } from '../../js/shared/workshop-strategies.js';
import { validateAppData } from '../../js/app/services/validation-service.js';
import * as store from '../../js/app/services/storage-service.js';
import { saveWorkshopSetup } from '../../js/app/managers/scenario-manager.js';

const cache = new Map();
globalThis.localStorage = {
  getItem: key => cache.get(key) ?? null,
  setItem: (key, value) => cache.set(key, value),
  removeItem: key => cache.delete(key)
};

test('pre-release scenarios remain valid and resolve to their matching strategies', async () => {
  const data = sanitizeAppDataForWrite(createDefaultAppData({ scenarios: [
    { id: 1, name: 'Contribution', planning: { goalWorkshopMode: 'simple' } },
    { id: 2, name: 'Cascade', planning: { goalWorkshopMode: 'advanced' },
      advancedGoalSettings: { allocationStrategy: 'cascade', payoffOrder: 'snowball', goals: [] } },
    { id: 3, name: 'Business', planning: { workshopStrategy: 'business', businessModel: { minimumCash: '20' } } }
  ] }));
  assert.equal(validateAppData(data).isValid, true);
  assert.deepEqual(data.scenarios.map(resolveWorkshopStrategy), ['goal-contribution', 'snowball', 'business']);
  await store.write(data);
  await saveWorkshopSetup(2, { strategy: 'avalanche' });
  await saveWorkshopSetup(3, { strategy: 'goal-contribution' });
  const saved = await store.read();
  assert.deepEqual(saved.scenarios.map(scenario => scenario.id), [1, 2, 3]);
  assert.deepEqual(saved.scenarios.map(resolveWorkshopStrategy), ['goal-contribution', 'avalanche', 'goal-contribution']);
  assert.equal(saved.scenarios[1].advancedGoalSettings.payoffOrder, 'avalanche');
  assert.equal(saved.scenarios[2].planning.businessModel.minimumCash, '20');
  assert.equal(validateAppData(saved).isValid, true);
});

test('an unreadable or malformed workspace is not silently overwritten as empty', async () => {
  for (const invalid of ['{', '{"schemaVersion":46}']) {
    cache.set(store.STORAGE_KEY, invalid);
    await assert.rejects(store.read(), { name: 'LocalDataReadError' });
    await assert.rejects(store.transaction(data => data), { name: 'LocalDataReadError' });
    assert.equal(cache.get(store.STORAGE_KEY), invalid);
  }
  cache.delete(store.STORAGE_KEY);
  assert.deepEqual((await store.read()).scenarios, []);
});
