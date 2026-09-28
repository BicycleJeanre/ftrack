import { generateRecurrenceDates } from '../../domain/calculations/recurrence-calculations.js';
import { createLinkedOccurrenceKey } from '../../domain/queries/resolve-scenario-occurrences.js';
import { parseDateOnly } from '../../shared/date-utils.js';
import { markProjectionStale } from '../managers/projection-freshness.js';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sameId(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) return false;
  return String(left).trim() === String(right).trim();
}

function dateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.valueOf())) return null;
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function isGeneratedDate(rule, scheduledDate) {
  if (!rule?.recurrence || !scheduledDate) return false;
  const target = parseDateOnly(scheduledDate);
  if (!(target instanceof Date) || Number.isNaN(target.valueOf())) return false;
  return generateRecurrenceDates(rule.recurrence, target, target)
    .some((date) => dateKey(date) === scheduledDate);
}

function remainingReportCounts(report) {
  const issues = (report?.scenarios || []).flatMap((scenario) => scenario?.issues || []);
  return {
    warningCount: issues.length,
    recoveryRecordCount: issues.filter((issue) => issue?.recoveryRecord).length
  };
}

function recoveryIssueKey(scenarioIndex, issueIndex) {
  return `${scenarioIndex}:${issueIndex}`;
}

function findScenario(data, scenarioReport) {
  return data.scenarios?.[scenarioReport?.scenarioIndex] ||
    data.scenarios?.find((entry) => sameId(entry?.id, scenarioReport?.scenarioId));
}

function findOccurrence(scenario, issue) {
  const raw = issue?.recoveryRecord || {};
  const occurrenceId = issue?.sourceId ?? raw.id;
  const matches = (scenario?.transactionOccurrences || []).filter((entry) => (
    sameId(entry?.id, occurrenceId)
  ));
  return matches.length === 1 ? matches[0] : null;
}

function accountName(scenario, id) {
  return scenario?.accounts?.find((entry) => sameId(entry?.id, id))?.name || null;
}

function ruleLabel(rule, scenario) {
  const description = String(rule?.description || '').trim();
  if (description) return description;
  const primary = accountName(scenario, rule?.primaryAccountId);
  const secondary = accountName(scenario, rule?.secondaryAccountId);
  return [primary, secondary].filter(Boolean).join(' → ') || `Rule ${rule?.id}`;
}

/**
 * Describe retained converted-to-manual records for an explicit user review.
 */
export function listMigrationRecoveryReviewItems(input) {
  const items = [];
  (input?.migrationReport?.scenarios || []).forEach((scenarioReport, scenarioReportIndex) => {
    const scenario = findScenario(input, scenarioReport);
    if (!scenario) return;
    (scenarioReport?.issues || []).forEach((issue, issueIndex) => {
      if (!issue?.recoveryRecord || issue?.action !== 'converted-to-manual') return;
      const occurrence = findOccurrence(scenario, issue);
      if (!occurrence) return;
      const rules = (scenario.transactions || [])
        .filter((rule) => Boolean(rule?.recurrence))
        .map((rule) => ({
          id: rule.id,
          label: ruleLabel(rule, scenario),
          primaryAccountId: rule.primaryAccountId,
          secondaryAccountId: rule.secondaryAccountId
        }));
      items.push({
        key: recoveryIssueKey(scenarioReportIndex, issueIndex),
        scenarioId: scenario.id,
        scenarioName: scenario.name || `Scenario ${scenario.id}`,
        code: issue.code,
        message: issue.message,
        occurrenceId: occurrence.id,
        description: occurrence.description || issue.recoveryRecord?.description || `Occurrence ${occurrence.id}`,
        scheduledDate: occurrence.scheduledDate,
        status: occurrence.status,
        amount: occurrence.actualAmount ?? occurrence.plannedAmount ?? occurrence.baselineAmount,
        primaryAccount: accountName(scenario, occurrence.primaryAccountId),
        secondaryAccount: accountName(scenario, occurrence.secondaryAccountId),
        rules
      });
    });
  });
  return items;
}

/**
 * Apply explicit recovery decisions without mutating the provided app data.
 */
export function prepareMigrationRecoveryDecisions(input, decisions = [], { resolvedAt } = {}) {
  const data = cloneJson(input);
  const decisionByKey = new Map((decisions || []).map((decision) => [decision.key, decision]));
  const resolutions = [];
  const timestamp = resolvedAt || new Date().toISOString();

  (data.migrationReport?.scenarios || []).forEach((scenarioReport, scenarioReportIndex) => {
    const scenario = findScenario(data, scenarioReport);
    if (!scenario) return;
    const retainedIssues = [];
    (scenarioReport?.issues || []).forEach((issue, issueIndex) => {
      const key = recoveryIssueKey(scenarioReportIndex, issueIndex);
      const decision = decisionByKey.get(key);
      if (!decision) {
        retainedIssues.push(issue);
        return;
      }
      if (!issue?.recoveryRecord || issue?.action !== 'converted-to-manual') {
        throw new Error(`Recovery record ${key} cannot be reviewed manually.`);
      }
      const occurrence = findOccurrence(scenario, issue);
      if (!occurrence) throw new Error(`Occurrence for recovery record ${key} could not be identified uniquely.`);
      const resolution = {
        resolvedAt: timestamp,
        scenarioId: scenario.id,
        occurrenceId: occurrence.id,
        issueCode: issue.code,
        decision: decision.action
      };

      if (decision.action === 'confirm-manual') {
        occurrence.sourceTransactionId = null;
        occurrence.occurrenceKey = `occurrence:${occurrence.id}`;
      } else if (decision.action === 'remove') {
        const occurrenceIndex = scenario.transactionOccurrences.indexOf(occurrence);
        scenario.transactionOccurrences.splice(occurrenceIndex, 1);
        markProjectionStale(scenario, 'migration-recovery-transaction-removed', timestamp);
      } else if (decision.action === 'link') {
        const rules = (scenario.transactions || []).filter((rule) => sameId(rule?.id, decision.ruleId));
        const rule = rules.length === 1 ? rules[0] : null;
        const scheduledDate = decision.scheduledDate || occurrence.scheduledDate;
        if (!rule?.recurrence) throw new Error(`Select a valid recurring rule for recovery record ${key}.`);
        if (!isGeneratedDate(rule, scheduledDate)) {
          throw new Error(`${scheduledDate || 'The selected date'} is not generated by the selected recurring rule.`);
        }
        const role = occurrence.transactionGroupRole || issue.recoveryRecord?.transactionGroupRole || '';
        const linkedKey = createLinkedOccurrenceKey(rule.id, scheduledDate, role);
        const collision = (scenario.transactionOccurrences || []).some((entry) => (
          entry !== occurrence && entry?.occurrenceKey === linkedKey
        ));
        if (collision) throw new Error('The selected recurring occurrence is already linked to another record.');
        occurrence.sourceTransactionId = Number(rule.id);
        occurrence.scheduledDate = scheduledDate;
        occurrence.occurrenceKey = linkedKey;
        markProjectionStale(scenario, 'migration-recovery-transaction-linked', timestamp);
        resolution.sourceTransactionId = Number(rule.id);
        resolution.scheduledDate = scheduledDate;
      } else {
        throw new Error(`Unsupported recovery decision: ${decision.action}`);
      }
      resolutions.push(resolution);
    });
    scenarioReport.issues = retainedIssues;
  });

  if (data.migrationReport && resolutions.length) {
    const counts = remainingReportCounts(data.migrationReport);
    data.migrationReport.summary = {
      ...(data.migrationReport.summary || {}),
      warningCount: counts.warningCount,
      recoveryRecordCount: counts.recoveryRecordCount,
      resolvedRecoveryRecordCount:
        Number(data.migrationReport.summary?.resolvedRecoveryRecordCount || 0) + resolutions.length
    };
    data.migrationReport.resolutionHistory = [
      ...(data.migrationReport.resolutionHistory || []),
      ...resolutions
    ];
  }
  return { data, resolutions };
}

/**
 * Reconcile migration recovery notes whose original recurring identity can be
 * proven from current rule data. The input is never mutated.
 */
export function prepareMigrationRecoveryResolutions(input) {
  const data = cloneJson(input);
  const originalMigrationReport = data.migrationReport
    ? cloneJson(data.migrationReport)
    : null;
  const resolutions = [];
  const unresolved = [];

  for (const scenarioReport of data.migrationReport?.scenarios || []) {
    const scenario = findScenario(data, scenarioReport);
    if (!scenario) continue;

    const retainedIssues = [];
    for (const issue of scenarioReport?.issues || []) {
      if (issue?.code !== 'ambiguous-recurring-occurrence') {
        retainedIssues.push(issue);
        continue;
      }

      const raw = issue.recoveryRecord || {};
      const sourceId = raw.sourceTransactionId;
      const rules = (scenario.transactions || []).filter((rule) => sameId(rule?.id, sourceId));
      const occurrenceId = issue.sourceId ?? raw.id;
      const occurrences = (scenario.transactionOccurrences || []).filter((occurrence) => (
        sameId(occurrence?.id, occurrenceId) &&
        occurrence?.sourceTransactionId == null &&
        String(occurrence?.occurrenceKey || '') === `occurrence:${occurrence?.id}`
      ));
      const rule = rules.length === 1 ? rules[0] : null;
      const occurrence = occurrences.length === 1 ? occurrences[0] : null;
      const scheduledDate = occurrence?.scheduledDate || null;
      const role = occurrence?.transactionGroupRole || raw.transactionGroupRole || '';
      const linkedKey = rule && scheduledDate
        ? createLinkedOccurrenceKey(rule.id, scheduledDate, role)
        : null;
      const collision = linkedKey && (scenario.transactionOccurrences || []).some((entry) => (
        entry !== occurrence && entry?.occurrenceKey === linkedKey
      ));

      let reason = null;
      if (!sourceId) reason = 'The recovery record does not identify its original recurring rule.';
      else if (rules.length !== 1) reason = 'The original recurring rule could not be identified uniquely.';
      else if (occurrences.length !== 1) reason = 'The migrated manual occurrence could not be identified uniquely.';
      else if (!isGeneratedDate(rule, scheduledDate)) reason = 'The recovered date is not generated by the recurring rule.';
      else if (!linkedKey || collision) reason = 'Relinking would collide with an existing occurrence.';

      if (reason) {
        retainedIssues.push(issue);
        unresolved.push({
          scenarioId: scenario.id,
          sourceId: issue.sourceId ?? null,
          code: issue.code,
          reason
        });
        continue;
      }

      occurrence.sourceTransactionId = Number(rule.id);
      occurrence.occurrenceKey = linkedKey;
      resolutions.push({
        scenarioId: scenario.id,
        occurrenceId: occurrence.id,
        sourceTransactionId: Number(rule.id),
        scheduledDate,
        beforeOccurrenceKey: `occurrence:${occurrence.id}`,
        afterOccurrenceKey: linkedKey,
        reason: 'Relinked a migrated manual occurrence to its proven recurring schedule.'
      });
    }
    scenarioReport.issues = retainedIssues;
  }

  if (data.migrationReport) {
    const counts = remainingReportCounts(data.migrationReport);
    data.migrationReport.summary = {
      ...(data.migrationReport.summary || {}),
      warningCount: counts.warningCount,
      recoveryRecordCount: counts.recoveryRecordCount
    };
    if (counts.warningCount === 0) delete data.migrationReport;
  }

  return { data, resolutions, unresolved, originalMigrationReport };
}
