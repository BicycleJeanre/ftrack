// Explicit application command allowlist. No module names or code come from agents.
export const AGENT_COMMANDS = {
  'scenario.create': ['Scenario', 'create', ['scenarioData']],
  'scenario.update': ['Scenario', 'update', ['scenarioId', 'updates']],
  'scenario.duplicate': ['Scenario', 'duplicate', ['scenarioId', 'newName']],
  'scenario.remove': ['Scenario', 'remove', ['scenarioId']],
  'workshop.save': ['Scenario', 'saveWorkshopSetup', ['scenarioId', 'setup']],
  'account.create': ['Account', 'create', ['scenarioId', 'accountData']],
  'account.update': ['Account', 'update', ['scenarioId', 'accountId', 'updates']],
  'account.remove': ['Account', 'remove', ['scenarioId', 'accountId']],
  'group.create': ['Scenario', 'createAccountGroup', ['scenarioId', 'groupData']],
  'group.update': ['Scenario', 'updateAccountGroup', ['scenarioId', 'groupId', 'updates']],
  'group.remove': ['Scenario', 'removeAccountGroup', ['scenarioId', 'groupId']],
  'group.memberships': ['Scenario', 'setAccountGroupMemberships', ['scenarioId', 'accountId', 'groupIds']],
  'reminder.create': ['Scenario', 'addReviewReminder', ['scenarioId', 'reminder']],
  'reminder.update': ['Scenario', 'updateReviewReminder', ['scenarioId', 'reminderId', 'reminder']],
  'reminder.remove': ['Scenario', 'removeReviewReminder', ['scenarioId', 'reminderId']],
  'rule.create': ['Occurrence', 'createRecurringRule', ['scenarioId', 'payload']],
  'rule.promote': ['Occurrence', 'promoteOccurrenceToRecurring', ['scenarioId', 'occurrenceKey', 'options']],
  'rule.thisAndFuture': ['Occurrence', 'updateThisAndFuture', ['scenarioId', 'occurrenceKey', 'updates']],
  'rule.entireSeries': ['Occurrence', 'updateEntireSeries', ['scenarioId', 'occurrenceKey', 'updates']],
  'rule.end': ['Occurrence', 'endSeries', ['scenarioId', 'occurrenceKey', 'options']],
  'rule.split': ['Occurrence', 'updateSplitSeries', ['scenarioId', 'occurrenceKey', 'options']],
  'occurrence.create': ['Occurrence', 'createManualOccurrence', ['scenarioId', 'payload']],
  'occurrence.update': ['Occurrence', 'updateOccurrenceOnly', ['scenarioId', 'occurrenceKey', 'updates']],
  'occurrence.actual': ['Occurrence', 'markActual', ['scenarioId', 'occurrenceKey', 'actual']],
  'occurrence.editActual': ['Occurrence', 'updateActualOccurrence', ['scenarioId', 'occurrenceKey', 'updates']],
  'occurrence.planned': ['Occurrence', 'restoreActualToPlanned', ['scenarioId', 'occurrenceKey', 'updates']],
  'occurrence.skip': ['Occurrence', 'markSkipped', ['scenarioId', 'occurrenceKey']],
  'occurrence.reschedule': ['Occurrence', 'rescheduleOccurrence', ['scenarioId', 'occurrenceKey', 'plannedDate']],
  'occurrence.remove': ['Occurrence', 'deleteOccurrencePermanently', ['scenarioId', 'occurrenceKey']],
  'baseline.freeze': ['Occurrence', 'freezePeriodBaseline', ['scenarioId', 'period']],
  'baseline.unfreeze': ['Occurrence', 'unfreezePeriodBaseline', ['scenarioId', 'period']],
  'baseline.unfreezeAll': ['Occurrence', 'unfreezeAllPeriodBaselines', ['scenarioId']],
  'baseline.clearOrphans': ['Occurrence', 'clearOrphanedBaselineSnapshots', ['scenarioId', 'occurrenceKeys']],
  'variant.create': ['Variant', 'create', ['scenarioId', 'variant']],
  'variant.remove': ['Variant', 'remove', ['scenarioId', 'variantId']],
  'variant.occurrenceCreate': ['Variant', 'createOccurrence', ['scenarioId', 'variantId', 'payload']],
  'variant.occurrenceUpdate': ['Variant', 'updateOccurrence', ['scenarioId', 'variantId', 'occurrenceKey', 'updates']],
  'variant.occurrenceRemove': ['Variant', 'deleteOccurrence', ['scenarioId', 'variantId', 'occurrenceKey']],
  'mapping.save': ['Statement', 'saveStatementMapping', ['scenarioId', 'rule']],
  'mapping.remove': ['Statement', 'removeStatementMappings', ['scenarioId', 'ids']],
  'mapping.update': ['Statement', 'updateStatementMappings', ['scenarioId', 'ids', 'changes']],
  'statement.retain': ['Statement', 'retainStatement', ['scenarioId', 'accountId', 'fileName', 'rawCsv']],
  'statement.apply': ['Occurrence', 'applyStatementDecisions', ['scenarioId', 'importId', 'decisions']],
  'projection.save': ['Projection', 'generateProjections', ['scenarioId', 'options']],
  'data.repair': ['Upgrade', 'repair', ['options']]
};

export const AGENT_READS = ['scenarios', 'scenario', 'accounts', 'rules', 'occurrences',
  'reminders', 'groups', 'variants', 'statements', 'statementSource', 'mappings', 'validation', 'upgradeReview', 'lookups'];
export const AGENT_CALCULATIONS = ['projections', 'workshop.preview', 'workshop.test', 'goals.solve', 'funds.report'];
export function agentCatalog() {
  return {
    commands: Object.entries(AGENT_COMMANDS).map(([operation, [, , args]]) => ({ operation, args })),
    reads: AGENT_READS, calculations: AGENT_CALCULATIONS,
    notes: [
      'All args are positional in the documented order. Optional trailing args may be omitted.',
      'Get a scenario/read lookups before editing. Use returned IDs and occurrenceKey, not names.',
      'Amounts are positive. transactionTypeId: 1 = Money In, 2 = Money Out, relative to primaryAccountId.',
      'occurrence.actual actual = {actualAmount,actualDate,lineItems?}; occurrence.create payload uses scheduledDate, plannedAmount/status.',
      'workshop.save setup = {strategy:"business",businessModel:{cashAccountId,variables,flows,testRanges,...}}.',
      'data.repair options use the existing upgrade checker: applySafeRepairs, applyMigrationResolutions, recoveryDecisions. Must pass validation.',
      'scenario.update accepts name, description, timeframe, advancedGoalSettings only; use dedicated commands for collections.',
      'Mutations require prepare, review the returned diff, then apply with approved:true. Never retry an uncertain apply with a new proposal.',
      'The app must be open, paired, and write permission explicitly enabled in the app. No authentication or cloud-security administration tools.'
    ]
  };
}

export function assertSafeAgentInput(value, depth = 0) {
  if (depth > 40) throw new Error('Input is nested too deeply.');
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsafe input key.');
      assertSafeAgentInput(child, depth + 1);
    }
  }
}
