// forecast-projections-section.js
// Projections section/grid loader extracted from forecast.js (no behavior change).

import { createGrid, createDateColumn, createTextColumn, createMoneyColumn } from '../grids/grid-factory.js';
import { parseDateOnly, formatDateOnly } from '../../../shared/date-utils.js';
import { notifyError } from '../../../shared/notifications.js';
import { GridStateManager } from '../grids/grid-state.js';
import { getScenarioProjectionRows } from '../../../shared/app-data-utils.js';
import { openTimeframeModal } from '../modals/timeframe-modal.js';
import { formatCurrency, formatMoneyDisplay, numValueClass } from '../../../shared/format-utils.js';
import { expandTransactions } from '../../../domain/calculations/transaction-expander.js';
import { normalizeCanonicalTransaction, transformTransactionToRows } from '../../transforms/transaction-row-transformer.js';

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

function getProjectionSourceOccurrences({ scenario, state }) {
  const projectionPeriods = state?.getProjectionPeriods?.() || [];
  if (!projectionPeriods.length) return [];

  const periodsWithBounds = projectionPeriods.filter((period) => period?.startDate && period?.endDate);
  if (!periodsWithBounds.length) return [];

  const startDate = parseDateOnly(periodsWithBounds[0].startDate);
  const endDate = parseDateOnly(periodsWithBounds[periodsWithBounds.length - 1].endDate);
  if (!startDate || !endDate) return [];

  const source = scenario?.projection?.config?.source === 'budget' ? 'budget' : 'transactions';
  const statusName = (entry) => (typeof entry?.status === 'object' ? entry?.status?.name : entry?.status);

  const sourceItems = source === 'budget'
    ? (scenario?.budgets || [])
      .filter((budget) => statusName(budget) === 'planned')
      .map((budget) => ({
        id: budget.id,
        primaryAccountId: budget.primaryAccountId,
        secondaryAccountId: budget.secondaryAccountId,
        transactionTypeId: budget.transactionTypeId,
        amount: budget.amount,
        description: budget.description,
        recurrence: budget.recurrence,
        effectiveDate: budget.date,
        status: budget.status
      }))
    : (scenario?.transactions || []).filter((tx) => statusName(tx) === 'planned');

  return expandTransactions(sourceItems, startDate, endDate, scenario?.accounts || []);
}

function normalizeProjectionOccurrenceForTransform(entry, source) {
  if (source === 'budget') {
    return normalizeCanonicalTransaction({
      id: entry.id,
      primaryAccountId: entry.primaryAccountId,
      secondaryAccountId: entry.secondaryAccountId,
      transactionTypeId: entry.transactionTypeId,
      transactionType: entry.transactionType,
      amount: entry.amount,
      plannedAmount: entry.amount,
      actualAmount: entry.status?.actualAmount ?? null,
      description: entry.description,
      effectiveDate: entry.effectiveDate,
      recurrence: entry.recurrence,
      status: entry.status || { name: 'planned' }
    });
  }
  return normalizeCanonicalTransaction(entry);
}

function getPerspectiveSecondaryByAccountPeriod({ scenario, state, accountMap }) {
  const projectionPeriods = state?.getProjectionPeriods?.() || [];
  if (!projectionPeriods.length) return new Map();

  const source = scenario?.projection?.config?.source === 'budget' ? 'budget' : 'transactions';
  const occurrences = getProjectionSourceOccurrences({ scenario, state });
  if (!occurrences.length) return new Map();

  const toPeriodId = (dateValue) => {
    const dateKey = typeof dateValue === 'string' ? dateValue : formatDateOnly(dateValue);
    const period = projectionPeriods.find((p) => p?.startDate && p?.endDate && dateKey >= p.startDate && dateKey <= p.endDate);
    return period?.id || null;
  };

  const byAccountPeriod = new Map();
  occurrences.forEach((occurrence) => {
    const periodId = toPeriodId(occurrence?._occurrenceDate || occurrence?.effectiveDate);
    if (!periodId) return;

    const transformedRows = transformTransactionToRows(
      normalizeProjectionOccurrenceForTransform(occurrence, source),
      scenario?.accounts || []
    );

    transformedRows.forEach((row) => {
      const perspectiveAccountId = Number(row?.perspectiveAccountId || 0);
      if (!perspectiveAccountId) return;
      const secondaryAccountId = Number(row?.secondaryAccountId || 0);
      const secondaryName =
        row?.secondaryAccountName ||
        accountMap.get(secondaryAccountId)?.name ||
        'Unassigned';
      const weight = Math.abs(Number(row?.plannedAmount ?? row?.amount ?? 0));
      if (!weight) return;

      const key = `${perspectiveAccountId}|${String(periodId)}`;
      if (!byAccountPeriod.has(key)) byAccountPeriod.set(key, new Map());
      const secondaryMap = byAccountPeriod.get(key);
      secondaryMap.set(secondaryName, Number(secondaryMap.get(secondaryName) || 0) + weight);
    });
  });

  return byAccountPeriod;
}

function explodeProjectionRowsBySecondary({ rows, scenario, state, accountMap }) {
  const groupBy = state?.getGroupBy?.() || '';
  if (groupBy !== 'secondaryAccount') return rows;

  const projectionPeriods = state?.getProjectionPeriods?.() || [];
  if (!projectionPeriods.length) return rows;

  const secondaryByAccountPeriod = getPerspectiveSecondaryByAccountPeriod({ scenario, state, accountMap });
  if (!secondaryByAccountPeriod.size) return rows;

  const toPeriodId = (dateValue) => {
    const dateKey = typeof dateValue === 'string' ? dateValue : formatDateOnly(dateValue);
    const period = projectionPeriods.find((p) => p?.startDate && p?.endDate && dateKey >= p.startDate && dateKey <= p.endDate);
    return period?.id || null;
  };

  const explodedRows = [];

  rows.forEach((row, rowIndex) => {
    const accountId = Number(row?.accountId || 0);
    const periodId = toPeriodId(row?.date);
    if (!periodId) {
      explodedRows.push({ ...row, secondaryAccount: 'Unassigned' });
      return;
    }

    const key = `${accountId}|${String(periodId)}`;
    const secondaryMap = secondaryByAccountPeriod.get(key);
    const entries = secondaryMap ? Array.from(secondaryMap.entries()) : [];

    if (!entries.length) {
      explodedRows.push({ ...row, secondaryAccount: 'Unassigned' });
      return;
    }

    const total = entries.reduce((sum, [, value]) => sum + Number(value || 0), 0);
    if (!total) {
      explodedRows.push({ ...row, secondaryAccount: 'Unassigned' });
      return;
    }

    entries.forEach(([secondaryName, weight], entryIndex) => {
      const ratio = Number(weight || 0) / total;
      explodedRows.push({
        ...row,
        id: `${row.id || `${accountId}-${rowIndex}`}-cp-${secondaryName}-${entryIndex}`,
        secondaryAccount: secondaryName,
        income: Number(row?.income || 0) * ratio,
        expenses: Number(row?.expenses || 0) * ratio,
        netChange: Number(row?.netChange || 0) * ratio,
        balance: entryIndex === 0 ? Number(row?.balance || 0) : 0
      });
    });
  });

  return explodedRows;
}

function renderProjectionsSummaryList({ container, projections, accounts = [], groupByField = '' }) {
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

  const sortedRows = groupByField
    ? [...projections].sort((left, right) => {
      const leftValue = String(left?.[groupByField] || 'Unassigned');
      const rightValue = String(right?.[groupByField] || 'Unassigned');
      const groupOrder = leftValue.localeCompare(rightValue);
      if (groupOrder !== 0) return groupOrder;
      return String(left?.date || '').localeCompare(String(right?.date || ''));
    })
    : projections;

  let currentGroup = null;

  sortedRows.forEach((row) => {
    if (groupByField) {
      const nextGroup = String(row?.[groupByField] || 'Unassigned');
      if (nextGroup !== currentGroup) {
        currentGroup = nextGroup;
        const groupHeader = document.createElement('div');
        groupHeader.className = 'grid-summary-group-header';
        groupHeader.textContent = currentGroup;
        list.appendChild(groupHeader);
      }
    }

    const card = document.createElement('div');
    card.className = 'grid-summary-card';

    const title = document.createElement('span');
    title.className = 'grid-summary-title';
    title.textContent = row?.accountName || row?.account || 'Account';

    const projAcct = accounts.find((a) => Number(a.id) === Number(row?.accountId));
    const projCurrency = projAcct?.currency?.code || projAcct?.currency?.name || 'ZAR';

    const income = document.createElement('span');
    income.className = `grid-summary-income ${numValueClass(Number(row?.income || 0))}`;
    income.textContent = `↑ ${formatCurrency(Number(row?.income || 0), projCurrency)}`;

    const expenses = document.createElement('span');
    expenses.className = 'grid-summary-expenses';
    expenses.textContent = `↓ ${formatCurrency(Math.abs(Number(row?.expenses || 0)), projCurrency)}`;

    const date = document.createElement('span');
    date.className = 'grid-summary-date';
    date.textContent = row?.date || 'No date';

    const net = document.createElement('span');
    net.className = `grid-summary-type ${numValueClass(Number(row?.netChange || 0))}`;
    net.textContent = `Net ${formatCurrency(Number(row?.netChange || 0), projCurrency)}`;

    card.appendChild(title);
    card.appendChild(income);
    card.appendChild(expenses);
    card.appendChild(date);
    card.appendChild(net);
    list.appendChild(card);
  });
}

function applyProjectionsPeriodFilter({ projectionsTable = lastProjectionsTable, state } = {}) {
  if (!projectionsTable) return;

  const projectionAccountFilterId = Number(state?.getProjectionAccountFilterId?.() || 0);
  const projectionPeriod = state?.getProjectionPeriod?.();
  const projectionPeriods = state?.getProjectionPeriods?.() || [];
  const selectedPeriod = projectionPeriod ? projectionPeriods.find((p) => p.id === projectionPeriod) : null;

  const hasPeriodFilter = Boolean(selectedPeriod?.startDate && selectedPeriod?.endDate);
  if (!projectionAccountFilterId && !hasPeriodFilter) {
    projectionsTable.setFilter([]);
    return;
  }

  const startKey = selectedPeriod?.startDate;
  const endKey = selectedPeriod?.endDate;

  const toDateKey = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return formatDateOnly(value);
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return formatDateOnly(d);
    return String(value);
  };

  projectionsTable.setFilter((row) => {
    if (projectionAccountFilterId && Number(row?.accountId) !== projectionAccountFilterId) {
      return false;
    }
    if (!hasPeriodFilter) return true;
    const rowKey = toDateKey(row?.date);
    if (!rowKey) return false;
    return rowKey >= startKey && rowKey <= endKey;
  });
}

async function buildProjectionsHeaderControls({ controls, container, currentScenario, scenarioState, state, reload, logger }) {
  controls.innerHTML = '';

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
      await reload();
    } catch (err) {
      notifyError('Failed to regenerate projections: ' + (err?.message || String(err)));
    } finally {
      if (regenBtn.isConnected) {
        regenBtn.textContent = prevText;
        regenBtn.disabled = false;
      }
    }
  });

  const setPeriodBtn = document.createElement('button');
  setPeriodBtn.className = 'icon-btn';
  setPeriodBtn.title = 'Set projection period';
  setPeriodBtn.textContent = '⊞';
  setPeriodBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const scenario = scenarioState?.get?.();
    const projConfig = scenario?.projection?.config || {};
    openTimeframeModal({
      title: 'Set Projection Period',
      showPeriodType: true,
      defaultPeriodTypeId: projConfig.periodTypeId || 3,
      defaultStartDate: projConfig.startDate || null,
      defaultEndDate: projConfig.endDate || null,
      onConfirm: async ({ startDate, endDate, periodTypeId }) => {
        try {
          setPeriodBtn.disabled = true;
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
          await reload();
        } catch (err) {
          notifyError('Failed to set projection period: ' + (err?.message || String(err)));
        } finally {
          if (setPeriodBtn.isConnected) setPeriodBtn.disabled = false;
        }
      }
    });
  });

  const generateBtn = document.createElement('button');
  generateBtn.className = 'icon-btn';
  generateBtn.title = 'Generate projections';
  generateBtn.textContent = '⊕';
  generateBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const prevText = generateBtn.textContent;
    try {
      generateBtn.textContent = '…';
      generateBtn.disabled = true;
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
      await reload();
    } catch (err) {
      notifyError('Failed to generate projections: ' + (err?.message || String(err)));
    } finally {
      if (generateBtn.isConnected) {
        generateBtn.textContent = prevText;
        generateBtn.disabled = false;
      }
    }
  });

  const clearBtn = document.createElement('button');
  clearBtn.className = 'icon-btn';
  clearBtn.title = 'Clear projections';
  clearBtn.textContent = '⊗';
  clearBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const prevText = clearBtn.textContent;
    try {
      clearBtn.textContent = '…';
      clearBtn.disabled = true;
      const scenario = scenarioState?.get?.();
      if (!scenario?.id) return;
      await clearProjections(scenario.id);
      const refreshed = await getScenario(scenario.id);
      scenarioState?.set?.(refreshed);
      await reload();
    } catch (err) {
      notifyError('Failed to clear projections: ' + (err?.message || String(err)));
    } finally {
      if (clearBtn.isConnected) {
        clearBtn.textContent = prevText;
        clearBtn.disabled = false;
      }
    }
  });

  // --- Compact filter items in header ---
  const makeHeaderFilter = (id, labelText, selectEl) => {
    const item = document.createElement('div');
    item.className = 'header-filter-item';
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = labelText;
    item.appendChild(label);
    item.appendChild(selectEl);
    return item;
  };

  const viewByType = state?.getProjectionPeriodType?.() || 'Month';
  let projectionPeriods = state?.getProjectionPeriods?.() || [];
  if (!projectionPeriods.length || state?.getProjectionPeriodType?.() !== viewByType) {
    try {
      projectionPeriods = await getScenarioPeriods(currentScenario.id, viewByType);
    } catch (err) {
      logger?.error?.('[Forecast] Failed to load projection periods', err);
      projectionPeriods = [];
    }
    state?.setProjectionPeriods?.(projectionPeriods);
  }

  let projectionPeriod = state?.getProjectionPeriod?.();
  const hasValidPeriod = projectionPeriod && projectionPeriods.some((p) => p.id === projectionPeriod);
  // If a specific period was selected but no longer exists, reset to "All"
  if (projectionPeriod && !hasValidPeriod) {
    projectionPeriod = null;
    state?.setProjectionPeriod?.(null);
  }

  // Account filter
  const accountSelect = document.createElement('select');
  accountSelect.id = 'projections-account-filter-select';
  accountSelect.className = 'input-select';
  const accountAllOption = document.createElement('option');
  accountAllOption.value = '0';
  accountAllOption.textContent = 'All Accounts';
  accountSelect.appendChild(accountAllOption);
  (currentScenario.accounts || []).forEach((account) => {
    const option = document.createElement('option');
    option.value = String(account.id);
    option.textContent = account.name || 'Unnamed';
    accountSelect.appendChild(option);
  });
  const activeAccount = Number(state?.getProjectionAccountFilterId?.() || 0);
  accountSelect.value = activeAccount > 0 ? String(activeAccount) : '0';
  accountSelect.addEventListener('change', async () => {
    const selectedId = Number(accountSelect.value) || 0;
    state?.setProjectionAccountFilterId?.(selectedId > 0 ? selectedId : null);
    
    if (lastProjectionsTable) {
      // Detail view: use Tabulator filter
      const currentGroup = state?.getGroupBy?.() || '';
      if (currentGroup === 'secondaryAccount') {
        await reload();
      } else {
        applyProjectionsPeriodFilter({ projectionsTable: lastProjectionsTable, state });
      }
      callbacks?.updateProjectionTotals?.();
    } else {
      // Summary view: reload with filtered data
      await reload();
    }
  });
  controls.appendChild(makeHeaderFilter('projections-account-filter-select', 'Account:', accountSelect));

  // Group By filter
  const groupSelect = document.createElement('select');
  groupSelect.id = 'projections-grouping-select';
  groupSelect.className = 'input-select';
  [
    { value: '', label: 'None' },
    { value: 'account', label: 'Account' },
    { value: 'accountType', label: 'Account Type' },
    { value: 'secondaryAccount', label: 'Secondary Account' }
  ].forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    groupSelect.appendChild(option);
  });
  const storedGroup = state?.getGroupBy?.() || '';
  groupSelect.value = storedGroup;
  groupSelect.addEventListener('change', async () => {
    const prevField = state?.getGroupBy?.() || '';
    const field = groupSelect.value || '';
    state?.setGroupBy?.(field);
    // Apply grouping directly to table if available (both detail and summary paths)
    if (lastProjectionsTable) {
      const needsDataReload = prevField === 'secondaryAccount' || field === 'secondaryAccount';
      if (needsDataReload) {
        await reload();
      } else {
        lastProjectionsTable.setGroupBy(field ? [field] : []);
      }
    } else {
      await reload();
    }
  });
  controls.appendChild(makeHeaderFilter('projections-grouping-select', 'Group:', groupSelect));

  // View By filter
  const viewSelect = document.createElement('select');
  viewSelect.id = 'projections-viewby-select';
  viewSelect.className = 'input-select';
  ['Day', 'Week', 'Month', 'Quarter', 'Year'].forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    viewSelect.appendChild(option);
  });
  viewSelect.value = viewByType;
  viewSelect.addEventListener('change', async () => {
    const nextView = viewSelect.value;
    state?.setProjectionPeriodType?.(nextView);
    let nextPeriods = [];
    try {
      nextPeriods = await getScenarioPeriods(currentScenario.id, nextView);
    } catch (err) {
      logger?.error?.('[Forecast] Failed to load projection periods', err);
      nextPeriods = [];
    }
    state?.setProjectionPeriods?.(nextPeriods);
    const nextPeriodId = nextPeriods.length ? nextPeriods[0]?.id : null;
    state?.setProjectionPeriod?.(nextPeriodId);
    await reload();
  });
  controls.appendChild(makeHeaderFilter('projections-viewby-select', 'Period Type:', viewSelect));

  // Period selector + nav
  const periodSelect = document.createElement('select');
  periodSelect.id = 'projections-period-select';
  periodSelect.className = 'input-select';
  const allPeriodOption = document.createElement('option');
  allPeriodOption.value = '';
  allPeriodOption.textContent = 'All';
  periodSelect.appendChild(allPeriodOption);
  projectionPeriods.forEach((period) => {
    if (!period?.id) return;
    const option = document.createElement('option');
    option.value = period.id;
    option.textContent = period.label || period.id;
    periodSelect.appendChild(option);
  });
  periodSelect.value = projectionPeriod || '';
  periodSelect.addEventListener('change', async () => {
    const selectedPeriodId = periodSelect.value || null;
    state?.setProjectionPeriod?.(selectedPeriodId);
    
    if (lastProjectionsTable) {
      // Detail view: use Tabulator filter
      applyProjectionsPeriodFilter({ projectionsTable: lastProjectionsTable, state });
      callbacks?.updateProjectionTotals?.();
    } else {
      // Summary view: reload with filtered data
      await reload();
    }
  });

  const periodIds = [null, ...(projectionPeriods.map((p) => p.id || null))];
  const setPeriodSelection = async (id) => {
    periodSelect.value = id || '';
    state?.setProjectionPeriod?.(id || null);
    
    if (lastProjectionsTable) {
      // Detail view: use Tabulator filter
      applyProjectionsPeriodFilter({ projectionsTable: lastProjectionsTable, state });
      callbacks?.updateProjectionTotals?.();
    } else {
      // Summary view: reload with filtered data
      await reload();
    }
  };

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'period-btn';
  prevBtn.textContent = '◀';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'period-btn';
  nextBtn.textContent = '▶';
  const changePeriodBy = async (offset) => {
    const currentId = state?.getProjectionPeriod?.() ?? null;
    const currentIndex = periodIds.findIndex((id) => id === currentId);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = Math.min(Math.max(safeIndex + offset, 0), periodIds.length - 1);
    await setPeriodSelection(periodIds[nextIndex] ?? null);
  };
  prevBtn.addEventListener('click', async (e) => { e.preventDefault(); await changePeriodBy(-1); });
  nextBtn.addEventListener('click', async (e) => { e.preventDefault(); await changePeriodBy(1); });

  const periodItem = document.createElement('div');
  periodItem.className = 'header-filter-item';
  const periodLabel = document.createElement('label');
  periodLabel.htmlFor = 'projections-period-select';
  periodLabel.textContent = 'Period:';
  periodItem.appendChild(periodLabel);
  periodItem.appendChild(periodSelect);
  periodItem.appendChild(prevBtn);
  periodItem.appendChild(nextBtn);
  controls.appendChild(periodItem);

  const iconActions = document.createElement('div');
  iconActions.className = 'header-icon-actions';
  iconActions.appendChild(regenBtn);
  iconActions.appendChild(setPeriodBtn);
  iconActions.appendChild(generateBtn);
  iconActions.appendChild(clearBtn);
  controls.appendChild(iconActions);
}

export async function loadProjectionsGrid({
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

  const reloadGrid = async () =>
    loadProjectionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });

  try {
    projectionsGridState.capture(lastProjectionsTable, {
      groupBy: '#projections-grouping-select',
      account: '#projections-account-filter-select'
    });
  } catch (_) {
    // ignore
  }

  // --- Card header controls (icon-btn pattern, same as accounts grid) ---
  const projectionsSection = container.closest('.forecast-card');
  const projectionsHeader = projectionsSection?.querySelector(':scope > .card-header');
  if (projectionsHeader) {
    projectionsHeader.classList.add('card-header--filters-inline');
    const controls = projectionsHeader.querySelector('.card-header-controls');
    if (controls) {
      await buildProjectionsHeaderControls({
        controls,
        container,
        currentScenario,
        scenarioState,
        state,
        reload: reloadGrid,
        logger
      });
    }
  }

  try {
    let projectionsGridContainer = container.querySelector('#projectionsGrid');
    if (!projectionsGridContainer) {
      projectionsGridContainer = document.createElement('div');
      projectionsGridContainer.id = 'projectionsGrid';
      projectionsGridContainer.className = 'grid-container projections-grid';
    } else {
      projectionsGridContainer.innerHTML = '';
    }
    projectionsGridContainer.classList.add('grid-detail');

    container.innerHTML = '';
    container.appendChild(projectionsGridContainer);

    const filteredRows = getScenarioProjectionRows(currentScenario);

    const accounts = currentScenario.accounts || [];
    const accountMap = new Map((accounts || []).map((account) => [Number(account.id), account]));

    const tableDataBase = filteredRows.map((row, index) => {
      const accountId = Number(row.accountId);
      const account = accountMap.get(accountId);
      const accountTypeRaw = account?.type || row.accountType;
      const accountTypeName =
        accountTypeRaw && typeof accountTypeRaw === 'object'
          ? accountTypeRaw?.name
          : accountTypeRaw || '';
      const secondaryAccountId = Number(row.secondaryAccountId);
      const secondaryAccount = accountMap.get(secondaryAccountId);
      const income = Number(row.income || 0);
      const expenses = Number(row.expenses || 0);
      const netChange = row.netChange != null ? Number(row.netChange) : income - expenses;
      return {
        ...row,
        id: row.id ?? `${accountId || 'account'}-${row.date || index}`,
        account: account?.name || row.accountName || '',
        secondaryAccount: row.secondaryAccountName || row.secondaryAccount || secondaryAccount?.name || 'Unassigned',
        accountType: accountTypeName,
        balance: Number(row.balance || 0),
        income,
        expenses,
        netChange
      };
    });

    const tableData = explodeProjectionRowsBySecondary({
      rows: tableDataBase,
      scenario: currentScenario,
      state,
      accountMap
    });

    try {
      await lastProjectionsTable?.destroy?.();
    } catch (_) {
      // ignore
    }

    lastProjectionsTable = await createGrid(projectionsGridContainer, {
      data: tableData,
      columns: [
        createDateColumn('Date', 'date', { width: 120 }),
        createTextColumn('Account', 'account', { responsive: 4 }),
        {
          title: 'Account Type', field: 'accountType', responsive: 5, widthGrow: 1,
          formatter: (cell) => {
            const name = cell.getValue() || '';
            const cls = name.toLowerCase();
            return name ? `<span class="grid-summary-type account-type--${cls}">${name}</span>` : '';
          }
        },
        createMoneyColumn('Balance', 'balance', { topCalc: 'sum' }),
        createMoneyColumn('Income', 'income', { topCalc: 'sum' }),
        createMoneyColumn('Expenses', 'expenses', { topCalc: 'sum' }),
        createMoneyColumn('Net Change', 'netChange', { topCalc: 'sum' })
      ],
      initialSort: [{ column: 'date', dir: 'asc' }],
      rowFormatter: (row) => renderProjectionsRowDetails({ row, rowData: row.getData() })
    });

    const toggleRowDetails = (row) => {
      const rowData = row.getData();
      rowData._detailsOpen = !rowData._detailsOpen;
      renderProjectionsRowDetails({ row, rowData });
    };

    lastProjectionsTable.on('rowClick', (event, row) => {
      toggleRowDetails(row);
    });

    lastProjectionsTable.on('tableBuilt', () => {
      try {
        projectionsGridState.restore(lastProjectionsTable);
      } catch (_) {
        // ignore
      }
      try {
        const currentGroupBy = state?.getGroupBy?.() || '';
        lastProjectionsTable.setGroupBy(currentGroupBy ? [currentGroupBy] : []);
      } catch (_) {
        // ignore
      }
      try {
        applyProjectionsPeriodFilter({ projectionsTable: lastProjectionsTable, state });
      } catch (_) {
        // ignore
      }
      try {
        projectionsGridState.restoreDropdowns(
          {
            groupBy: '#projections-grouping-select',
            account: '#projections-account-filter-select'
          },
          { dispatchChange: false }
        );
      } catch (_) {
        // ignore
      }
    });
  } catch (err) {
    logger?.error?.('[Forecast] loadProjectionsGrid failed', err);
  }
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
  const workflowConfig = getWorkflowConfig?.();
  if (workflowConfig?.id === 'projections-detail') {
    return loadProjectionsGrid({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger });
  }

  let currentScenario = scenarioState?.get?.();
  if (!currentScenario) return;

  container.querySelectorAll(':scope > .filter-bar, :scope > .toolbar-totals, :scope > .projections-detail-toolbar').forEach((el) => el.remove());

  const projectionsSection = container.closest('.forecast-card');
  const projectionsHeader = projectionsSection?.querySelector(':scope > .card-header');
  if (projectionsHeader) {
    projectionsHeader.classList.add('card-header--filters-inline');
    const controls = projectionsHeader.querySelector('.card-header-controls');
    if (controls) {
      await buildProjectionsHeaderControls({
        controls,
        container,
        currentScenario,
        scenarioState,
        state,
        reload: async () => loadProjectionsSection({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger }),
        logger
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
        const start = selectedPeriod.startDate;
        const end = selectedPeriod.endDate;
        rows = rows.filter((row) => {
          const rowKey = typeof row.date === 'string' ? row.date : formatDateOnly(new Date(row.date));
          return rowKey >= start && rowKey <= end;
        });
      }
    }

    const accountMap = new Map((currentScenario?.accounts || []).map((account) => [Number(account.id), account]));
    const baseRows = rows.map((row, index) => {
      const accountId = Number(row?.accountId || 0);
      const account = accountMap.get(accountId);
      const accountTypeRaw = account?.type || row?.accountType;
      const accountType =
        accountTypeRaw && typeof accountTypeRaw === 'object'
          ? accountTypeRaw?.name
          : accountTypeRaw || 'Unassigned';
      const secondaryAccountId = Number(row?.secondaryAccountId || 0);
      const secondaryAccount = accountMap.get(secondaryAccountId);

      return {
        ...row,
        id: row.id ?? `${accountId}-${row?.date || index}`,
        account: account?.name || row?.accountName || row?.account || 'Unassigned',
        accountType,
        secondaryAccount: row?.secondaryAccountName || row?.secondaryAccount || secondaryAccount?.name || 'Unassigned'
      };
    });
    const groupedRows = explodeProjectionRowsBySecondary({
      rows: baseRows,
      scenario: currentScenario,
      state,
      accountMap
    });

    const groupByField = state?.getGroupBy?.() || '';

    renderProjectionsSummaryList({
      container: projectionsGridContainer,
      projections: groupedRows,
      accounts: currentScenario?.accounts || [],
      groupByField
    });
  } catch (err) {
    logger?.error?.('[Forecast] loadProjectionsSection failed', err);
  }
}

