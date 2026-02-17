// forecast-projections.js
// Forecast projections filtering and totals rendering extracted from forecast.js.

import { parseDateOnly } from '../../../shared/date-utils.js';

export function getFilteredProjections({
  currentScenario,
  transactionFilterAccountId,
  projectionPeriod,
  projectionPeriods
}) {
  if (!currentScenario) return [];

  let filtered = currentScenario.projections || [];

  if (transactionFilterAccountId) {
    const accountExists = (currentScenario.accounts || []).some((a) => Number(a.id) === Number(transactionFilterAccountId));
    if (accountExists) {
      filtered = filtered.filter((p) => Number(p.accountId) === Number(transactionFilterAccountId));
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

  const formatCurrency = (value) => new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

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
  const totalIncome = roundMoney(totals.income);
  const totalExpenses = roundMoney(displayExpenses);
  const totalNet = roundMoney(totals.net);

  const toolbarTotals = container.querySelector('.toolbar-totals');
  if (toolbarTotals) {
    toolbarTotals.innerHTML = `
      <span class="toolbar-total-item"><span class="label">Start Bal${firstDateKey ? ` (${firstDateKey})` : ''}:</span> <span class="value ${firstBalance >= 0 ? 'positive' : 'negative'}">${formatCurrency(firstBalance)}</span></span>
      <span class="toolbar-total-item"><span class="label">End Bal${lastDateKey ? ` (${lastDateKey})` : ''}:</span> <span class="value ${lastBalance >= 0 ? 'positive' : 'negative'}">${formatCurrency(lastBalance)}</span></span>
      <span class="toolbar-total-item"><span class="label">Income:</span> <span class="value positive">${formatCurrency(totalIncome)}</span></span>
      <span class="toolbar-total-item"><span class="label">Expenses:</span> <span class="value negative">${formatCurrency(totalExpenses)}</span></span>
      <span class="toolbar-total-item"><span class="label">Net:</span> <span class="value ${totalNet >= 0 ? 'positive' : 'negative'}">${formatCurrency(totalNet)}</span></span>
    `;
  }
}
