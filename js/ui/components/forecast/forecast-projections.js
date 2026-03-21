// forecast-projections.js
// Forecast projections filtering and totals rendering extracted from forecast.js.

import { parseDateOnly } from '../../../shared/date-utils.js';
import { getScenarioProjectionRows } from '../../../shared/app-data-utils.js';
import { formatCurrency, numValueClass } from '../../../shared/format-utils.js';
import { renderTotalsCard } from '../widgets/totals-card.js';
import { calculateCapitalInterestFlowTotals } from '../../transforms/data-aggregators.js';
import { getGroupAccountIds } from '../../../domain/utils/account-group-utils.js';

export function getFilteredProjections({
  currentScenario,
  projectionsAccountFilterId,
  transactionFilterAccountId,
  projectionPeriod,
  projectionPeriods
}) {
  if (!currentScenario) return [];

  let filtered = getScenarioProjectionRows(currentScenario);

  const accountFilterId = projectionsAccountFilterId ?? transactionFilterAccountId;

  if (accountFilterId) {
    const filterLabel = String(accountFilterId);
    const groupPrefix = 'group:';
    if (filterLabel.startsWith(groupPrefix)) {
      const groupId = Number(filterLabel.slice(groupPrefix.length));
      const scopedIds = getGroupAccountIds(currentScenario.accountGroups || [], groupId);
      if (scopedIds.size > 0) {
        filtered = filtered.filter((p) => scopedIds.has(Number(p.accountId)));
      }
    } else {
      const accountExists = (currentScenario.accounts || []).some((a) => Number(a.id) === Number(accountFilterId));
      if (accountExists) {
        filtered = filtered.filter((p) => Number(p.accountId) === Number(accountFilterId));
      }
    }
  }

  if (projectionPeriod && projectionPeriods && projectionPeriods.length) {
    const selectedPeriod = projectionPeriods.find(p => p.id === projectionPeriod);
    if (selectedPeriod) {
      const startDate = selectedPeriod.startDate;
      const endDate = selectedPeriod.endDate;
      filtered = filtered.filter(p => {
        const projectionDate = typeof p.date === 'string' ? parseDateOnly(p.date) : new Date(p.date);
        return projectionDate >= startDate && projectionDate <= endDate;
      });
    }
  }

  return filtered;
}

export function updateProjectionTotals(container, projections) {
  if (!container) return;

  const rows = Array.isArray(projections) ? projections : [];

  const roundMoney = (value) => {
    const rounded = Math.round(Number(value || 0) * 100) / 100;
    return Object.is(rounded, -0) ? 0 : rounded;
  };

  const totals = rows.reduce((acc, p) => {
    const income = Number(p.income || 0);
    const expenses = Number(p.expenses || 0);
    const netChange = p.netChange !== undefined && p.netChange !== null
      ? Number(p.netChange)
      : (income - expenses);

    acc.income += income;
    acc.expenses += expenses;
    acc.net += netChange;
    return acc;
  }, { income: 0, expenses: 0, net: 0 });
  const splitTotals = calculateCapitalInterestFlowTotals(rows, {
    capitalInField: 'capitalIn',
    capitalOutField: 'capitalOut',
    interestInField: 'interestIn',
    interestOutField: 'interestOut'
  });

  const displayExpenses = -Math.abs(totals.expenses);

  const parseDateKey = (dateValue) => {
    if (!dateValue) return null;
    if (typeof dateValue === 'string') return dateValue;
    if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
      const yyyy = dateValue.getFullYear();
      const mm = String(dateValue.getMonth() + 1).padStart(2, '0');
      const dd = String(dateValue.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return String(dateValue);
  };

  const balancesByDate = new Map();
  rows.forEach((p) => {
    const dateKey = parseDateKey(p.date);
    if (!dateKey) return;
    const next = (balancesByDate.get(dateKey) || 0) + Number(p.balance || 0);
    balancesByDate.set(dateKey, next);
  });

  const dateKeys = Array.from(balancesByDate.keys()).sort();
  const firstDateKey = dateKeys.length ? dateKeys[0] : null;
  const lastDateKey = dateKeys.length ? dateKeys[dateKeys.length - 1] : null;
  const firstBalance = roundMoney(firstDateKey ? (balancesByDate.get(firstDateKey) || 0) : 0);
  const lastBalance = roundMoney(lastDateKey ? (balancesByDate.get(lastDateKey) || 0) : 0);
  const projectedNetChange = roundMoney(lastBalance - firstBalance);
  const totalIncome = roundMoney(totals.income);
  const totalExpenses = roundMoney(displayExpenses);
  const totalNet = roundMoney(totals.net);
  const capitalIn = roundMoney(splitTotals.capitalIn);
  const capitalOut = roundMoney(splitTotals.capitalOut);
  const interestIn = roundMoney(splitTotals.interestIn);
  const interestOut = roundMoney(splitTotals.interestOut);

  const items = [
    {
      label: `Start Balance${firstDateKey ? ` (${firstDateKey})` : ''}`,
      valueHtml: formatCurrency(firstBalance),
      valueClass: numValueClass(firstBalance),
      calc: 'Sum of balances on the first visible projection date.',
      uses: 'Baseline for trajectory discussions.',
      shows: 'Combined starting position for visible accounts.'
    },
    {
      label: `End Balance${lastDateKey ? ` (${lastDateKey})` : ''}`,
      valueHtml: formatCurrency(lastBalance),
      valueClass: numValueClass(lastBalance),
      calc: 'Sum of balances on the last visible projection date.',
      uses: 'Target/goal comparison at horizon.',
      shows: 'Combined ending position for visible accounts.'
    },
    {
      label: 'Projected Net Change',
      valueHtml: formatCurrency(projectedNetChange),
      valueClass: numValueClass(projectedNetChange),
      calc: 'End Balance − Start Balance.',
      uses: 'Highlights direction and magnitude of change.',
      shows: 'Overall balance movement across the visible horizon.'
    },
    {
      label: 'Income',
      valueHtml: formatCurrency(totalIncome),
      valueClass: 'positive',
      calc: 'Sum of visible projection income amounts.',
      uses: 'Capacity planning for savings/investments.',
      shows: 'Total expected inflows for the filtered view.'
    },
    {
      label: 'Expenses',
      valueHtml: formatCurrency(totalExpenses),
      valueClass: 'negative',
      calc: 'Sum of visible projection expense amounts.',
      uses: 'Pressure-testing budgets and burn rate.',
      shows: 'Total expected outflows for the filtered view.'
    },
    {
      label: 'Capital In',
      valueHtml: formatCurrency(capitalIn),
      valueClass: 'positive',
      calc: 'Sum of visible projection capital inflow buckets.',
      uses: 'Track base inflow movement independent from interest.',
      shows: 'Total projected capital inflows for the filtered view.'
    },
    {
      label: 'Interest In',
      valueHtml: formatCurrency(interestIn),
      valueClass: 'positive',
      calc: 'Sum of visible projection interest inflow buckets.',
      uses: 'Track interest-driven inflows separately.',
      shows: 'Total projected interest inflows for the filtered view.'
    },
    {
      label: 'Capital Out',
      valueHtml: formatCurrency(capitalOut),
      valueClass: 'negative',
      calc: 'Sum of visible projection capital outflow buckets.',
      uses: 'Track base outflow movement independent from interest.',
      shows: 'Total projected capital outflows for the filtered view.'
    },
    {
      label: 'Interest Out',
      valueHtml: formatCurrency(interestOut),
      valueClass: 'negative',
      calc: 'Sum of visible projection interest outflow buckets.',
      uses: 'Track interest-driven outflows separately.',
      shows: 'Total projected interest outflows for the filtered view.'
    },
    {
      label: 'Net',
      valueHtml: formatCurrency(totalNet),
      valueClass: numValueClass(totalNet),
      calc: 'Sum of visible net changes (income − expenses per row).',
      uses: 'Quick surplus/deficit signal.',
      shows: 'Net cashflow contribution for the filtered view.'
    }
  ];

  renderTotalsCard(container, { title: 'PROJECTION TOTALS', items });
}
