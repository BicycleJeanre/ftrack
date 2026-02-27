// forecast-projections-section.js
// Projections section/grid loader extracted from forecast.js (no behavior change).

import { createGrid, refreshGridData, createDateColumn, createTextColumn, createMoneyColumn, formatMoneyDisplay } from '../grids/grid-factory.js';
import { formatDateOnly, parseDateOnly } from '../../../shared/date-utils.js';
import { notifyError, notifySuccess } from '../../../shared/notifications.js';
import { loadLookup } from '../../../app/services/lookup-service.js';
import { GridStateManager } from '../grids/grid-state.js';
import { getScenarioProjectionRows } from '../../../shared/app-data-utils.js';
import { openTimeframeModal } from '../modals/timeframe-modal.js';
import { formatCurrency } from '../../../shared/format-utils.js';

import { getScenario, getScenarioPeriods } from '../../../app/services/data-service.js';
import { generateProjections, clearProjections } from '../../../domain/calculations/projection-engine.js';

import { expandTransactions } from '../../../domain/calculations/transaction-expander.js';
import { calculatePeriodicChange } from '../../../domain/calculations/calculation-engine.js';
import { expandPeriodicChangeForCalculation } from '../../../domain/calculations/periodic-change-utils.js';

const projectionsGridState = new GridStateManager('projections');
let lastProjectionsTable = null;
// Removed projectionsGridMode: always summary in base projections section.

function renderProjectionsRowDetails({ row, rowData }) {
  const rowEl = row.getElement();
  if (!rowEl) return;

  let detailsEl = rowEl.querySelector('.grid-row-details');
  if (!detailsEl) {
    detailsEl = document.createElement('div');
    detailsEl.className = 'grid-row-details';
    rowEl.appendChild(detailsEl);
  }

  if (!rowData?._detailsOpen) {
    detailsEl.style.display = 'none';
    detailsEl.innerHTML = '';
    rowEl.classList.remove('grid-row-expanded');
    return;
  }

  detailsEl.style.display = 'block';
  detailsEl.innerHTML = '';
  rowEl.classList.add('grid-row-expanded');

  const grid = document.createElement('div');
  grid.className = 'grid-row-details-grid';

  const addField = (label, value) => {
    const field = document.createElement('div');
    field.className = 'grid-detail-field';
    const labelEl = document.createElement('label');
    labelEl.className = 'grid-detail-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('div');
    valueEl.className = 'grid-detail-value';
    valueEl.textContent = value || '—';
    field.appendChild(labelEl);
    field.appendChild(valueEl);
    grid.appendChild(field);
  };

  addField('Account', rowData?.accountName || rowData?.account);
  addField('Income', formatCurrency(Number(rowData?.income || 0), 'ZAR'));
  addField('Expenses', formatCurrency(Math.abs(Number(rowData?.expenses || 0)), 'ZAR'));
  addField('Net Change', formatCurrency(Number(rowData?.netChange || 0), 'ZAR'));

  detailsEl.appendChild(grid);
}

function renderProjectionsSummaryList({ container, projections }) {
  container.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'grid-summary-list';
  container.appendChild(list);

  if (!projections || projections.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'scenarios-list-placeholder';
    empty.textContent = 'No projections available. Generate projections to see results.';
    list.appendChild(empty);
    return;
  }

  projections.forEach((row) => {
    const card = document.createElement('div');
    card.className = 'grid-summary-card';

    const content = document.createElement('div');
    content.className = 'grid-summary-content';

    const title = document.createElement('div');
    title.className = 'grid-summary-title';
    title.textContent = row?.accountName || row?.account || 'Account';

    const meta = document.createElement('div');
    meta.className = 'grid-summary-meta';

    const balance = document.createElement('span');
    balance.className = 'grid-summary-amount';
    balance.textContent = formatCurrency(Number(row?.balance || 0), 'ZAR');

    const date = document.createElement('span');
    date.className = 'grid-summary-date';
    date.textContent = row?.date || 'No date';

    const net = document.createElement('span');
    net.className = 'grid-summary-type';
    net.textContent = `Net ${formatCurrency(Number(row?.netChange || 0), 'ZAR')}`;

    meta.appendChild(balance);
    meta.appendChild(date);
    meta.appendChild(net);

    content.appendChild(title);
    content.appendChild(meta);

    card.appendChild(content);
    list.appendChild(card);
  });
}

function applyProjectionsPeriodFilter({ projectionsTable = lastProjectionsTable, state } = {}) {
  if (!projectionsTable) return;

  const projectionPeriod = state?.getProjectionPeriod?.();
  const projectionPeriods = state?.getProjectionPeriods?.() || [];
  const selectedPeriod = projectionPeriod ? projectionPeriods.find((p) => p.id === projectionPeriod) : null;

  if (!selectedPeriod?.startDate || !selectedPeriod?.endDate) {
    projectionsTable.clearFilter();
    return;
  }

  const startKey = formatDateOnly(new Date(selectedPeriod.startDate));
  const endKey = formatDateOnly(new Date(selectedPeriod.endDate));

  const toDateKey = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return formatDateOnly(value);
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return formatDateOnly(d);
    return String(value);
  };

  projectionsTable.setFilter((row) => {
    const rowKey = toDateKey(row?.date);
    if (!rowKey) return false;
    return rowKey >= startKey && rowKey <= endKey;
  });
}

export async function loadProjectionsSection({
  container,
  scenarioState,
  getWorkflowConfig,
  state,
  tables,
  callbacks,
  logger
}) {
  let currentScenario = scenarioState?.get?.();
  if (!currentScenario) return;

  const projectionsSection = container.closest('.forecast-card');
  const projectionsHeader = projectionsSection?.querySelector(':scope > .card-header');
  if (projectionsHeader) {
    const controls = projectionsHeader.querySelector('.card-header-controls');
    if (controls) {
      controls.innerHTML = '';
      // View toggle removed: projections section always summary in base section.
      const refreshButton = document.createElement('button');
      refreshButton.className = 'icon-btn';
      refreshButton.title = 'Refresh Projections';
      refreshButton.textContent = '⟳';

      controls.appendChild(viewSelect);
      controls.appendChild(refreshButton);

      refreshButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        const prevText = refreshButton.textContent;
        try {
          refreshButton.textContent = '...';
          refreshButton.disabled = true;

          const scenario = scenarioState?.get?.();
          if (scenario?.id) {
            const refreshed = await getScenario(scenario.id);
            scenarioState?.set?.(refreshed);
          }

          await loadProjectionsSection({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
        } catch (err) {
          notifyError('Failed to refresh projections: ' + (err?.message || String(err)));
        } finally {
          if (refreshButton.isConnected) {
            refreshButton.textContent = prevText;
            refreshButton.disabled = false;
          }
        }
      });
    }
  }

  try {
    projectionsGridState.capture(lastProjectionsTable, {
      groupBy: '#projections-grouping-select',
      account: '#projections-account-filter-select'
    });
  } catch (_) {
    // ignore
  }

  // Keep the grid container stable to reduce scroll jumps.
  const existingToolbars = container.querySelectorAll(':scope > .grid-toolbar');
  existingToolbars.forEach((el) => el.remove());

  let projectionsGridContainer = container.querySelector('#projectionsGrid');
  if (!projectionsGridContainer) {
    projectionsGridContainer = document.createElement('div');
    projectionsGridContainer.id = 'projectionsGrid';
    projectionsGridContainer.className = 'grid-container projections-grid';
    window.add(container, projectionsGridContainer);
  }

  projectionsGridContainer.classList.remove('grid-detail');

  try {
    try {
      lastProjectionsTable = null;
    } catch (_) {
      // ignore
    }

    let rows = getScenarioProjectionRows(currentScenario);
    const accountFilterId = state?.getProjectionAccountFilterId?.();
    if (accountFilterId) {
      rows = rows.filter((row) => Number(row.accountId) === Number(accountFilterId));
    }

    const projectionPeriod = state?.getProjectionPeriod?.();
    const projectionPeriods = state?.getProjectionPeriods?.() || [];
    if (projectionPeriod) {
      const selectedPeriod = projectionPeriods.find((p) => p.id === projectionPeriod);
      if (selectedPeriod?.startDate && selectedPeriod?.endDate) {
        const start = formatDateOnly(new Date(selectedPeriod.startDate));
        const end = formatDateOnly(new Date(selectedPeriod.endDate));
        rows = rows.filter((row) => {
          const rowKey = typeof row.date === 'string' ? row.date : formatDateOnly(new Date(row.date));
          return rowKey >= start && rowKey <= end;
        });
      }
    }

    renderProjectionsSummaryList({
      container: projectionsGridContainer,
      projections: rows
    });
  } catch (err) {
    logger?.error?.('[Forecast] loadProjectionsSection failed', err);
  }
}

export async function refreshProjectionsSection(args) {
  return loadProjectionsSection(args);
}
