/**
 * In-app upgrade and validation center for uploaded JSON or browser data.
 */

import { createModal } from './modal-factory.js';
import {
  analyzeAppDataUpgrade,
  browserDataNeedsUpgradeReview,
  readRawBrowserData
} from '../../../app/services/data-upgrade-service.js?v=20260829-import-repair-6';
import { importAppData } from '../../../app/services/data-service.js';
import {
  downloadJsonData,
  selectJsonDataFile
} from '../../../app/services/export-service.js';
import { notifyError, notifySuccess } from '../../../shared/notifications.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatValue(value) {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function filenameBase(sourceLabel, sourceKind) {
  if (sourceKind === 'browser') return 'ftrack-browser-data';
  return String(sourceLabel || 'ftrack-data')
    .replace(/\.json$/i, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'ftrack-data';
}

function collectValidationIssues(validation) {
  const issues = [...(validation?.rootIssues || [])];
  for (const scenario of validation?.scenarios || []) {
    for (const entry of scenario?.issues || []) {
      issues.push({
        path: `scenario ${scenario.id ?? '?'}: ${entry.path}`,
        message: entry.message
      });
    }
  }
  return issues;
}

function renderHeader(title, required) {
  return `
    <div class="modal-header">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <p class="data-upgrade-kicker">Upgrade, compare, and validate without changing stored data.</p>
      </div>
      ${required ? '' : '<button class="icon-btn modal-close-btn" title="Close" aria-label="Close">✕</button>'}
    </div>
  `;
}

function groupChanges(changes) {
  const groups = new Map();
  for (const change of changes || []) {
    if (!groups.has(change.category)) groups.set(change.category, []);
    groups.get(change.category).push(change);
  }
  return groups;
}

function renderChangeGroups(analysis) {
  if (!analysis.changes.length) {
    return '<div class="data-upgrade-empty">No data changes are required.</div>';
  }

  const groups = groupChanges(analysis.visibleChanges);
  let html = '';
  for (const [category, changes] of groups) {
    const rows = changes.map((change) => `
      <li class="data-upgrade-change">
        <div class="data-upgrade-change-heading">
          <span class="data-upgrade-action data-upgrade-action--${escapeHtml(change.action)}">${escapeHtml(change.action)}</span>
          <code>${escapeHtml(change.path)}</code>
        </div>
        <div class="data-upgrade-change-values">
          <span>${escapeHtml(formatValue(change.before))}</span>
          <span aria-hidden="true">→</span>
          <span>${escapeHtml(formatValue(change.after))}</span>
        </div>
        <p>${escapeHtml(change.reason)}</p>
      </li>
    `).join('');
    html += `
      <details class="data-upgrade-group" open>
        <summary>${escapeHtml(category)} <span>${changes.length}</span></summary>
        <ul>${rows}</ul>
      </details>
    `;
  }

  if (analysis.changes.length > analysis.visibleChanges.length) {
    html += `
      <p class="data-upgrade-limit-note">
        Showing the first ${analysis.visibleChanges.length} of ${analysis.changes.length} changes.
        Download the change report for the complete list.
      </p>
    `;
  }
  return html;
}

function renderWarnings(analysis) {
  if (analysis.migrationResolutionApplied) {
    return `
      <div class="data-upgrade-repair-prepared">
        ${analysis.migrationResolutionProposal.resolvableCount} migrated occurrence${analysis.migrationResolutionProposal.resolvableCount === 1 ? '' : 's'}
        will be relinked to proven recurring rules and scheduled dates.
        ${analysis.warnings.length
          ? `${analysis.warnings.length} note${analysis.warnings.length === 1 ? '' : 's'} remain unresolved and are retained.`
          : 'All associated recovery notes are resolved.'}
        The downloaded change report retains the original recovery audit.
      </div>
    `;
  }
  if (!analysis.warnings.length) {
    return '<div class="data-upgrade-empty">No historical migration notes or retained recovery records.</div>';
  }
  const visibleWarnings = analysis.warnings.slice(0, 100);
  return `
    <p class="data-upgrade-history-note">
      These are historical notes from an earlier migration, not active validation
      failures. Retained source records remain in the downloadable change report.
    </p>
    ${analysis.migrationResolutionProposal?.available ? `
      <div class="data-upgrade-history-resolution">
        <div>
          <strong>${analysis.migrationResolutionProposal.resolvableCount} recurring occurrence link${analysis.migrationResolutionProposal.resolvableCount === 1 ? '' : 's'} can be resolved</strong>
          <span>
            FTrack proved the original rule, scheduled date, and collision-free occurrence
            identity for these records. Preview the relinks before applying them.
          </span>
        </div>
        <button type="button" class="icon-btn icon-btn--primary data-upgrade-migration-resolution">
          Preview Resolve Recurring Links
        </button>
      </div>
    ` : analysis.warnings.length ? `
      <div class="data-upgrade-history-note">
        No retained record can be relinked automatically without guessing. These notes
        remain unresolved and will not be removed.
      </div>
    ` : ''}
    <ul class="data-upgrade-issue-list">
      ${visibleWarnings.map((warning) => `
        <li>
          <strong>${escapeHtml(warning.code)}</strong>
          <span>${escapeHtml(warning.message)}</span>
          ${warning.action ? `<small>${escapeHtml(warning.action)}</small>` : ''}
          ${warning.hasRecoveryRecord ? '<span class="data-upgrade-recovery">Recovery record retained</span>' : ''}
        </li>
      `).join('')}
    </ul>
    ${analysis.warnings.length > visibleWarnings.length ? `
      <p class="data-upgrade-limit-note">
        Showing 100 of ${analysis.warnings.length} historical notes. Download the
        change report for the complete recovery audit.
      </p>
    ` : ''}
  `;
}

function renderValidation(analysis) {
  const issues = collectValidationIssues(analysis.validation);
  const repairPrepared = analysis.repairApplied ? `
    <div class="data-upgrade-repair-prepared">
      Safe repairs are included in this preview. Review What Changed before applying them.
    </div>
  ` : '';
  if (!issues.length) {
    return `
      <div class="vd-summary vd-summary--ok">
        <span class="vd-summary-icon">✓</span>
        All ${analysis.validation.scenarioCount} scenario(s) passed the current validation rules.
      </div>
      ${repairPrepared}
    `;
  }
  return `
    <div class="vd-summary vd-summary--error">
      <span class="vd-summary-icon">✗</span>
      Found ${issues.length} validation issue${issues.length === 1 ? '' : 's'}. Import and upgraded-data download are disabled.
    </div>
    ${analysis.repairProposal?.available && !analysis.repairApplied ? `
      <div class="data-upgrade-repair-offer">
        <div>
          <strong>${analysis.repairProposal.repairCount} safe repair${analysis.repairProposal.repairCount === 1 ? '' : 's'} available</strong>
          <span>
            These lossless normalizations should resolve
            ${analysis.repairProposal.resolvesIssueCount} issue${analysis.repairProposal.resolvesIssueCount === 1 ? '' : 's'}.
            ${analysis.repairProposal.remainingIssueCount
              ? `${analysis.repairProposal.remainingIssueCount} issue${analysis.repairProposal.remainingIssueCount === 1 ? '' : 's'} will still need manual correction.`
              : 'The repaired copy is expected to pass validation.'}
          </span>
        </div>
        <button type="button" class="icon-btn icon-btn--primary data-upgrade-repair">
          Preview Safe Repairs
        </button>
      </div>
    ` : ''}
    ${repairPrepared}
    <ul class="data-upgrade-issue-list">
      ${issues.map((entry) => `
        <li>
          <code>${escapeHtml(entry.path)}</code>
          <span>${escapeHtml(entry.message)}</span>
        </li>
      `).join('')}
    </ul>
  `;
}

function renderChooser(modal, { required, onUpload, onBrowser, onCancel }) {
  const browserSource = readRawBrowserData();
  modal.innerHTML = `
    ${renderHeader('Upgrade & Validate Data', required)}
    <div class="modal-body data-upgrade-body">
      <p class="data-upgrade-intro">
        Choose a source. FTrack analyzes a copy in memory and shows every detected
        schema change before anything is imported or replaced.
      </p>
      <div class="data-upgrade-source-grid">
        <button type="button" class="data-upgrade-source" data-source="file">
          <strong>Upload JSON File</strong>
          <span>Select an older export or a current FTrack backup.</span>
        </button>
        <button type="button" class="data-upgrade-source" data-source="browser" ${browserSource ? '' : 'disabled'}>
          <strong>Current Browser Data</strong>
          <span>${browserSource ? 'Analyze the raw data currently stored in this browser.' : 'No browser data is currently stored.'}</span>
        </button>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="icon-btn data-upgrade-cancel">Cancel</button>
    </div>
  `;

  modal.querySelector('[data-source="file"]')?.addEventListener('click', onUpload);
  modal.querySelector('[data-source="browser"]')?.addEventListener('click', onBrowser);
  modal.querySelector('.data-upgrade-cancel')?.addEventListener('click', onCancel);
  modal.querySelector('.modal-close-btn')?.addEventListener('click', onCancel);
}

function renderLoading(modal, required, sourceLabel) {
  modal.innerHTML = `
    ${renderHeader('Upgrade & Validate Data', required)}
    <div class="modal-body data-upgrade-body">
      <p class="vd-loading">Analyzing ${escapeHtml(sourceLabel)}…</p>
    </div>
  `;
}

function renderAnalysis(modal, analysis, {
  required,
  onApply,
  onDownloadData,
  onDownloadReport,
  onPrepareRepair,
  onPrepareMigrationResolution,
  onChooseAnother,
  onCancel
}) {
  const summary = analysis.report.summary;
  const versionLabel = `${analysis.fromSchemaVersion ?? 'Unknown'} → ${analysis.toSchemaVersion}`;
  const canApply = analysis.canApply &&
    (analysis.sourceKind === 'file' || analysis.changed || analysis.migrated);
  const canPrepareMigrationResolution = analysis.sourceKind === 'browser' &&
    analysis.migrationResolutionProposal?.available &&
    !analysis.migrationResolutionApplied &&
    !canApply;
  const applyLabel = analysis.sourceKind === 'browser'
    ? (analysis.migrationResolutionApplied
      ? 'Apply Resolved Recurring Links'
      : (canPrepareMigrationResolution
        ? 'Resolve Recurring Links'
        : (canApply
          ? (analysis.repairApplied ? 'Apply Safe Repairs to Browser Data' : 'Apply Upgrade to Browser Data')
          : (analysis.isValid ? 'Browser Data Is Current' : 'Repairs Required'))))
    : (analysis.migrated || analysis.changed ? 'Import Upgraded Data' : 'Import Validated Data');

  modal.innerHTML = `
    ${renderHeader('Data Upgrade Review', required)}
    <div class="modal-body data-upgrade-body">
      <div class="data-upgrade-summary-row">
        <div>
          <span>Source</span>
          <strong>${escapeHtml(analysis.sourceLabel)}</strong>
        </div>
        <div>
          <span>Schema</span>
          <strong>${escapeHtml(versionLabel)}</strong>
        </div>
        <div class="${analysis.isValid ? 'is-valid' : 'is-invalid'}">
          <span>Validation</span>
          <strong>${analysis.isValid ? 'Passed' : 'Failed'}</strong>
        </div>
      </div>

      <div class="data-upgrade-counts">
        <span><strong>${summary.fieldsAdded}</strong> added</span>
        <span><strong>${summary.fieldsChanged}</strong> changed</span>
        <span><strong>${summary.fieldsRemoved}</strong> removed</span>
        <span><strong>${summary.migrationWarnings}</strong> historical notes</span>
        <span><strong>${summary.recoveryRecords}</strong> retained source records</span>
      </div>

      <section class="data-upgrade-section">
        <h3>Validation</h3>
        ${renderValidation(analysis)}
      </section>

      <section class="data-upgrade-section">
        <h3>What Changed</h3>
        ${renderChangeGroups(analysis)}
      </section>

      <section class="data-upgrade-section">
        <h3>Historical Migration Notes</h3>
        ${renderWarnings(analysis)}
      </section>
    </div>
    <div class="modal-footer data-upgrade-footer">
      <button type="button" class="icon-btn data-upgrade-another">Choose Another Source</button>
      <button type="button" class="icon-btn data-upgrade-report">Download Change Report</button>
      <button type="button" class="icon-btn data-upgrade-data" ${analysis.canApply ? '' : 'disabled'}>Download Upgraded JSON</button>
      <button type="button" class="icon-btn icon-btn--primary data-upgrade-apply" ${canApply || canPrepareMigrationResolution ? '' : 'disabled'}>${escapeHtml(applyLabel)}</button>
      <button type="button" class="icon-btn data-upgrade-cancel">Cancel</button>
    </div>
  `;

  modal.querySelector('.data-upgrade-apply')?.addEventListener(
    'click',
    canPrepareMigrationResolution ? onPrepareMigrationResolution : onApply
  );
  modal.querySelector('.data-upgrade-data')?.addEventListener('click', onDownloadData);
  modal.querySelector('.data-upgrade-report')?.addEventListener('click', onDownloadReport);
  modal.querySelector('.data-upgrade-repair')?.addEventListener('click', onPrepareRepair);
  modal.querySelector('.data-upgrade-migration-resolution')?.addEventListener('click', onPrepareMigrationResolution);
  modal.querySelector('.data-upgrade-another')?.addEventListener('click', onChooseAnother);
  modal.querySelector('.data-upgrade-cancel')?.addEventListener('click', onCancel);
  modal.querySelector('.modal-close-btn')?.addEventListener('click', onCancel);
}

/**
 * Open the in-app upgrade center.
 *
 * @returns {Promise<boolean>} true only when prepared data was applied.
 */
export function openDataUpgradeModal({
  initialSource = null,
  required = false,
  reloadOnApply = true
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let currentAnalysis = null;
    let currentSource = null;
    const { modal, close } = createModal({
      contentClass: 'data-upgrade-modal validate-data-modal',
      closeOnOverlay: !required,
      closeOnEscape: !required,
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }
    });

    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      close();
    };

    const cancel = () => settle(false);

    const downloadReport = () => {
      if (!currentAnalysis) return;
      const base = filenameBase(currentAnalysis.sourceLabel, currentAnalysis.sourceKind);
      downloadJsonData(currentAnalysis.report, `${base}-change-report.json`);
    };

    const downloadData = () => {
      if (!currentAnalysis?.canApply || !currentAnalysis.data) return;
      const base = filenameBase(currentAnalysis.sourceLabel, currentAnalysis.sourceKind);
      downloadJsonData(currentAnalysis.data, `${base}-schema${currentAnalysis.toSchemaVersion}.json`);
    };

    const apply = async () => {
      if (!currentAnalysis?.canApply || !currentAnalysis.data) return;
      const applyButton = modal.querySelector('.data-upgrade-apply');
      if (applyButton) {
        applyButton.disabled = true;
        applyButton.setAttribute('aria-busy', 'true');
      }
      try {
        await importAppData(JSON.stringify(currentAnalysis.data), false);
        notifySuccess('Validated data applied successfully.');
        settle(true);
        if (reloadOnApply) {
          setTimeout(() => window.location.reload(), 500);
        }
      } catch (error) {
        notifyError(error.message || 'Unable to apply upgraded data.');
        if (applyButton) {
          applyButton.disabled = false;
          applyButton.removeAttribute('aria-busy');
        }
      }
    };

    const analyze = (source) => {
      currentSource = source;
      renderLoading(modal, required, source.sourceLabel);
      currentAnalysis = analyzeAppDataUpgrade(source.rawText, {
        sourceLabel: source.sourceLabel,
        sourceKind: source.sourceKind
      });
      renderAnalysis(modal, currentAnalysis, {
        required,
        onApply: apply,
        onDownloadData: downloadData,
        onDownloadReport: downloadReport,
        onPrepareRepair: prepareRepair,
        onPrepareMigrationResolution: prepareMigrationResolution,
        onChooseAnother: showChooser,
        onCancel: cancel
      });
    };

    const prepareRepair = () => {
      if (!currentSource || !currentAnalysis?.repairProposal?.available) return;
      renderLoading(modal, required, 'safe repair preview');
      currentAnalysis = analyzeAppDataUpgrade(currentSource.rawText, {
        sourceLabel: currentSource.sourceLabel,
        sourceKind: currentSource.sourceKind,
        applySafeRepairs: true
      });
      renderAnalysis(modal, currentAnalysis, {
        required,
        onApply: apply,
        onDownloadData: downloadData,
        onDownloadReport: downloadReport,
        onPrepareRepair: prepareRepair,
        onPrepareMigrationResolution: prepareMigrationResolution,
        onChooseAnother: showChooser,
        onCancel: cancel
      });
    };

    const prepareMigrationResolution = () => {
      if (!currentSource || !currentAnalysis?.migrationResolutionProposal?.available) return;
      renderLoading(modal, required, 'recurring-link resolution preview');
      currentAnalysis = analyzeAppDataUpgrade(currentSource.rawText, {
        sourceLabel: currentSource.sourceLabel,
        sourceKind: currentSource.sourceKind,
        applySafeRepairs: currentAnalysis.repairApplied,
        applyMigrationResolutions: true
      });
      renderAnalysis(modal, currentAnalysis, {
        required,
        onApply: apply,
        onDownloadData: downloadData,
        onDownloadReport: downloadReport,
        onPrepareRepair: prepareRepair,
        onPrepareMigrationResolution: prepareMigrationResolution,
        onChooseAnother: showChooser,
        onCancel: cancel
      });
    };

    const chooseFile = async () => {
      const selected = await selectJsonDataFile();
      if (!selected) return;
      analyze({
        sourceKind: 'file',
        sourceLabel: selected.name,
        rawText: selected.text
      });
    };

    const chooseBrowser = () => {
      const source = readRawBrowserData();
      if (!source) {
        notifyError('No browser data is currently stored.');
        return;
      }
      analyze(source);
    };

    function showChooser() {
      currentAnalysis = null;
      currentSource = null;
      renderChooser(modal, {
        required,
        onUpload: chooseFile,
        onBrowser: chooseBrowser,
        onCancel: cancel
      });
    }

    showChooser();
    if (initialSource === 'file') {
      void chooseFile();
    } else if (initialSource === 'browser') {
      chooseBrowser();
    }
  });
}

export async function ensureLegacyBrowserDataReviewed() {
  if (!browserDataNeedsUpgradeReview()) return true;
  return openDataUpgradeModal({
    initialSource: 'browser',
    required: true,
    reloadOnApply: false
  });
}
