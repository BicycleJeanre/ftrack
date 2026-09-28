// Dedicated manager for explicit period closure and captured item baselines.

import { getScenarioPeriods } from '../../../app/services/data-service.js';
import * as OccurrenceManager from '../../../app/managers/occurrence-manager.js?v=20260926-delete-transaction-48';
import { formatDateOnly, parseDateOnly } from '../../../shared/date-utils.js';
import { confirmDialog, notifyError, notifySuccess } from '../../../shared/notifications.js';
import { createModal } from './modal-factory.js';

const PERIOD_TYPES = [
  { id: 1, name: 'Day' },
  { id: 2, name: 'Week' },
  { id: 3, name: 'Month' },
  { id: 4, name: 'Quarter' },
  { id: 5, name: 'Year' }
];

function periodTypeName(periodTypeId) {
  return PERIOD_TYPES.find((type) => type.id === Number(periodTypeId))?.name || 'Period';
}

function formatFrozenAt(value) {
  if (!value || Number.isNaN(Date.parse(value))) return 'Unknown time';
  return new Date(value).toLocaleString();
}

function markerLabel(marker) {
  const type = periodTypeName(marker?.periodTypeId);
  const start = String(marker?.startDate || '');
  const end = String(marker?.endDate || '');
  const parsed = parseDateOnly(start);
  if (type === 'Month' && parsed) {
    return parsed.toLocaleString('default', { month: 'long', year: 'numeric' });
  }
  if (type === 'Quarter' && parsed) {
    return `Q${Math.floor(parsed.getMonth() / 3) + 1} ${parsed.getFullYear()}`;
  }
  if (type === 'Year' && parsed) return String(parsed.getFullYear());
  if (type === 'Day' && parsed) {
    return parsed.toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
  return `${start} to ${end}`;
}

function markerIdentity(marker) {
  return `${Number(marker?.periodTypeId)}|${marker?.startDate}|${marker?.endDate}`;
}

function overlaps(left, right) {
  return Boolean(
    left?.startDate && left?.endDate && right?.startDate && right?.endDate &&
    left.startDate <= right.endDate && left.endDate >= right.startDate
  );
}

function baselineSnapshotCount(scenario, marker) {
  return (scenario?.transactionOccurrences || []).filter((occurrence) => (
    occurrence?.scheduledDate >= marker.startDate &&
    occurrence?.scheduledDate <= marker.endDate &&
    hasStoredBaselineSnapshot(occurrence)
  )).length;
}

function hasStoredBaselineSnapshot(occurrence) {
  return (
    Number(occurrence?.baselineSnapshotVersion) === 1 ||
    (
      occurrence?.baselineAmount !== null &&
      occurrence?.baselineAmount !== undefined
    )
  );
}

function markerContainsDate(marker, dateKey) {
  return Boolean(
    dateKey && marker?.startDate && marker?.endDate &&
    dateKey >= marker.startDate && dateKey <= marker.endDate
  );
}

function orphanedSnapshotGroups(scenario) {
  const markers = scenario?.baselinePeriods || [];
  const groups = new Map();
  (scenario?.transactionOccurrences || []).forEach((occurrence) => {
    const dateKey = String(occurrence?.scheduledDate || '');
    if (
      !hasStoredBaselineSnapshot(occurrence) ||
      markers.some((marker) => markerContainsDate(marker, dateKey))
    ) return;
    const monthId = /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
      ? dateKey.slice(0, 7)
      : 'unknown';
    if (!groups.has(monthId)) groups.set(monthId, []);
    groups.get(monthId).push(occurrence);
  });
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([monthId, occurrences]) => ({ monthId, occurrences }));
}

function orphanedGroupLabel(monthId) {
  if (!/^\d{4}-\d{2}$/.test(monthId)) return 'Unknown date';
  const parsed = parseDateOnly(`${monthId}-01`);
  return parsed
    ? parsed.toLocaleString('default', { month: 'long', year: 'numeric' })
    : monthId;
}

function monthIdForDate(date) {
  const value = formatDateOnly(date);
  return value ? value.slice(0, 7) : '';
}

export async function openBaselinePeriodManager({
  scenario,
  selectedDate = null,
  onChanged = null
} = {}) {
  if (!scenario?.id) {
    notifyError('Select a scenario before managing period history.');
    return { close: () => {} };
  }

  const { modal, close } = createModal({
    contentClass: 'modal-dialog baseline-period-manager-modal'
  });
  let currentScenario = scenario;
  let availablePeriods = [];

  modal.innerHTML = `
    <div class="modal-header baseline-period-manager-header">
      <div>
        <h2>Manage Period History</h2>
        <p>Close completed periods or review baselines captured for individual actual and skipped items.</p>
      </div>
      <button type="button" class="modal-close-btn" aria-label="Close">×</button>
    </div>
    <div class="modal-body baseline-period-manager-body">
      <section class="baseline-period-manager-freeze" aria-labelledby="baseline-freeze-title">
        <div class="baseline-period-manager-section-header">
          <div>
            <h3 id="baseline-freeze-title">Close one period</h3>
            <p>Closing captures every baseline in the period as protected history. This defaults to Month to avoid closing a whole year accidentally.</p>
          </div>
        </div>
        <div class="baseline-period-manager-fields">
          <label>
            <span>Period type</span>
            <select id="baseline-manager-period-type" class="input-select">
              ${PERIOD_TYPES.map((type) => `<option value="${type.id}">${type.name}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>Period</span>
            <select id="baseline-manager-period" class="input-select"></select>
          </label>
          <div class="baseline-period-manager-freeze-action">
            <button type="button" id="baseline-manager-freeze" class="btn btn-primary">Close selected period</button>
          </div>
        </div>
        <div id="baseline-manager-selection-note" class="baseline-period-manager-note"></div>
      </section>
      <section class="baseline-period-manager-list-section" aria-labelledby="baseline-frozen-title">
        <div class="baseline-period-manager-section-header">
          <div>
            <h3 id="baseline-frozen-title">Baseline history</h3>
            <p>Closed periods and individually captured baselines are shown separately. Actual and skipped transactions remain intact when a baseline is cleared.</p>
          </div>
          <span id="baseline-manager-count" class="baseline-period-manager-count"></span>
        </div>
        <div id="baseline-manager-list" class="baseline-period-manager-list"></div>
      </section>
    </div>
    <div class="modal-footer baseline-period-manager-footer">
      <button type="button" id="baseline-manager-unfreeze-all" class="btn btn-danger">Clear all baseline history</button>
      <button type="button" id="baseline-manager-close" class="btn btn-secondary">Close</button>
    </div>
  `;

  const typeSelect = modal.querySelector('#baseline-manager-period-type');
  const periodSelect = modal.querySelector('#baseline-manager-period');
  const freezeButton = modal.querySelector('#baseline-manager-freeze');
  const unfreezeAllButton = modal.querySelector('#baseline-manager-unfreeze-all');
  const selectionNote = modal.querySelector('#baseline-manager-selection-note');
  const list = modal.querySelector('#baseline-manager-list');
  const count = modal.querySelector('#baseline-manager-count');

  typeSelect.value = '3';

  const selectedPeriod = () => availablePeriods.find(
    (period) => String(period.id) === String(periodSelect.value)
  ) || null;

  const refreshSelectionState = () => {
    const period = selectedPeriod();
    if (!period) {
      freezeButton.disabled = true;
      selectionNote.textContent = 'No period is available in the scenario timeframe.';
      return;
    }
    const candidate = {
      periodTypeId: Number(typeSelect.value),
      startDate: formatDateOnly(period.startDate),
      endDate: formatDateOnly(period.endDate)
    };
    const exact = (currentScenario.baselinePeriods || []).find(
      (marker) => markerIdentity(marker) === markerIdentity(candidate)
    );
    const overlap = (currentScenario.baselinePeriods || []).find(
      (marker) => overlaps(marker, candidate)
    );
    freezeButton.disabled = Boolean(exact || overlap);
    if (exact) {
      selectionNote.textContent = `${period.label} is already closed.`;
    } else if (overlap) {
      selectionNote.textContent = `${period.label} overlaps closed ${periodTypeName(overlap.periodTypeId)}: ${markerLabel(overlap)}. Reopen that period first.`;
    } else {
      selectionNote.textContent = `${period.label}: ${candidate.startDate} to ${candidate.endDate}`;
    }
  };

  const refreshFrozenList = () => {
    const markers = [...(currentScenario.baselinePeriods || [])].sort((left, right) => (
      String(left.startDate).localeCompare(String(right.startDate)) ||
      Number(left.periodTypeId) - Number(right.periodTypeId)
    ));
    const orphanGroups = orphanedSnapshotGroups(currentScenario);
    const orphanCount = orphanGroups.reduce(
      (total, group) => total + group.occurrences.length,
      0
    );
    count.textContent = `${markers.length} closed period${markers.length === 1 ? '' : 's'} · ${orphanCount} individual baseline${orphanCount === 1 ? '' : 's'}`;
    unfreezeAllButton.disabled = markers.length === 0 && orphanCount === 0;
    list.innerHTML = '';

    if (!markers.length && !orphanCount) {
      const empty = document.createElement('div');
      empty.className = 'baseline-period-manager-empty';
      empty.textContent = 'No closed periods or captured item baselines. Baselines currently follow the live plan.';
      list.appendChild(empty);
      refreshSelectionState();
      return;
    }

    markers.forEach((marker) => {
      const row = document.createElement('article');
      row.className = 'baseline-period-manager-row';
      const details = document.createElement('div');
      details.className = 'baseline-period-manager-row-details';
      details.innerHTML = `
        <div class="baseline-period-manager-row-title">
          <span class="baseline-period-manager-type">${periodTypeName(marker.periodTypeId)}</span>
          <strong>${markerLabel(marker)}</strong>
        </div>
        <span>${marker.startDate} to ${marker.endDate}</span>
        <span>Closed ${formatFrozenAt(marker.frozenAt)} · ${baselineSnapshotCount(currentScenario, marker)} captured baseline(s)</span>
      `;
      const unfreeze = document.createElement('button');
      unfreeze.type = 'button';
      unfreeze.className = 'btn btn-secondary baseline-period-manager-unfreeze';
      unfreeze.textContent = 'Reopen';
      unfreeze.setAttribute('aria-label', `Reopen ${periodTypeName(marker.periodTypeId)} ${markerLabel(marker)}`);
      unfreeze.addEventListener('click', async () => {
        const confirmed = await confirmDialog(
          `Reopen ${periodTypeName(marker.periodTypeId)} ${markerLabel(marker)}? Actual and skipped transactions will remain.`
        );
        if (!confirmed) return;
        unfreeze.disabled = true;
        try {
          const result = await OccurrenceManager.unfreezePeriodBaseline(
            currentScenario.id,
            marker
          );
          currentScenario = result.scenario;
          notifySuccess(`${markerLabel(marker)} was reopened.`);
          refreshFrozenList();
          await onChanged?.(currentScenario);
        } catch (error) {
          unfreeze.disabled = false;
          notifyError(error?.message || String(error));
        }
      });
      row.appendChild(details);
      row.appendChild(unfreeze);
      list.appendChild(row);
    });

    if (orphanGroups.length) {
      const heading = document.createElement('div');
      heading.className = 'baseline-period-manager-subheading';
      heading.innerHTML = `
        <strong>Individual baselines</strong>
        <span>Actual and skipped items capture their own comparison baseline without closing the rest of the period.</span>
      `;
      list.appendChild(heading);
    }

    orphanGroups.forEach((group) => {
      const groupLabel = orphanedGroupLabel(group.monthId);
      const occurrenceKeys = group.occurrences.map(
        (occurrence) => occurrence.occurrenceKey
      );
      const dates = group.occurrences
        .map((occurrence) => occurrence.scheduledDate)
        .filter(Boolean)
        .sort();
      const row = document.createElement('article');
      row.className = 'baseline-period-manager-row is-unlinked';
      const details = document.createElement('div');
      details.className = 'baseline-period-manager-row-details';
      details.innerHTML = `
        <div class="baseline-period-manager-row-title">
          <span class="baseline-period-manager-type">Baseline captured</span>
          <strong>${groupLabel}</strong>
        </div>
        <span>${dates[0] || 'Unknown date'}${dates.length > 1 ? ` to ${dates[dates.length - 1]}` : ''}</span>
        <span>${group.occurrences.length} transaction baseline${group.occurrences.length === 1 ? '' : 's'} captured independently of period closure</span>
      `;
      const clearSnapshots = document.createElement('button');
      clearSnapshots.type = 'button';
      clearSnapshots.className = 'btn btn-secondary baseline-period-manager-unfreeze';
      clearSnapshots.textContent = 'Clear baselines';
      clearSnapshots.setAttribute('aria-label', `Clear stored baselines ${groupLabel}`);
      clearSnapshots.addEventListener('click', async () => {
        const confirmed = await confirmDialog(
          `Clear ${group.occurrences.length} stored baseline snapshot${group.occurrences.length === 1 ? '' : 's'} for ${groupLabel}? Actual and skipped transactions will remain.`
        );
        if (!confirmed) return;
        clearSnapshots.disabled = true;
        try {
          const result = await OccurrenceManager.clearOrphanedBaselineSnapshots(
            currentScenario.id,
            occurrenceKeys
          );
          currentScenario = result.scenario;
          notifySuccess(`${groupLabel} stored baselines were cleared.`);
          refreshFrozenList();
          await onChanged?.(currentScenario);
        } catch (error) {
          clearSnapshots.disabled = false;
          notifyError(error?.message || String(error));
        }
      });
      row.appendChild(details);
      row.appendChild(clearSnapshots);
      list.appendChild(row);
    });
    refreshSelectionState();
  };

  const loadAvailablePeriods = async () => {
    typeSelect.disabled = true;
    periodSelect.disabled = true;
    freezeButton.disabled = true;
    try {
      const type = periodTypeName(typeSelect.value);
      availablePeriods = await getScenarioPeriods(currentScenario.id, type);
      periodSelect.innerHTML = '';
      availablePeriods.forEach((period) => {
        const option = document.createElement('option');
        option.value = period.id;
        option.textContent = period.label || period.id;
        periodSelect.appendChild(option);
      });
      const preferredDate = selectedDate || formatDateOnly(new Date());
      const preferredMonth = monthIdForDate(preferredDate);
      const preferred = availablePeriods.find((period) => (
        String(typeSelect.value) === '3'
          ? String(period.id) === preferredMonth
          : preferredDate >= formatDateOnly(period.startDate) && preferredDate <= formatDateOnly(period.endDate)
      ));
      if (preferred) periodSelect.value = preferred.id;
    } catch (error) {
      availablePeriods = [];
      periodSelect.innerHTML = '';
      notifyError(error?.message || String(error));
    } finally {
      typeSelect.disabled = false;
      periodSelect.disabled = false;
      refreshSelectionState();
    }
  };

  typeSelect.addEventListener('change', loadAvailablePeriods);
  periodSelect.addEventListener('change', refreshSelectionState);
  freezeButton.addEventListener('click', async () => {
    const period = selectedPeriod();
    if (!period || freezeButton.disabled) return;
    const payload = {
      periodTypeId: Number(typeSelect.value),
      startDate: formatDateOnly(period.startDate),
      endDate: formatDateOnly(period.endDate)
    };
    freezeButton.disabled = true;
    try {
      const result = await OccurrenceManager.freezePeriodBaseline(
        currentScenario.id,
        payload
      );
      currentScenario = result.scenario;
      notifySuccess(`${period.label} was closed.`);
      refreshFrozenList();
      await onChanged?.(currentScenario);
    } catch (error) {
      notifyError(error?.message || String(error));
      refreshSelectionState();
    }
  });

  unfreezeAllButton.addEventListener('click', async () => {
    const markerCount = (currentScenario.baselinePeriods || []).length;
    const orphanCount = orphanedSnapshotGroups(currentScenario).reduce(
      (total, group) => total + group.occurrences.length,
      0
    );
    if (!markerCount && !orphanCount) return;
    const confirmed = await confirmDialog(
      `Clear all baseline history (${markerCount} closed period${markerCount === 1 ? '' : 's'} and ${orphanCount} individual baseline${orphanCount === 1 ? '' : 's'})? Actual and skipped transactions will remain.`
    );
    if (!confirmed) return;
    unfreezeAllButton.disabled = true;
    try {
      const result = await OccurrenceManager.unfreezeAllPeriodBaselines(
        currentScenario.id
      );
      currentScenario = result.scenario;
      notifySuccess('All baseline history was cleared.');
      refreshFrozenList();
      await onChanged?.(currentScenario);
    } catch (error) {
      unfreezeAllButton.disabled = false;
      notifyError(error?.message || String(error));
    }
  });

  modal.querySelector('.modal-close-btn').addEventListener('click', close);
  modal.querySelector('#baseline-manager-close').addEventListener('click', close);

  refreshFrozenList();
  await loadAvailablePeriods();
  return { close };
}
