// toolbar-totals.js
// Render Money In / Money Out / Net totals into a toolbar container

import { numValueClass, formatCurrency } from '../../../shared/format-utils.js';

export function renderMoneyTotals(targetEl, totals, currency = 'ZAR') {
  if (!targetEl || !totals) return;

  const moneyIn = formatCurrency(totals.moneyIn || 0, currency);
  const moneyOut = formatCurrency(totals.moneyOut || 0, currency);
  const net = formatCurrency(totals.net || 0, currency);

  const items = [
    { label: 'Money In', value: moneyIn, cls: 'positive' },
    { label: 'Money Out', value: moneyOut, cls: 'negative' },
    { label: 'Net', value: net, cls: numValueClass(totals.net) }
  ];

  const rows = items.map(({ label, value, cls }) =>
    `<div class="summary-card-row"><span class="label">${label}</span><span class="value ${cls}">${value}</span></div>`
  ).join('');

  targetEl.innerHTML =
    `<div class="summary-card overall-total">
      <div class="summary-card-title">TRANSACTION TOTALS</div>
      <div class="budget-totals-rows">${rows}</div>
    </div>`;
}

export function renderBudgetTotals(targetEl, totals, currency = 'ZAR') {
  if (!targetEl || !totals) return;

  const moneyIn = formatCurrency(totals.moneyIn || 0, currency);
  const moneyOut = formatCurrency(totals.moneyOut || 0, currency);
  const net = formatCurrency(totals.net || 0, currency);
  const actualNet = formatCurrency(totals.actualNet || 0, currency);
  const plannedOutstanding = formatCurrency(totals.plannedOutstanding || 0, currency);
  const plannedNetBalance = formatCurrency(totals.plannedNetBalance || 0, currency);
  const unplanned = formatCurrency(totals.unplanned || 0, currency);

  const items = [
    { label: 'Realized Net', value: actualNet, cls: numValueClass(totals.actualNet) },
    { label: 'Planned Income', value: moneyIn, cls: 'positive' },
    { label: 'Planned Expenses', value: moneyOut, cls: 'negative' },
    { label: 'Planned Net Income', value: net, cls: numValueClass(totals.net) },
    { label: 'Open Commitments', value: plannedOutstanding, cls: 'negative' },
    { label: 'Forecast Position', value: plannedNetBalance, cls: numValueClass(totals.plannedNetBalance) },
    { label: 'Unbudgeted Actuals', value: unplanned, cls: 'negative' }
  ];

  const rows = items.map(({ label, value, cls }) =>
    `<div class="summary-card-row"><span class="label">${label}</span><span class="value ${cls}">${value}</span></div>`
  ).join('');

  targetEl.innerHTML =
    `<div class="summary-card overall-total">
      <div class="summary-card-title">BUDGET TOTALS</div>
      <div class="budget-totals-rows">${rows}</div>
    </div>`;
}
