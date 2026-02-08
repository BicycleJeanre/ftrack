// forecast-projections.js
// Forecast projections filtering and totals rendering extracted from forecast.js.

import { parseDateOnly } from '../date-utils.js';

export function getFilteredProjections({
  currentScenario,
  transactionFilterAccountId,
  projectionPeriod,
  projectionPeriods
}) {
  if (!currentScenario) return [];

  let filtered = currentScenario.projections || [];

  if (transactionFilterAccountId) {
    filtered = filtered.filter(p => p.accountId === transactionFilterAccountId);
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

  const totals = (projections || []).reduce((acc, p) => {
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

  const toolbarTotals = container.querySelector('.toolbar-totals');
  if (toolbarTotals) {
    toolbarTotals.innerHTML = `
      <span class="toolbar-total-item"><span class="label">Income:</span> <span class="value positive">${formatCurrency(totals.income)}</span></span>
      <span class="toolbar-total-item"><span class="label">Expenses:</span> <span class="value negative">${formatCurrency(displayExpenses)}</span></span>
      <span class="toolbar-total-item"><span class="label">Net:</span> <span class="value ${totals.net >= 0 ? 'positive' : 'negative'}">${formatCurrency(totals.net)}</span></span>
    `;
  }
}
