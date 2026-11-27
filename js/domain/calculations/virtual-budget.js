// Pure, period-scoped Virtual budget calculation. Callers pass canonical
// resolved occurrences, whose amounts already include their line items.
// No storage writes, inferred account membership, or Workshop dependencies.

const BEHAVIORS = new Set(['standard', 'virtual']);
const MODES = new Set(['fixed', 'calculated']);
const key = (value) => value == null ? '' : String(value);
const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export function accountBehavior(account) {
  const behavior = account?.behavior === undefined ? 'standard' : account.behavior;
  if (!BEHAVIORS.has(behavior)) throw new TypeError(`Unknown account behavior: ${behavior}`);
  return behavior;
}

export function accountBehaviorAt(account, date) {
  if (!validDate(date)) throw new TypeError('A valid calculation date is required.');
  const behavior = accountBehavior(account);
  if (behavior === 'virtual' && account.behaviorEffectiveDate && date < account.behaviorEffectiveDate) return 'standard';
  return behavior;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function amount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Validate the allocation configuration before it can affect calculations.
 * One allocation defines one reporting window, one Virtual account, and one
 * funding parent. Explicit occurrence keys distinguish unrelated same-pair
 * payments. Effective-date migration expands configurations into these windows.
 */
export function validateVirtualBudgets({ accounts = [], allocations = [] } = {}) {
  const issues = [];
  const report = (code, id, message) => issues.push({ code, allocationId: id, message });
  if (!Array.isArray(accounts) || !Array.isArray(allocations)) {
    report('invalid-budget-collections', null, 'Accounts and allocations must be arrays.');
    return issues;
  }
  if (accounts.some((account) => !account || typeof account !== 'object') ||
      allocations.some((allocation) => !allocation || typeof allocation !== 'object')) {
    report('invalid-budget-record', null, 'Accounts and allocations must contain objects.');
    return issues;
  }
  const byAccount = new Map(accounts.map((account) => [key(account.id), account]));
  if (byAccount.size !== accounts.length || byAccount.has('')) {
    report('invalid-account-identity', null, 'Account IDs must be present and unique.');
  }
  const byId = new Set();
  const byVirtual = new Map();
  accounts.forEach((account) => {
    if (!BEHAVIORS.has(account.behavior === undefined ? 'standard' : account.behavior)) {
      report('unknown-account-behavior', null, `Account ${account.id} has an unsupported behavior.`);
    }
    if (account.behavior === 'virtual' && account.behaviorEffectiveDate !== undefined && !validDate(account.behaviorEffectiveDate)) {
      report('invalid-behavior-effective-date', null, `Account ${account.id} needs a valid behavior effective date.`);
    }
  });
  allocations.forEach((allocation) => {
    const id = key(allocation.id);
    const virtual = byAccount.get(key(allocation.virtualAccountId));
    const funding = byAccount.get(key(allocation.fundingAccountId));
    if (!id || byId.has(id)) report('duplicate-allocation-id', id, 'Allocation IDs must be present and unique.');
    byId.add(id);
    if (!virtual || virtual.behavior !== 'virtual') {
      report('invalid-virtual-account', id, 'The allocation must reference a Virtual account.');
    }
    if (virtual?.behaviorEffectiveDate && allocation.startDate < virtual.behaviorEffectiveDate) {
      report('allocation-before-conversion', id, 'An allocation cannot start before the Virtual behavior effective date.');
    }
    if (!funding || key(funding.id) === key(virtual?.id)) {
      report('invalid-funding-account', id, 'A distinct funding account is required.');
    }
    if (virtual && funding && key(virtual.currency?.id ?? virtual.currency) !== key(funding.currency?.id ?? funding.currency)) {
      report('currency-mismatch', id, 'Funding and Virtual accounts must use the same currency.');
    }
    if (!validDate(allocation.startDate) || !validDate(allocation.endDate) || allocation.startDate > allocation.endDate) {
      report('invalid-allocation-window', id, 'A valid inclusive reporting window is required.');
    }
    if (!MODES.has(allocation.mode)) report('invalid-budget-mode', id, 'Select fixed or calculated.');
    if (allocation.mode === 'fixed' && !amount(allocation.allowance)) {
      report('invalid-allowance', id, 'A fixed allowance must be a nonnegative finite number.');
    }
    if (allocation.baselineAmount != null && !amount(allocation.baselineAmount)) {
      report('invalid-baseline', id, 'A captured baseline must be a nonnegative finite number.');
    }
    if (typeof allocation.closed !== 'boolean') report('invalid-closure', id, 'Closure must be explicit.');
    if (!Array.isArray(allocation.detailOccurrenceKeys) || allocation.detailOccurrenceKeys.some((value) => !key(value))) {
      report('invalid-detail-links', id, 'Explicit detail occurrence keys are required.');
    } else if (new Set(allocation.detailOccurrenceKeys.map(key)).size !== allocation.detailOccurrenceKeys.length) {
      report('duplicate-detail-link', id, 'A detail occurrence cannot appear twice in an allocation.');
    }
    const virtualKey = key(allocation.virtualAccountId);
    const existing = byVirtual.get(virtualKey) || [];
    if (existing.some((other) => allocation.startDate <= other.endDate && allocation.endDate >= other.startDate)) {
      report('overlapping-allocation', id, 'A Virtual account can have only one funding parent in a reporting window.');
    }
    existing.push(allocation);
    byVirtual.set(virtualKey, existing);
  });

  // A Virtual funding parent must have the same reporting window. Keeping
  // windows aligned avoids silently prorating budgets across incompatible cuts.
  allocations.forEach((allocation) => {
    const funding = byAccount.get(key(allocation.fundingAccountId));
    if (funding?.behavior !== 'virtual') return;
    const parent = (byVirtual.get(key(funding.id)) || []).find((candidate) =>
      candidate.startDate === allocation.startDate && candidate.endDate === allocation.endDate);
    if (!parent) report('missing-parent-allocation', allocation.id, 'A Virtual parent needs an allocation for the same reporting window.');
  });

  const state = new Map();
  function visit(allocation) {
    if (state.get(allocation) === 1) {
      report('allocation-cycle', allocation.id, 'Virtual funding relationships cannot contain a cycle.');
      return;
    }
    if (state.get(allocation) === 2) return;
    state.set(allocation, 1);
    const parent = (byVirtual.get(key(allocation.fundingAccountId)) || []).find((candidate) =>
      candidate.startDate === allocation.startDate && candidate.endDate === allocation.endDate);
    if (parent) visit(parent);
    state.set(allocation, 2);
  }
  allocations.forEach(visit);
  return issues;
}

/**
 * Derive non-additive summaries without changing source occurrences/statuses.
 * For fixed open budgets, forecast is actual plus the larger of remaining
 * allowance and explicit detail commitments. Thus neither overruns nor known
 * future purchases disappear. Calculated budgets forecast detail commitments.
 * Closing releases remaining commitments, not actuals or captured baselines.
 */
export function resolveVirtualBudgets({ accounts = [], allocations = [], occurrences = [] } = {}) {
  const issues = validateVirtualBudgets({ accounts, allocations });
  if (issues.length) {
    const error = new Error(issues.map((issue) => issue.message).join(' '));
    error.code = 'invalid-virtual-budget';
    error.issues = issues;
    throw error;
  }
  if (!Array.isArray(occurrences)) throw new TypeError('Occurrences must be an array.');
  const occurrenceByKey = new Map();
  occurrences.forEach((occurrence) => {
    if (!occurrence || typeof occurrence !== 'object') throw new TypeError('Occurrences must contain objects.');
    const occurrenceKey = key(occurrence.occurrenceKey);
    if (!occurrenceKey || occurrenceByKey.has(occurrenceKey)) {
      throw new Error('Virtual budget resolution requires unique canonical occurrence keys.');
    }
    occurrenceByKey.set(occurrenceKey, occurrence);
  });
  const cache = new Map();
  const children = (allocation) => allocations.filter((candidate) =>
    key(candidate.fundingAccountId) === key(allocation.virtualAccountId) &&
    candidate.startDate === allocation.startDate && candidate.endDate === allocation.endDate);
  function resolve(allocation) {
    if (cache.has(allocation)) return cache.get(allocation);
    let detailedPlan = 0;
    let actualSpending = 0;
    let detailCommitments = 0;
    const sourceKeys = new Set();
    const addSource = (sourceKey) => {
      if (sourceKeys.has(sourceKey)) throw new Error('A source occurrence is counted more than once in a Virtual budget.');
      sourceKeys.add(sourceKey);
    };
    const childResults = children(allocation).map(resolve);
    childResults.forEach((child) => {
      detailedPlan += child.currentAllowance;
      actualSpending += child.actualSpending;
      detailCommitments += child.remainingCommitments;
      child.sourceOccurrenceKeys.forEach(addSource);
    });
    allocation.detailOccurrenceKeys.forEach((sourceKey) => {
      const occurrence = occurrenceByKey.get(key(sourceKey));
      if (!occurrence) throw new Error(`Missing Virtual detail occurrence: ${sourceKey}`);
      if (key(occurrence.primaryAccountId) !== key(allocation.virtualAccountId)) {
        throw new Error('A detail occurrence must use its Virtual account as primary account.');
      }
      const destination = accounts.find((account) => key(account.id) === key(occurrence.secondaryAccountId));
      if (!destination || accountBehavior(destination) === 'virtual') {
        throw new Error('Use an explicit child allocation for Virtual destinations.');
      }
      const owner = accounts.find((account) => key(account.id) === key(allocation.virtualAccountId));
      if (key(destination.currency?.id ?? destination.currency) !== key(owner.currency?.id ?? owner.currency)) {
        throw new Error('Cross-currency Virtual details are not supported.');
      }
      // Budget membership follows the scheduled occurrence, not the bank's
      // statement window or a delayed actual posting date.
      const date = occurrence.scheduledDate;
      if (!validDate(date) || date < allocation.startDate || date > allocation.endDate) {
        throw new Error('A linked detail occurrence must belong to the reporting window.');
      }
      if (![1, 2].includes(occurrence.transactionTypeId)) throw new Error('A detail needs an explicit money direction.');
      if (!['planned', 'actual', 'skipped'].includes(occurrence.status)) throw new Error('A detail needs a canonical status.');
      if (!amount(occurrence.plannedAmount) || (occurrence.status === 'actual' && !amount(occurrence.actualAmount))) {
        throw new Error('Virtual details must contain canonical nonnegative amounts.');
      }
      addSource(key(sourceKey));
      const sign = occurrence.transactionTypeId === 1 ? -1 : 1;
      if (occurrence.status === 'skipped') return;
      detailedPlan += sign * occurrence.plannedAmount;
      if (occurrence.status === 'actual') actualSpending += sign * occurrence.actualAmount;
      else detailCommitments += sign * occurrence.plannedAmount;
    });
    const currentAllowance = allocation.mode === 'fixed' ? allocation.allowance : Math.max(0, detailedPlan);
    const remainingAllowance = currentAllowance - actualSpending;
    const remainingCommitments = allocation.closed ? 0 : Math.max(0, detailCommitments,
      allocation.mode === 'fixed' ? remainingAllowance : 0);
    const result = {
      allocationId: allocation.id,
      virtualAccountId: allocation.virtualAccountId,
      fundingAccountId: allocation.fundingAccountId,
      startDate: allocation.startDate,
      endDate: allocation.endDate,
      mode: allocation.mode,
      baselineAmount: allocation.baselineAmount ?? null,
      currentAllowance: money(currentAllowance),
      detailedPlannedSpending: money(detailedPlan),
      actualSpending: money(actualSpending),
      remainingAllowance: money(remainingAllowance),
      overAllocated: money(Math.max(0, detailedPlan - currentAllowance)),
      overspent: money(Math.max(0, actualSpending - currentAllowance)),
      remainingCommitments: money(remainingCommitments),
      forecastAmount: money(actualSpending + remainingCommitments),
      closed: allocation.closed,
      // This is an allowance summary, never another asset or posting.
      isFinancialPosting: false,
      sourceOccurrenceKeys: [...sourceKeys].sort(),
      childAllocationIds: childResults.map((child) => child.allocationId)
    };
    cache.set(allocation, result);
    return result;
  }
  return allocations.map(resolve);
}
