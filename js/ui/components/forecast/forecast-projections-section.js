// forecast-projections-section.js
// Projections section/grid loader extracted from forecast.js (no behavior change).

import { createGrid, createDateColumn, createTextColumn, createMoneyColumn } from '../grids/grid-factory.js';
import { parseDateOnly, formatDateOnly } from '../../../shared/date-utils.js';
import { notifyError } from '../../../shared/notifications.js';
import { GridStateManager } from '../grids/grid-state.js';
import { getScenarioProjectionRows, getScenarioTimeframe } from '../../../shared/app-data-utils.js';
import { openTimeframeModal } from '../modals/timeframe-modal.js';
import { createFilterModal } from '../modals/filter-modal.js';
import { formatCurrency, formatMoneyDisplay, numValueClass } from '../../../shared/format-utils.js';
import { resolveScenarioOccurrences } from '../../../domain/queries/resolve-scenario-occurrences.js';
import { normalizeCanonicalTransaction, transformTransactionToRows } from '../../transforms/transaction-row-transformer.js';
import { getGroupAccountIds } from '../../../domain/utils/account-group-utils.js';
import {
  populateAccountSelect,
  syncSelectionDialog
} from '../widgets/account-selector-filter.js?v=20260901-account-group-filter-42';

import { getScenario, getScenarioPeriods } from '../../../app/services/data-service.js';
import { generateProjections } from '../../../domain/calculations/projection-engine.js?v=20260901-strategy-matrix-35';


const projectionsGridState = new GridStateManager('projections');
let lastProjectionsTable = null;
let projectionsDisplayMode = 'table';

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function aggregateProjectionRowsByDate(rows = []) {
  const byDate = new Map();
  rows.forEach((row) => {
    const date = typeof row?.date === 'string' ? row.date : formatDateOnly(new Date(row?.date));
    if (!date) return;
    const current = byDate.get(date) || { date, balance: 0, income: 0, expenses: 0 };
    current.balance += Number(row?.balance || 0);
    current.income += Number(row?.income || 0);
    current.expenses += Math.abs(Number(row?.expenses || 0));
    byDate.set(date, current);
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function filterProjectionRowsForChart({ rows = [], state, scenario }) {
  let filtered = [...rows];
  const accountFilter = state?.getProjectionAccountFilterId?.();
  if (accountFilter) {
    const label = String(accountFilter);
    if (label.startsWith('group:')) {
      const groupIds = getGroupAccountIds(
        scenario?.accountGroups || [],
        Number(label.split(':')[1] || 0)
      );
      filtered = filtered.filter((row) => groupIds.has(Number(row?.accountId)));
    } else {
      filtered = filtered.filter((row) => Number(row?.accountId) === Number(accountFilter));
    }
  }

  const selectedPeriodId = state?.getProjectionPeriod?.();
  const selectedPeriod = (state?.getProjectionPeriods?.() || [])
    .find((period) => period?.id === selectedPeriodId);
  if (selectedPeriod?.startDate && selectedPeriod?.endDate) {
    filtered = filtered.filter((row) => {
      const date = typeof row?.date === 'string' ? row.date : formatDateOnly(new Date(row?.date));
      return date >= selectedPeriod.startDate && date <= selectedPeriod.endDate;
    });
  }
  return filtered;
}

function appendSvgText(svg, text, x, y, className, anchor = 'start') {
  const label = createSvgElement('text', { x, y, class: className, 'text-anchor': anchor });
  label.textContent = text;
  svg.appendChild(label);
  return label;
}

function renderProjectionChart({ container, rows = [], mode = 'balance' }) {
  container.innerHTML = '';
  container.className = 'grid-container projections-grid projection-chart-host';
  const points = aggregateProjectionRowsByDate(rows);
  if (!points.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-message';
    empty.textContent = 'No projection data is available for this chart.';
    container.appendChild(empty);
    return;
  }

  const heading = document.createElement('div');
  heading.className = 'projection-chart-heading';
  heading.textContent = mode === 'cashflow' ? 'Projected money in and money out' : 'Projected balance trend';
  container.appendChild(heading);

  const frame = document.createElement('div');
  frame.className = 'projection-chart-frame';
  const width = Math.max(900, mode === 'cashflow' ? points.length * 56 : 900);
  const height = 360;
  const plot = { left: 76, top: 24, right: width - 24, bottom: height - 52 };
  const svg = createSvgElement('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': heading.textContent
  });
  svg.classList.add('projection-chart');

  const values = mode === 'cashflow'
    ? points.flatMap((point) => [point.income, point.expenses, 0])
    : points.flatMap((point) => [point.balance, 0]);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = Math.max(1, maxValue - minValue);
  const yFor = (value) => plot.bottom - ((value - minValue) / span) * (plot.bottom - plot.top);

  for (let tick = 0; tick <= 4; tick += 1) {
    const ratio = tick / 4;
    const value = maxValue - span * ratio;
    const y = plot.top + (plot.bottom - plot.top) * ratio;
    svg.appendChild(createSvgElement('line', {
      x1: plot.left,
      y1: y,
      x2: plot.right,
      y2: y,
      class: 'projection-chart-gridline'
    }));
    appendSvgText(svg, formatCurrency(value), plot.left - 10, y + 4, 'projection-chart-axis-label', 'end');
  }

  const zeroY = yFor(0);
  svg.appendChild(createSvgElement('line', {
    x1: plot.left,
    y1: zeroY,
    x2: plot.right,
    y2: zeroY,
    class: 'projection-chart-zero-line'
  }));

  if (mode === 'cashflow') {
    const slot = (plot.right - plot.left) / Math.max(1, points.length);
    const barWidth = Math.max(5, Math.min(18, slot * 0.3));
    points.forEach((point, index) => {
      const center = plot.left + slot * (index + 0.5);
      [
        { value: point.income, x: center - barWidth - 1, className: 'projection-chart-bar-in', label: 'Money in' },
        { value: point.expenses, x: center + 1, className: 'projection-chart-bar-out', label: 'Money out' }
      ].forEach((bar) => {
        const y = yFor(bar.value);
        const rect = createSvgElement('rect', {
          x: bar.x,
          y,
          width: barWidth,
          height: Math.max(1, zeroY - y),
          class: bar.className
        });
        const title = createSvgElement('title');
        title.textContent = `${point.date} · ${bar.label}: ${formatCurrency(bar.value)}`;
        rect.appendChild(title);
        svg.appendChild(rect);
      });
      if (points.length <= 18 || index % Math.ceil(points.length / 12) === 0) {
        appendSvgText(svg, point.date, center, height - 25, 'projection-chart-axis-label', 'middle');
      }
    });
  } else {
    const xFor = (index) => plot.left + ((plot.right - plot.left) * index) / Math.max(1, points.length - 1);
    const polyline = createSvgElement('polyline', {
      points: points.map((point, index) => `${xFor(index)},${yFor(point.balance)}`).join(' '),
      class: 'projection-chart-line'
    });
    svg.appendChild(polyline);
    points.forEach((point, index) => {
      const circle = createSvgElement('circle', {
        cx: xFor(index),
        cy: yFor(point.balance),
        r: 4,
        class: 'projection-chart-point'
      });
      const title = createSvgElement('title');
      title.textContent = `${point.date} · Balance: ${formatCurrency(point.balance)}`;
      circle.appendChild(title);
      svg.appendChild(circle);
      if (points.length <= 18 || index % Math.ceil(points.length / 12) === 0) {
        appendSvgText(svg, point.date, xFor(index), height - 25, 'projection-chart-axis-label', 'middle');
      }
    });
  }

  frame.appendChild(svg);
  container.appendChild(frame);

  const legend = document.createElement('div');
  legend.className = 'projection-chart-legend';
  legend.innerHTML = mode === 'cashflow'
    ? '<span><i class="projection-chart-key projection-chart-key--in"></i>Money in</span><span><i class="projection-chart-key projection-chart-key--out"></i>Money out</span>'
    : '<span><i class="projection-chart-key projection-chart-key--balance"></i>Total projected balance</span>';
  container.appendChild(legend);
}

function createHeaderFilterItem(labelText, control, className = '') {
  const item = document.createElement('div');
  item.className = `header-filter-item${className ? ` ${className}` : ''}`;
  if (labelText) {
    const label = document.createElement('label');
    label.textContent = labelText;
    if (control?.id) label.htmlFor = control.id;
    item.appendChild(label);
  }
  item.appendChild(control);
  return item;
}

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
  addMoneyField('Capital In', Number(rowData?.capitalIn || 0));
  addMoneyField('Capital Out', Math.abs(Number(rowData?.capitalOut || 0)));
  addMoneyField('Interest In', Number(rowData?.interestIn || 0));
  addMoneyField('Interest Out', Math.abs(Number(rowData?.interestOut || 0)));
  addMoneyField('Net Change', Number(rowData?.netChange || 0));

  detailsEl.appendChild(grid);
}

function getProjectionSourceOccurrences({ scenario, state }) {
  const projectionPeriods = state?.getProjectionPeriods?.() || [];
  if (!projectionPeriods.length) return [];

  const periodsWithBounds = projectionPeriods.filter((period) => period?.startDate && period?.endDate);
  if (!periodsWithBounds.length) return [];

  const startDateKey = periodsWithBounds[0].startDate;
  const endDateKey = periodsWithBounds[periodsWithBounds.length - 1].endDate;
  const startDate = parseDateOnly(startDateKey);
  const endDate = parseDateOnly(endDateKey);
  if (!startDate || !endDate) return [];

  return resolveScenarioOccurrences({
    scenario,
    startDate: startDateKey,
    endDate: endDateKey,
    asOfDate: scenario?.projection?.config?.asOfDate ?? null,
    openCommitmentStartDate:
      scenario?.projection?.config?.openCommitmentStartDate ?? null
  }).occurrences.filter(
    (occurrence) => occurrence.isIncludedInForecast && occurrence.validForProjection
  );
}

function normalizeProjectionOccurrenceForTransform(entry) {
  return normalizeCanonicalTransaction({
    id: entry.occurrenceKey,
    primaryAccountId: entry.primaryAccountId,
    secondaryAccountId: entry.secondaryAccountId,
    transactionTypeId: entry.transactionTypeId,
    amount: entry.forecastAmount,
    plannedAmount: entry.forecastAmount,
    actualAmount: null,
    description: entry.description,
    effectiveDate: entry.forecastDate,
    transactionGroupId: entry.transactionGroupId ?? null,
    transactionGroupRole: entry.transactionGroupRole ?? null,
    status: { name: 'planned', actualAmount: null, actualDate: null }
  });
}

function getPerspectiveSecondaryByAccountPeriod({ scenario, state, accountMap }) {
  const projectionPeriods = state?.getProjectionPeriods?.() || [];
  if (!projectionPeriods.length) return new Map();

  const occurrences = getProjectionSourceOccurrences({ scenario, state });
  if (!occurrences.length) return new Map();

  const toPeriodId = (dateValue) => {
    const dateKey = typeof dateValue === 'string' ? dateValue : formatDateOnly(dateValue);
    const period = projectionPeriods.find((p) => p?.startDate && p?.endDate && dateKey >= p.startDate && dateKey <= p.endDate);
    return period?.id || null;
  };

  const byAccountPeriod = new Map();
  occurrences.forEach((occurrence) => {
    const periodId = toPeriodId(occurrence?.forecastDate);
    if (!periodId) return;

    const transformedRows = transformTransactionToRows(
      normalizeProjectionOccurrenceForTransform(occurrence),
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
        capitalIn: Number(row?.capitalIn || 0) * ratio,
        capitalOut: Number(row?.capitalOut || 0) * ratio,
        interestIn: Number(row?.interestIn || 0) * ratio,
        interestOut: Number(row?.interestOut || 0) * ratio,
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
    empty.textContent = 'No projections available yet. Refresh projections to calculate this plan.';
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

    const content = document.createElement('div');
    content.className = 'grid-summary-content';

    const rowPrimary = document.createElement('div');
    rowPrimary.className = 'grid-summary-row-primary';

    const title = document.createElement('span');
    title.className = 'grid-summary-title';
    title.textContent = row?.accountName || row?.account || 'Account';

    const projAcct = accounts.find((a) => Number(a.id) === Number(row?.accountId));
    const projCurrency = projAcct?.currency?.code || projAcct?.currency?.name || 'ZAR';

    const balance = document.createElement('span');
    balance.className = `grid-summary-amount grid-summary-balance ${numValueClass(Number(row?.balance || 0))}`;
    balance.textContent = `Bal ${formatCurrency(Number(row?.balance || 0), projCurrency)}`;

    rowPrimary.appendChild(title);
    rowPrimary.appendChild(balance);

    const rowSecondary = document.createElement('div');
    rowSecondary.className = 'grid-summary-row-secondary';

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

    rowSecondary.appendChild(income);
    rowSecondary.appendChild(expenses);
    rowSecondary.appendChild(net);
    rowSecondary.appendChild(date);

    content.appendChild(rowPrimary);
    content.appendChild(rowSecondary);
    card.appendChild(content);
    list.appendChild(card);
  });
}

function applyProjectionsPeriodFilter({ projectionsTable = lastProjectionsTable, state, scenario } = {}) {
  if (!projectionsTable) return;

  const rawAccountFilterId = state?.getProjectionAccountFilterId?.() ?? null;
  const filterAsString = rawAccountFilterId == null ? '' : String(rawAccountFilterId);
  const isGroupScope = filterAsString.startsWith('group:');
  const projectionAccountFilterId = isGroupScope ? 0 : Number(rawAccountFilterId || 0);
  const scopedAccountIds = isGroupScope
    ? getGroupAccountIds(scenario?.accountGroups || [], Number(filterAsString.split(':')[1] || 0))
    : null;

  const projectionPeriod = state?.getProjectionPeriod?.();
  const projectionPeriods = state?.getProjectionPeriods?.() || [];
  const selectedPeriod = projectionPeriod ? projectionPeriods.find((p) => p.id === projectionPeriod) : null;

  const hasPeriodFilter = Boolean(selectedPeriod?.startDate && selectedPeriod?.endDate);
  const hasAccountScope = (scopedAccountIds && scopedAccountIds.size > 0) || Boolean(projectionAccountFilterId);
  if (!hasAccountScope && !hasPeriodFilter) {
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
    if (scopedAccountIds && scopedAccountIds.size > 0) {
      if (!scopedAccountIds.has(Number(row?.accountId))) return false;
    } else if (projectionAccountFilterId && Number(row?.accountId) !== projectionAccountFilterId) {
      return false;
    }
    if (!hasPeriodFilter) return true;
    const rowKey = toDateKey(row?.date);
    if (!rowKey) return false;
    return rowKey >= startKey && rowKey <= endKey;
  });
}

async function runProjectionHeaderAction({
  scenarioState,
  getWorkflowConfig,
  callbacks,
  reload,
  reason,
  periodWindowChanged = false,
  operation
}) {
  // Capture the click-time context before this action enters the controller's
  // serialized navigation queue. A scenario/workflow click that happens while
  // the action is waiting must make this request stale, rather than redirecting
  // the projection operation at whatever context is current when it executes.
  const requestedScenario = scenarioState?.get?.();
  const requestedScenarioId = Number(requestedScenario?.id || 0);
  const requestedWorkflowId = getWorkflowConfig?.()?.id || null;

  const action = async (isCurrentNavigation = () => true) => {
    const isStillCurrent = () => (
      isCurrentNavigation() &&
      Number(scenarioState?.get?.()?.id || 0) === requestedScenarioId &&
      (!requestedWorkflowId || getWorkflowConfig?.()?.id === requestedWorkflowId)
    );
    if (!requestedScenarioId || !isStillCurrent()) return false;

    await operation({
      scenario: requestedScenario,
      scenarioId: requestedScenarioId
    });
    if (!isStillCurrent()) return false;

    const refreshed = await getScenario(requestedScenarioId);
    if (!refreshed || !isStillCurrent()) return false;

    scenarioState?.set?.(refreshed);
    // The controller owns the wider Plan & Actuals + Projections refresh when
    // the scenario timeframe changed. Standalone consumers still receive the
    // component-local reload fallback.
    if (
      !periodWindowChanged ||
      typeof callbacks?.runProjectionNavigation !== 'function'
    ) {
      await reload();
    }
    return isStillCurrent();
  };

  if (typeof callbacks?.runProjectionNavigation === 'function') {
    return callbacks.runProjectionNavigation(action, {
      reason,
      periodWindowChanged
    });
  }
  return action();
}

async function buildProjectionsHeaderControls({
  controls,
  container,
  currentScenario,
  scenarioState,
  getWorkflowConfig,
  state,
  callbacks,
  reload,
  logger
}) {
  const isRenderCurrent = () => callbacks?.isRenderCurrent?.() !== false;
  if (!isRenderCurrent()) return;
  controls.innerHTML = '';

  const regenBtn = document.createElement('button');
  regenBtn.className = 'icon-btn';
  regenBtn.title = 'Refresh projections now';
  regenBtn.textContent = '↺';
  regenBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const prevText = regenBtn.textContent;
    try {
      regenBtn.textContent = '…';
      regenBtn.disabled = true;
      await runProjectionHeaderAction({
        scenarioState,
        getWorkflowConfig,
        callbacks,
        reload,
        reason: 'manual projection refresh',
        operation: ({ scenario, scenarioId }) => {
          const projConfig = getScenarioTimeframe(scenario);
          return generateProjections(scenarioId, {
            startDate: projConfig.startDate,
            endDate: projConfig.endDate,
            periodTypeId: projConfig.periodTypeId
          });
        }
      });
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
  setPeriodBtn.title = 'Set scenario timeframe';
  setPeriodBtn.textContent = '⊞';
  setPeriodBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const scenario = scenarioState?.get?.();
    const projConfig = getScenarioTimeframe(scenario);
    openTimeframeModal({
      title: 'Set Scenario Timeframe',
      showPeriodType: true,
      defaultPeriodTypeId: projConfig.periodTypeId || 3,
      defaultStartDate: projConfig.startDate || null,
      defaultEndDate: projConfig.endDate || null,
      confirmTitle: 'Save scenario timeframe',
      onConfirm: async ({ startDate, endDate, periodTypeId }) => {
        try {
          setPeriodBtn.disabled = true;
          await runProjectionHeaderAction({
            scenarioState,
            getWorkflowConfig,
            callbacks,
            reload,
            reason: 'set scenario timeframe',
            periodWindowChanged: true,
            operation: ({ scenarioId }) => generateProjections(scenarioId, {
              startDate,
              endDate,
              periodTypeId
            })
          });
        } catch (err) {
          notifyError('Failed to set scenario timeframe: ' + (err?.message || String(err)));
        } finally {
          if (setPeriodBtn.isConnected) setPeriodBtn.disabled = false;
        }
      }
    });
  });

  // Create filter controls
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
  if (!isRenderCurrent()) return;

  let projectionPeriod = state?.getProjectionPeriod?.();
  const hasValidPeriod = projectionPeriod && projectionPeriods.some((p) => p.id === projectionPeriod);
  if (projectionPeriod && !hasValidPeriod) {
    projectionPeriod = null;
    state?.setProjectionPeriod?.(null);
  }

  // Account filter
  const accountSelect = document.createElement('select');
  accountSelect.id = 'projections-account-filter-select';
  accountSelect.className = 'input-select';
  const activeAccount = state?.getProjectionAccountFilterId?.();
  let projectionAccountScope = '';
  let inlineAccountSelect = null;
  const accountGroupViewOptions = (currentScenario.accountGroups || [])
    .map((group) => ({
      value: `group:${Number(group?.id || 0)}`,
      label: `View entire group: ${group?.name || `#${Number(group?.id || 0)}`}`
    }))
    .filter((option) => option.value !== 'group:0');
  const populateProjectionAccountPicker = (select, selectedValue) => {
    populateAccountSelect(select, {
      accounts: currentScenario.accounts || [],
      accountGroups: currentScenario.accountGroups || [],
      scope: projectionAccountScope,
      selectedValue,
      includeAll: false,
      emptyLabel: 'All Accounts',
      emptyValue: '0',
      extraOptions: accountGroupViewOptions,
      onScopeChange: (nextScope, { selectedValue: nextValue }) => {
        projectionAccountScope = nextScope;
        const peer = select === accountSelect ? inlineAccountSelect : accountSelect;
        if (peer) populateProjectionAccountPicker(peer, nextValue);
      }
    });
  };
  populateProjectionAccountPicker(
    accountSelect,
    activeAccount != null ? String(activeAccount) : '0'
  );
  accountSelect.addEventListener('change', async () => {
    const selectedValue = accountSelect.value || '0';
    let nextScope = null;
    if (selectedValue !== '0') {
      nextScope = selectedValue.startsWith('group:') ? selectedValue : (Number(selectedValue) || null);
    }
    state?.setProjectionAccountFilterId?.(nextScope);
    
    if (lastProjectionsTable) {
      const currentGroup = state?.getGroupBy?.() || '';
      if (currentGroup === 'secondaryAccount') {
        await reload();
      } else {
        applyProjectionsPeriodFilter({ projectionsTable: lastProjectionsTable, state, scenario: currentScenario });
      }
      callbacks?.updateProjectionTotals?.();
    } else {
      await reload();
    }
  });

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

  const displaySelect = document.createElement('select');
  displaySelect.id = 'projections-display-select';
  displaySelect.className = 'input-select';
  [
    { value: 'table', label: 'Table' },
    { value: 'balance', label: 'Balance trend' },
    { value: 'cashflow', label: 'Cash flow' }
  ].forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    displaySelect.appendChild(option);
  });
  displaySelect.value = projectionsDisplayMode;
  displaySelect.addEventListener('change', async () => {
    projectionsDisplayMode = displaySelect.value || 'table';
    await reload();
  });

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
      applyProjectionsPeriodFilter({ projectionsTable: lastProjectionsTable, state, scenario: currentScenario });
      callbacks?.updateProjectionTotals?.();
    } else {
      await reload();
    }
  });

  const periodIds = [null, ...(projectionPeriods.map((p) => p.id || null))];
  const setPeriodSelection = async (id) => {
    periodSelect.value = id || '';
    state?.setProjectionPeriod?.(id || null);
    
    if (lastProjectionsTable) {
      applyProjectionsPeriodFilter({ projectionsTable: lastProjectionsTable, state, scenario: currentScenario });
      callbacks?.updateProjectionTotals?.();
    } else {
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

  // Create period nav container
  const periodNav = document.createElement('div');
  periodNav.className = 'period-nav';
  periodNav.appendChild(prevBtn);
  periodNav.appendChild(nextBtn);

  // Create filter button and modal
  const filterButton = document.createElement('button');
  filterButton.type = 'button';
  filterButton.className = 'icon-btn';
  filterButton.title = 'Open filters';
  filterButton.textContent = '⚙';
  filterButton.setAttribute('aria-label', 'Filters');

  inlineAccountSelect = document.createElement('select');
  inlineAccountSelect.className = accountSelect.className;
  inlineAccountSelect.id = 'projections-account-filter-select-inline';
  populateProjectionAccountPicker(inlineAccountSelect, accountSelect.value);

  const inlineViewSelect = viewSelect.cloneNode(true);
  inlineViewSelect.id = 'projections-viewby-select-inline';
  inlineViewSelect.value = viewSelect.value;

  const inlinePeriodSelect = periodSelect.cloneNode(true);
  inlinePeriodSelect.id = 'projections-period-select-inline';
  inlinePeriodSelect.value = periodSelect.value;

  const inlinePrevBtn = document.createElement('button');
  inlinePrevBtn.type = 'button';
  inlinePrevBtn.className = 'period-btn';
  inlinePrevBtn.textContent = '<';
  inlinePrevBtn.title = 'Previous period';

  const inlineNextBtn = document.createElement('button');
  inlineNextBtn.type = 'button';
  inlineNextBtn.className = 'period-btn';
  inlineNextBtn.textContent = '>';
  inlineNextBtn.title = 'Next period';

  const inlinePeriodNav = document.createElement('div');
  inlinePeriodNav.className = 'period-nav';
  inlinePeriodNav.appendChild(inlinePrevBtn);
  inlinePeriodNav.appendChild(inlineNextBtn);

  const inlineGroupSelect = groupSelect.cloneNode(true);
  inlineGroupSelect.id = 'projections-grouping-select-inline';
  inlineGroupSelect.value = groupSelect.value;

  const inlineDisplaySelect = displaySelect.cloneNode(true);
  inlineDisplaySelect.id = 'projections-display-select-inline';
  inlineDisplaySelect.value = displaySelect.value;

  const inlineFilters = document.createElement('div');
  inlineFilters.className = 'card-inline-filters projections-inline-filters';
  inlineFilters.appendChild(createHeaderFilterItem('Account', inlineAccountSelect, 'filter-account'));
  inlineFilters.appendChild(createHeaderFilterItem('View', inlineViewSelect, 'filter-period-type'));
  inlineFilters.appendChild(createHeaderFilterItem('Period', inlinePeriodSelect, 'filter-period'));
  inlineFilters.appendChild(createHeaderFilterItem('', inlinePeriodNav, 'filter-period-nav'));
  inlineFilters.appendChild(createHeaderFilterItem('Group', inlineGroupSelect, 'filter-group'));
  inlineFilters.appendChild(createHeaderFilterItem('Display', inlineDisplaySelect, 'filter-display'));

  const inlineRegenBtn = document.createElement('button');
  inlineRegenBtn.className = 'icon-btn card-inline-action';
  inlineRegenBtn.title = 'Refresh projections now';
  inlineRegenBtn.textContent = '↺';

  const inlineSetPeriodBtn = document.createElement('button');
  inlineSetPeriodBtn.className = 'icon-btn card-inline-action';
  inlineSetPeriodBtn.title = 'Set scenario timeframe';
  inlineSetPeriodBtn.textContent = '⊞';

  const freshness = document.createElement('span');
  const isStale = currentScenario?.projection?.stale === true ||
    Boolean(currentScenario?.projection?.staleAt);
  const isCurrent = Boolean(currentScenario?.projection?.generatedAt) && !isStale;
  const isRefreshing =
    document.documentElement.dataset.projectionRefreshingScenarioId ===
    String(currentScenario?.id ?? '');
  freshness.className =
    `projection-freshness projection-freshness--${isStale ? 'stale' : (isCurrent ? 'current' : 'pending')}`;
  freshness.classList.toggle('is-refreshing', isRefreshing);
  freshness.textContent = isStale
    ? (isRefreshing ? 'Stale · refreshing' : 'Stale')
    : (isCurrent ? 'Current' : (isRefreshing ? 'Pending · refreshing' : 'Pending'));
  freshness.title = isStale
    ? (currentScenario?.projection?.staleReason || 'The plan changed after this projection was generated.')
    : (isCurrent ? `Generated ${currentScenario.projection.generatedAt}` : 'Projection has not been generated yet.');
  freshness.setAttribute('role', 'status');

  const modalActions = document.createElement('div');
  modalActions.className = 'modal-filter-actions';
  modalActions.appendChild(regenBtn);
  modalActions.appendChild(setPeriodBtn);

  const filterModal = createFilterModal({
    id: 'projections-filter-modal',
    title: 'Filter Projections',
    trigger: filterButton,
    items: [
      { id: 'account', label: 'Account:', control: accountSelect },
      { id: 'period-type', label: 'Period Type:', control: viewSelect },
      { id: 'period', label: 'Period:', control: periodSelect, suffix: periodNav },
      { id: 'group-by', label: 'Group By:', control: groupSelect },
      { id: 'display', label: 'Display:', control: displaySelect },
      { id: 'actions', label: 'Actions:', control: modalActions }
    ]
  });

  filterButton.style.marginLeft = 'auto';
  controls.appendChild(freshness);
  controls.appendChild(inlineFilters);
  controls.appendChild(inlineRegenBtn);
  controls.appendChild(inlineSetPeriodBtn);
  controls.appendChild(filterButton);

  accountSelect.addEventListener('change', () => {
    inlineAccountSelect.value = accountSelect.value;
    syncSelectionDialog(inlineAccountSelect);
  });
  groupSelect.addEventListener('change', () => { inlineGroupSelect.value = groupSelect.value; });
  periodSelect.addEventListener('change', () => { inlinePeriodSelect.value = periodSelect.value; });

  inlineAccountSelect.addEventListener('change', async () => {
    accountSelect.value = inlineAccountSelect.value;
    syncSelectionDialog(accountSelect);
    accountSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });

  inlineViewSelect.addEventListener('change', async () => {
    viewSelect.value = inlineViewSelect.value;
    viewSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });

  inlinePeriodSelect.addEventListener('change', async () => {
    periodSelect.value = inlinePeriodSelect.value;
    await setPeriodSelection(inlinePeriodSelect.value || null);
  });

  inlinePrevBtn.addEventListener('click', async (e) => { e.preventDefault(); await changePeriodBy(-1); });
  inlineNextBtn.addEventListener('click', async (e) => { e.preventDefault(); await changePeriodBy(1); });

  inlineGroupSelect.addEventListener('change', async () => {
    groupSelect.value = inlineGroupSelect.value;
    groupSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });

  inlineDisplaySelect.addEventListener('change', async () => {
    displaySelect.value = inlineDisplaySelect.value;
    displaySelect.dispatchEvent(new Event('change', { bubbles: true }));
  });

  inlineRegenBtn.addEventListener('click', (e) => { e.stopPropagation(); regenBtn.click(); });
  inlineSetPeriodBtn.addEventListener('click', (e) => { e.stopPropagation(); setPeriodBtn.click(); });
}

function ensureProjectionsTotalsContainer(container) {
  if (!container) return null;

  let totalsContainer = container.querySelector(':scope > #projectionsTotals');
  if (!totalsContainer) {
    totalsContainer = document.createElement('div');
    totalsContainer.id = 'projectionsTotals';
    // Reuse existing totals container spacing/layout rules where possible.
    totalsContainer.className = 'projections-totals-container budget-totals-container';
    container.insertBefore(totalsContainer, container.firstChild);
  }

  return totalsContainer;
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
  const isRenderCurrent = () => callbacks?.isRenderCurrent?.() !== false;
  if (!isRenderCurrent()) return;
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
        getWorkflowConfig,
        state,
        callbacks,
        reload: reloadGrid,
        logger
      });
    }
  }
  if (!isRenderCurrent()) return;

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

    const totalsContainer = ensureProjectionsTotalsContainer(container);

    // Keep totals + grid containers stable to avoid scroll jumps.
    Array.from(container.children)
      .filter((child) => child !== totalsContainer && child !== projectionsGridContainer)
      .forEach((child) => child.remove());

    if (totalsContainer && totalsContainer.parentNode === container) {
      if (container.firstChild !== totalsContainer) {
        container.insertBefore(totalsContainer, container.firstChild);
      }
    } else if (totalsContainer) {
      container.insertBefore(totalsContainer, container.firstChild);
    }

    if (projectionsGridContainer.parentNode !== container) {
      container.appendChild(projectionsGridContainer);
    } else {
      // Ensure grid stays after totals container.
      container.appendChild(projectionsGridContainer);
    }

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
      const interestNet = Number(row.interest || 0);
      const fallbackInterestIn = interestNet > 0 ? interestNet : 0;
      const fallbackInterestOut = interestNet < 0 ? Math.abs(interestNet) : 0;
      const interestIn = Number(row.interestIn ?? fallbackInterestIn);
      const interestOut = Number(row.interestOut ?? fallbackInterestOut);
      const capitalIn = Number(row.capitalIn ?? Math.max(0, income - interestIn));
      const capitalOut = Number(row.capitalOut ?? Math.max(0, expenses - interestOut));
      return {
        ...row,
        id: row.id ?? `${accountId || 'account'}-${row.date || index}`,
        account: account?.name || row.accountName || '',
        secondaryAccount: row.secondaryAccountName || row.secondaryAccount || secondaryAccount?.name || 'Unassigned',
        accountType: accountTypeName,
        balance: Number(row.balance || 0),
        income,
        expenses,
        netChange,
        capitalIn,
        capitalOut,
        interestIn,
        interestOut
      };
    });

    const tableData = explodeProjectionRowsBySecondary({
      rows: tableDataBase,
      scenario: currentScenario,
      state,
      accountMap
    });

    if (projectionsDisplayMode !== 'table') {
      try {
        await lastProjectionsTable?.destroy?.();
      } catch (_) {
        // Ignore cleanup failures when switching presentation.
      }
      lastProjectionsTable = null;
      const chartRows = filterProjectionRowsForChart({
        rows: tableData,
        state,
        scenario: currentScenario
      });
      callbacks?.updateProjectionTotals?.(totalsContainer, chartRows);
      renderProjectionChart({
        container: projectionsGridContainer,
        rows: chartRows,
        mode: projectionsDisplayMode
      });
      return;
    }

    projectionsGridContainer.className = 'grid-container projections-grid grid-detail';

    try {
      await lastProjectionsTable?.destroy?.();
    } catch (_) {
      // ignore
    }
    if (!isRenderCurrent()) return;

    const nextProjectionsTable = await createGrid(projectionsGridContainer, {
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
        createMoneyColumn('Capital In', 'capitalIn', { topCalc: 'sum' }),
        createMoneyColumn('Capital Out', 'capitalOut', { topCalc: 'sum' }),
        createMoneyColumn('Interest In', 'interestIn', { topCalc: 'sum' }),
        createMoneyColumn('Interest Out', 'interestOut', { topCalc: 'sum' }),
        createMoneyColumn('Net Change', 'netChange', { topCalc: 'sum' })
      ],
      initialSort: [{ column: 'date', dir: 'asc' }],
      rowFormatter: (row) => renderProjectionsRowDetails({ row, rowData: row.getData() })
    });
    if (!isRenderCurrent()) {
      try {
        nextProjectionsTable?.destroy?.();
      } catch (_) {
        // Ignore cleanup failures for a render superseded during grid creation.
      }
      return;
    }
    lastProjectionsTable = nextProjectionsTable;

    // Keep totals in sync with Tabulator filtering (period/account filters, header filters, etc.).
    try {
      lastProjectionsTable.on('dataFiltered', (_filters, rows) => {
        const data = Array.isArray(rows) ? rows.map((r) => r?.getData?.()).filter(Boolean) : [];
        callbacks?.updateProjectionTotals?.(totalsContainer, data);
      });
    } catch (_) {
      // ignore
    }

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
        applyProjectionsPeriodFilter({ projectionsTable: lastProjectionsTable, state, scenario: currentScenario });
      } catch (_) {
        // ignore
      }
      try {
        const active = lastProjectionsTable?.getData?.('active') || [];
        callbacks?.updateProjectionTotals?.(totalsContainer, active);
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
  const isRenderCurrent = () => callbacks?.isRenderCurrent?.() !== false;
  if (!isRenderCurrent()) return;
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
        getWorkflowConfig,
        state,
        callbacks,
        reload: async () => loadProjectionsSection({ container, scenarioState, getWorkflowConfig, state, tables, callbacks, logger }),
        logger
      });
    }
  }
  if (!isRenderCurrent()) return;

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

  const totalsContainer = ensureProjectionsTotalsContainer(container);

  let projectionsGridContainer = container.querySelector('#projectionsGrid');
  if (!projectionsGridContainer) {
    projectionsGridContainer = document.createElement('div');
    projectionsGridContainer.id = 'projectionsGrid';
    projectionsGridContainer.className = 'grid-container projections-grid';
    window.add(container, projectionsGridContainer);
  }

  projectionsGridContainer.classList.remove('grid-detail');
  if (totalsContainer && projectionsGridContainer && totalsContainer.nextSibling !== projectionsGridContainer) {
    try {
      container.insertBefore(totalsContainer, projectionsGridContainer);
    } catch (_) {
      // ignore
    }
  }

  try {
    if (!isRenderCurrent()) return;
    try {
      lastProjectionsTable = null;
    } catch (_) {
      // ignore
    }

    let rows = getScenarioProjectionRows(currentScenario);
    const accountFilterId = state?.getProjectionAccountFilterId?.();
    if (accountFilterId) {
      const filterLabel = String(accountFilterId);
      if (filterLabel.startsWith('group:')) {
        const scopedIds = getGroupAccountIds(currentScenario?.accountGroups || [], Number(filterLabel.split(':')[1] || 0));
        if (scopedIds.size > 0) {
          rows = rows.filter((row) => scopedIds.has(Number(row.accountId)));
        }
      } else {
        rows = rows.filter((row) => Number(row.accountId) === Number(accountFilterId));
      }
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
    if (!isRenderCurrent()) return;

    // Update totals before rendering list (keeps totals visible even if list is empty).
    try {
      callbacks?.updateProjectionTotals?.(totalsContainer, groupedRows);
    } catch (_) {
      // ignore
    }

    const groupByField = state?.getGroupBy?.() || '';

    if (projectionsDisplayMode !== 'table') {
      try {
        await lastProjectionsTable?.destroy?.();
      } catch (_) {
        // Ignore cleanup failures when switching presentation.
      }
      lastProjectionsTable = null;
      renderProjectionChart({
        container: projectionsGridContainer,
        rows: groupedRows,
        mode: projectionsDisplayMode
      });
      return;
    }

    projectionsGridContainer.className = 'grid-container projections-grid';

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
