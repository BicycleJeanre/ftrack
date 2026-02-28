// toolbar-totals.js
// Render Money In / Money Out / Net totals into a toolbar container

import { numValueClass, formatCurrency } from '../../../shared/format-utils.js';

export function renderMoneyTotals(targetEl, totals, currency = 'ZAR') {
  if (!targetEl || !totals) return;

  const moneyIn = formatCurrency(totals.moneyIn || 0, currency);
  const moneyOut = formatCurrency(totals.moneyOut || 0, currency);
  const net = formatCurrency(totals.net || 0, currency);

  targetEl.innerHTML = `
      <span class="toolbar-total-item"><span class="label">Money In:</span> <span class="value positive">${moneyIn}</span></span>
      <span class="toolbar-total-item"><span class="label">Money Out:</span> <span class="value negative">${moneyOut}</span></span>
      <span class="toolbar-total-item"><span class="label">Net:</span> <span class="value ${numValueClass(totals.net)}">${net}</span></span>
    `;
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

  targetEl.innerHTML = `
      <span class="toolbar-total-item"><span class="label">Realized Net</span><span class="sublabel">Recorded actuals — income minus expenses</span><span class="value ${numValueClass(totals.actualNet)}">${actualNet}</span></span>
      <span class="toolbar-total-item"><span class="label">Planned Income</span><span class="sublabel">Total budgeted inflows</span><span class="value positive">${moneyIn}</span></span>
      <span class="toolbar-total-item"><span class="label">Planned Expenses</span><span class="sublabel">Total budgeted outflows</span><span class="value negative">${moneyOut}</span></span>
      <span class="toolbar-total-item"><span class="label">Planned Net Income</span><span class="sublabel">Budgeted income minus budgeted expenses</span><span class="value ${numValueClass(totals.net)}">${net}</span></span>
      <span class="toolbar-total-item"><span class="label">Open Commitments</span><span class="sublabel">Planned entries not yet recorded as actuals</span><span class="value negative">${plannedOutstanding}</span></span>
      <span class="toolbar-total-item"><span class="label">Forecast Position</span><span class="sublabel">Realized net minus open commitments</span><span class="value ${numValueClass(totals.plannedNetBalance)}">${plannedNetBalance}</span></span>
      <span class="toolbar-total-item"><span class="label">Unbudgeted Actuals</span><span class="sublabel">Actuals recorded with no corresponding budget entry</span><span class="value negative">${unplanned}</span></span>
    `;
}
