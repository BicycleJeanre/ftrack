/**
 * Mark a scenario projection as stale without discarding the last generated rows.
 * Call this inside the same DataStore transaction as the plan mutation.
 *
 * @param {Object} scenario
 * @param {string} reason
 * @param {string|null} timestamp
 * @returns {string|null}
 */
export function markProjectionStale(
  scenario,
  reason = 'Plan inputs changed',
  timestamp = null
) {
  if (!scenario || !scenario.projection) return null;

  const staleAt = timestamp || new Date().toISOString();
  scenario.projection = {
    ...scenario.projection,
    stale: true,
    staleAt,
    staleReason: String(reason || 'Plan inputs changed')
  };
  return staleAt;
}

/**
 * Notify visible UI consumers after a plan mutation has been persisted.
 * This is intentionally separate from markProjectionStale so it can be called
 * only after DataStore.transaction resolves successfully.
 *
 * @param {number|string} scenarioId
 */
export function dispatchPlanChanged(scenarioId) {
  if (
    typeof document === 'undefined' ||
    typeof document.dispatchEvent !== 'function' ||
    typeof CustomEvent !== 'function'
  ) {
    return;
  }

  try {
    document.dispatchEvent(new CustomEvent('forecast:planChanged', {
      detail: { scenarioId }
    }));
  } catch (_error) {
    // Persistence already succeeded. A UI notification failure must not turn a
    // successful command into an apparent data-write failure.
  }
}
