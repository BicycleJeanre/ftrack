// Period-scoped what-if snapshots. These commands never mutate the live plan
// or mark projections stale; a snapshot is an isolated planning comparison.

import * as DataStore from '../services/storage-service.js';

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, clonePlain(child)])
  );
}

function findScenario(data, scenarioId) {
  const scenario = (data?.scenarios || []).find(
    (item) => Number(item?.id) === Number(scenarioId)
  );
  if (!scenario) throw new Error(`Scenario ${scenarioId} not found.`);
  if (!scenario.planning || typeof scenario.planning !== 'object') scenario.planning = {};
  if (!Array.isArray(scenario.planning.periodVariants)) {
    scenario.planning.periodVariants = [];
  }
  return scenario;
}

function findVariant(scenario, variantId) {
  const variant = scenario.planning.periodVariants.find(
    (item) => String(item?.id) === String(variantId)
  );
  if (!variant) throw new Error('The selected what-if snapshot no longer exists.');
  if (!Array.isArray(variant.occurrences)) variant.occurrences = [];
  return variant;
}

function normalizeStatus(value) {
  const status = String(value || 'planned').toLowerCase();
  return ['planned', 'actual', 'skipped'].includes(status) ? status : 'planned';
}

function snapshotOccurrence(raw, index, variantId) {
  const occurrence = clonePlain(raw || {});
  const scheduledDate = occurrence.effectiveDate || occurrence.scheduledDate || occurrence.plannedDate;
  const status = normalizeStatus(occurrence.status);
  return {
    ...occurrence,
    id: occurrence.id ?? `${variantId}-${index + 1}`,
    occurrenceKey: String(
      occurrence.occurrenceKey || `variant:${variantId}:occurrence:${index + 1}`
    ),
    scheduledDate,
    effectiveDate: scheduledDate,
    plannedDate: occurrence.plannedDate || scheduledDate,
    status,
    displayStatus: status,
    plannedAmount: Math.abs(Number(occurrence.plannedAmount || 0)),
    actualAmount: occurrence.actualAmount == null
      ? null
      : Math.abs(Number(occurrence.actualAmount || 0)),
    variantOrigin: occurrence.variantOrigin || 'base'
  };
}

async function transact(scenarioId, mutate) {
  let result;
  const data = await DataStore.transaction(async (appData) => {
    const scenario = findScenario(appData, scenarioId);
    result = await mutate(scenario);
    return appData;
  });
  return { data, scenario: findScenario(data, scenarioId), ...result };
}

export async function create(scenarioId, {
  name,
  periodType,
  periodId,
  startDate,
  endDate,
  occurrences = []
}) {
  return transact(scenarioId, (scenario) => {
    const now = new Date().toISOString();
    const id = `period-variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Enter a name for the what-if snapshot.');
    const variant = {
      id,
      name: cleanName,
      periodType: String(periodType || 'Month'),
      periodId: String(periodId || ''),
      startDate: String(startDate || ''),
      endDate: String(endDate || ''),
      createdAt: now,
      updatedAt: now,
      occurrences: occurrences.map((item, index) => snapshotOccurrence(item, index, id))
    };
    scenario.planning.periodVariants.push(variant);
    return { variant };
  });
}

export async function remove(scenarioId, variantId) {
  return transact(scenarioId, (scenario) => {
    const index = scenario.planning.periodVariants.findIndex(
      (item) => String(item?.id) === String(variantId)
    );
    if (index < 0) throw new Error('The selected what-if snapshot no longer exists.');
    const [variant] = scenario.planning.periodVariants.splice(index, 1);
    return { variant };
  });
}

export async function updateOccurrence(scenarioId, variantId, occurrenceKey, updates = {}) {
  return transact(scenarioId, (scenario) => {
    const variant = findVariant(scenario, variantId);
    const index = variant.occurrences.findIndex(
      (item) => String(item?.occurrenceKey) === String(occurrenceKey)
    );
    if (index < 0) throw new Error('The selected snapshot item no longer exists.');
    const current = variant.occurrences[index];
    if (normalizeStatus(current.status) === 'actual') {
      throw new Error('Actual history is read-only inside a what-if snapshot.');
    }
    const nextDate = updates.plannedDate || current.effectiveDate || current.scheduledDate;
    const next = snapshotOccurrence({
      ...current,
      ...clonePlain(updates),
      scheduledDate: nextDate,
      effectiveDate: nextDate,
      variantOrigin: current.variantOrigin || 'base'
    }, index, variant.id);
    variant.occurrences[index] = next;
    variant.updatedAt = new Date().toISOString();
    return { variant, occurrence: next };
  });
}

export async function createOccurrence(scenarioId, variantId, input = {}) {
  return transact(scenarioId, (scenario) => {
    const variant = findVariant(scenario, variantId);
    const index = variant.occurrences.length;
    const occurrence = snapshotOccurrence({
      ...clonePlain(input),
      id: `${variant.id}-${Date.now()}`,
      occurrenceKey: `variant:${variant.id}:occurrence:${Date.now()}-${index + 1}`,
      status: 'planned',
      actualAmount: null,
      actualDate: null,
      variantOrigin: 'manual'
    }, index, variant.id);
    variant.occurrences.push(occurrence);
    variant.updatedAt = new Date().toISOString();
    return { variant, occurrence };
  });
}

export async function duplicateOccurrence(scenarioId, variantId, occurrenceKey) {
  return transact(scenarioId, (scenario) => {
    const variant = findVariant(scenario, variantId);
    const source = variant.occurrences.find(
      (item) => String(item?.occurrenceKey) === String(occurrenceKey)
    );
    if (!source) throw new Error('The selected snapshot item no longer exists.');
    const index = variant.occurrences.length;
    const occurrence = snapshotOccurrence({
      ...clonePlain(source),
      id: `${variant.id}-${Date.now()}`,
      occurrenceKey: `variant:${variant.id}:occurrence:${Date.now()}-${index + 1}`,
      status: 'planned',
      actualAmount: null,
      actualDate: null,
      variantOrigin: 'manual'
    }, index, variant.id);
    variant.occurrences.push(occurrence);
    variant.updatedAt = new Date().toISOString();
    return { variant, occurrence };
  });
}

export async function deleteOccurrence(scenarioId, variantId, occurrenceKey) {
  return transact(scenarioId, (scenario) => {
    const variant = findVariant(scenario, variantId);
    const index = variant.occurrences.findIndex(
      (item) => String(item?.occurrenceKey) === String(occurrenceKey)
    );
    if (index < 0) throw new Error('The selected snapshot item no longer exists.');
    if (normalizeStatus(variant.occurrences[index].status) === 'actual') {
      throw new Error('Actual history is read-only inside a what-if snapshot.');
    }
    const [occurrence] = variant.occurrences.splice(index, 1);
    variant.updatedAt = new Date().toISOString();
    return { variant, occurrence };
  });
}
