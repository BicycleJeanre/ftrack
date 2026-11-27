import { resolveScenarioOccurrences } from './resolve-scenario-occurrences.js';
import { resolveVirtualBudgets, validateVirtualBudgets } from '../calculations/virtual-budget.js';

/**
 * Read-only integration boundary for dashboards, projections and agent queries.
 * Allocations remain explicit input until the persisted schema/command phase;
 * this query cannot enable behavior by saving unvalidated experimental fields.
 * Always resolves whole budget windows, even when the caller displays a subset.
 */
export function resolveScenarioVirtualBudgets({
  scenario, allocations = [], startDate, endDate, asOfDate = null, lookupData = null
} = {}) {
  // Use the canonical resolver's date validation even for an empty allocation
  // set, keeping this query's public window contract identical to other queries.
  const requested = resolveScenarioOccurrences({ scenario, startDate, endDate, asOfDate, lookupData });
  const issues = validateVirtualBudgets({ accounts: scenario?.accounts || [], allocations });
  if (issues.length) {
    const error = new Error('Virtual budget configuration failed validation.');
    error.code = 'invalid-virtual-budget';
    error.issues = issues;
    throw error;
  }
  const selected = allocations.filter((allocation) => allocation.startDate <= endDate && allocation.endDate >= startDate);
  const resolvedByWindow = new Map();
  const diagnostics = [];
  const budgets = [];
  selected.forEach((allocation) => {
    const windowKey = `${allocation.startDate}/${allocation.endDate}`;
    if (resolvedByWindow.has(windowKey)) return;
    const window = resolveScenarioOccurrences({ scenario, startDate: allocation.startDate,
      endDate: allocation.endDate, asOfDate, lookupData });
    const windowAllocations = selected.filter((candidate) => candidate.startDate === allocation.startDate && candidate.endDate === allocation.endDate);
    budgets.push(...resolveVirtualBudgets({ accounts: scenario?.accounts || [],
      allocations: windowAllocations, occurrences: window.occurrences }));
    diagnostics.push(...window.diagnostics);
    resolvedByWindow.set(windowKey, true);
  });
  return {
    // Ordinary occurrences are deliberately not replaced by summary rows here.
    // Financial posting integration must consume the explicit provenance and
    // produce funding effects once, rather than summing parent and child rows.
    occurrences: requested.occurrences,
    budgets,
    diagnostics: selected.length ? diagnostics : requested.diagnostics
  };
}
