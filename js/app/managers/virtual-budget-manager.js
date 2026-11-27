// Transactional commands for Virtual allocations. They never copy child actuals
// into parent occurrence records; parent values remain derived from sources.
import * as Store from '../services/storage-service.js';
import { assertValidVirtualConfiguration } from '../../domain/queries/resolve-scenario-virtual-budgets.js';
import { markProjectionStale, dispatchPlanChanged } from './projection-freshness.js';

function findScenario(data, id) {
  const scenario = data.scenarios.find((entry) => Number(entry.id) === Number(id));
  if (!scenario) throw new Error('Scenario not found.');
  return scenario;
}

async function mutate(scenarioId, action) {
  const data = await Store.transaction(async (appData) => {
    const scenario = findScenario(appData, scenarioId);
    action(scenario);
    assertValidVirtualConfiguration(scenario);
    markProjectionStale(scenario, 'Virtual budget configuration changed');
    return appData;
  });
  dispatchPlanChanged(scenarioId);
  return data;
}

export async function save(scenarioId, allocation) {
  if (!allocation || !String(allocation.id || '').trim()) throw new Error('An allocation ID is required.');
  return mutate(scenarioId, (scenario) => {
    const entries = scenario.virtualBudgetAllocations || [];
    const existing = entries.find((entry) => String(entry.id) === String(allocation.id));
    if (existing?.closed) throw new Error('Reopen this allocation before changing it.');
    if (existing && ['virtualAccountId', 'fundingAccountId', 'startDate', 'endDate', 'fundingOccurrenceKey']
      .some((field) => existing[field] !== allocation[field])) {
      throw new Error('An existing allocation identity cannot be rewritten; create a new period allocation.');
    }
    const next = structuredClone(allocation);
    // A captured baseline is immutable; change the current allowance instead.
    if (existing?.baselineAmount != null) next.baselineAmount = existing.baselineAmount;
    scenario.virtualBudgetAllocations = [...entries.filter((entry) => String(entry.id) !== String(next.id)), next];
  });
}

export async function setClosed(scenarioId, allocationId, closed) {
  if (typeof closed !== 'boolean') throw new Error('Choose close or reopen explicitly.');
  return mutate(scenarioId, (scenario) => {
    const entry = scenario.virtualBudgetAllocations.find((row) => String(row.id) === String(allocationId));
    if (!entry) throw new Error('Virtual allocation not found.');
    entry.closed = closed;
  });
}

export async function remove(scenarioId, allocationId) {
  return mutate(scenarioId, (scenario) => {
    const entry = scenario.virtualBudgetAllocations.find((row) => String(row.id) === String(allocationId));
    if (!entry) throw new Error('Virtual allocation not found.');
    if (entry.closed || entry.baselineAmount != null) throw new Error('Reopen and retain captured allocation history rather than deleting it.');
    scenario.virtualBudgetAllocations = scenario.virtualBudgetAllocations.filter((row) => row !== entry);
    // Missing parent links or source references fail validation atomically.
  });
}

export async function convertAccount(scenarioId, accountId, effectiveDate) {
  return mutate(scenarioId, (scenario) => {
    const account = scenario.accounts.find((entry) => Number(entry.id) === Number(accountId));
    if (!account) throw new Error('Account not found.');
    if (account.behavior === 'virtual') throw new Error('This account already uses Virtual behavior.');
    if (typeof effectiveDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) ||
        !Number.isFinite(new Date(`${effectiveDate}T00:00:00Z`).valueOf()) ||
        new Date(`${effectiveDate}T00:00:00Z`).toISOString().slice(0, 10) !== effectiveDate) {
      throw new Error('Choose a valid effective budget-period start date.');
    }
    account.behavior = 'virtual';
    account.behaviorEffectiveDate = effectiveDate;
    // No starting balance, transaction, baseline, or actual is rewritten.
  });
}
