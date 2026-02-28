// forecast-projections-section.js
// Projections section/grid loader extracted from forecast.js (no behavior change).

import { createGrid, refreshGridData, createDateColumn, createTextColumn, createMoneyColumn } from '../grids/grid-factory.js';
import { formatDateOnly, parseDateOnly } from '../../../shared/date-utils.js';
import { notifyError } from '../../../shared/notifications.js';
import { loadLookup } from '../../../app/services/lookup-service.js';
import { GridStateManager } from '../grids/grid-state.js';
import { getScenarioProjectionRows } from '../../../shared/app-data-utils.js';
import { openTimeframeModal } from '../modals/timeframe-modal.js';
import { formatCurrency, formatMoneyDisplay, numValueClass } from '../../../shared/format-utils.js';

import { getScenario, getScenarioPeriods } from '../../../app/services/data-service.js';
import { generateProjections, clearProjections } from '../../../domain/calculations/projection-engine.js';


const projectionsGridState = new GridStateManager('projections');
let lastProjectionsTable = null;

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

  const addMoneyField = (label, value) => {
    const field = document.createElement('div');
    field.className = 'grid-detail-field';
    const labelEl = document.createElement('label');
    labelEl.className = 'grid-detail-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('div');
    valueEl.className = 'grid-detail-value';
    valueEl.innerHTML = formatMoneyDisplay(value) || '—';
    field.appendChild(labelEl);
    field.appendChild(valueEl);
    grid.appendChild(field);
  };

  addField('Account', rowData?.accountName || rowData?.account);
  addMoneyField('Income', Number(rowData?.income || 0));
  addMoneyField('Expenses', Math.abs(Number(rowData?.expenses || 0)));
  addMoneyField('Net Change', Number(rowData?.netChange || 0));

  detailsEl.appendChild(grid);
}

function renderProjectionsSummaryList({ container, projections, accounts = [] }) {
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

    const projAcct = accounts.find((a) => Number(a.id) === Number(row?.accountId));
    const projCurrency = projAcct?.currency?.code || projAcct?.currency?.name || 'ZAR';

    const balance = document.createElement('span');
    balance.className = `grid-summary-amount ${numValueClass(Number(row?.balance || 0))}`;
    balance.textContent = formatCurrency(Number(row?.balance || 0), projCurrency);

    const date = document.createElement('span');
    date.className = 'grid-summary-date';
    date.textContent = row?.date || 'No date';

    const net = document.createElement('span');
    net.className = `grid-summary-type ${numValueClass(Number(row?.netChange || 0))}`;
    net.textContent = `Net ${formatCurrency(Number(row?.netChange || 0), projCurrency)}`;

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

  // Build icon toolbar above the projections grid.
  const existingIconToolbar = container.querySelector(':scope > .projections-icon-toolbar');
  if (existingIconToolbar) existingIconToolbar.remove();

  const iconToolbar = document.createElement('div');
  iconToolbar.className = 'projections-icon-toolbar';

  // — Filter by account —
  const filterWrapper = document.createElement('div');
  filterWrapper.style.position = 'relative';

  const filterBtn = document.createElement('button');
  filterBtn.className = 'icon-btn' + (Number(state?.getProjectionAccountFilterId?.()) > 0 ? ' icon-btn--active' : '');
  filterBtn.title = 'Filter by account';
  filterBtn.textContent = '⊙';

  const filterDropdown = document.createElement('div');
  filterDropdown.className = 'projections-filter-dropdown hidden';

  const filterSelect = document.createElement('select');
  filterSelect.className = 'input-select projections-filter-select';

  const allOpt = document.createElement('option');
  allOpt.value = '0';
  allOpt.textContent = 'All Accounts';
  filterSelect.appendChild(allOpt);
  (currentScenario?.accounts || []).forEach((a) => {
    const opt = document.createElement('option');
    opt.value = String(a.id);
    opt.textContent = a.name || 'Unnamed';
    filterSelect.appendChild(opt);
  });
  filterSelect.value = String(Number(state?.getProjectionAccountFilterId?.()) || 0);

  filterSelect.addEventListener('change', async () => {
    const selectedId = Number(filterSelect.value) || 0;
    state?.setProjectionAccountFilterId?.(selectedId > 0 ? selectedId : null);
    filterDropdown.classList.add('hidden');
    await loadProjectionsSection({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
  });
  filterDropdown.appendChild(filterSelect);

  filterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    filterDropdown.classList.toggle('hidden');
  });
  document.addEventListener('click', () => filterDropdown.classList.add('hidden'), { once: true });

  filterWrapper.appendChild(filterBtn);
  filterWrapper.appendChild(filterDropdown);
  iconToolbar.appendChild(filterWrapper);

  // — Regenerate projections —
  const regenBtn = document.createElement('button');
  regenBtn.className = 'icon-btn';
  regenBtn.title = 'Regenerate projections';
  regenBtn.textContent = '↺';

  regenBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const prevText = regenBtn.textContent;
    try {
      regenBtn.textContent = '…';
      regenBtn.disabled = true;
      const scenario = scenarioState?.get?.();
      if (!scenario?.id) return;
      const projConfig = scenario?.projection?.config || {};
      await generateProjections(scenario.id, {
        source: projConfig.source || 'transactions',
        startDate: projConfig.startDate,
        endDate: projConfig.endDate,
        periodTypeId: projConfig.periodTypeId
      });
      const refreshed = await getScenario(scenario.id);
      scenarioState?.set?.(refreshed);
      await loadProjectionsSection({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
    } catch (err) {
      notifyError('Failed to regenerate projections: ' + (err?.message || String(err)));
    } finally {
      if (regenBtn.isConnected) {
        regenBtn.textContent = prevText;
        regenBtn.disabled = false;
      }
    }
  });
  iconToolbar.appendChild(regenBtn);

  // — Set projection period —
  const periodBtn = document.createElement('button');
  periodBtn.className = 'icon-btn';
  periodBtn.title = 'Set projection period';
  periodBtn.textContent = '⊞';

  periodBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const scenario = scenarioState?.get?.();
    const projConfig = scenario?.projection?.config || {};
    openTimeframeModal({
      title: 'Set Projection Period',
      showPeriodType: true,
      defaultPeriodTypeId: projConfig.periodTypeId || 3,
      onConfirm: async ({ startDate, endDate, periodTypeId }) => {
        try {
          periodBtn.disabled = true;
          const current = scenarioState?.get?.();
          if (!current?.id) return;
          await generateProjections(current.id, {
            source: current?.projection?.config?.source || 'transactions',
            startDate,
            endDate,
            periodTypeId
          });
          const refreshed = await getScenario(current.id);
          scenarioState?.set?.(refreshed);
          await loadProjectionsSection({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
        } catch (err) {
          notifyError('Failed to set projection period: ' + (err?.message || String(err)));
        } finally {
          if (periodBtn.isConnected) periodBtn.disabled = false;
        }
      }
    });
  });
  iconToolbar.appendChild(periodBtn);

  container.insertBefore(iconToolbar, projectionsGridContainer);

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
      projections: rows,
      accounts: currentScenario?.accounts || []
    });
  } catch (err) {
    logger?.error?.('[Forecast] loadProjectionsSection failed', err);
  }
}

