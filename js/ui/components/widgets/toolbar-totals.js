// toolbar-totals.js
// Render Money In / Money Out / Net totals into a toolbar container

export function renderMoneyTotals(targetEl, totals, currency = 'ZAR') {
  if (!targetEl || !totals) return;

  const formatter = new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const moneyIn = formatter.format(totals.moneyIn || 0);
  const moneyOut = formatter.format(totals.moneyOut || 0);
  const net = formatter.format(totals.net || 0);

  targetEl.innerHTML = `
      <span class="toolbar-total-item"><span class="label">Money In:</span> <span class="value positive">${moneyIn}</span></span>
      <span class="toolbar-total-item"><span class="label">Money Out:</span> <span class="value negative">${moneyOut}</span></span>
      <span class="toolbar-total-item"><span class="label">Net:</span> <span class="value ${totals.net >= 0 ? 'positive' : 'negative'}">${net}</span></span>
    `;
}

export function renderBudgetTotals(targetEl, totals, currency = 'ZAR') {
  if (!targetEl || !totals) return;

  const formatter = new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const moneyIn = formatter.format(totals.moneyIn || 0);
  const moneyOut = formatter.format(totals.moneyOut || 0);
  const net = formatter.format(totals.net || 0);
  const actualNet = formatter.format(totals.actualNet || 0);
  const plannedOutstanding = formatter.format(totals.plannedOutstanding || 0);
  const plannedNetBalance = formatter.format(totals.plannedNetBalance || 0);
  const unplanned = formatter.format(totals.unplanned || 0);

  targetEl.innerHTML = `
      <span class="toolbar-total-item"><span class="label">Realized Net</span><span class="sublabel">Recorded actuals — income minus expenses</span><span class="value ${totals.actualNet >= 0 ? 'positive' : 'negative'}">${actualNet}</span></span>
      <span class="toolbar-total-item"><span class="label">Planned Income</span><span class="sublabel">Total budgeted inflows</span><span class="value positive">${moneyIn}</span></span>
      <span class="toolbar-total-item"><span class="label">Planned Expenses</span><span class="sublabel">Total budgeted outflows</span><span class="value negative">${moneyOut}</span></span>
      <span class="toolbar-total-item"><span class="label">Planned Net Income</span><span class="sublabel">Budgeted income minus budgeted expenses</span><span class="value ${totals.net >= 0 ? 'positive' : 'negative'}">${net}</span></span>
      <span class="toolbar-total-item"><span class="label">Open Commitments</span><span class="sublabel">Planned entries not yet recorded as actuals</span><span class="value negative">${plannedOutstanding}</span></span>
      <span class="toolbar-total-item"><span class="label">Forecast Position</span><span class="sublabel">Realized net minus open commitments</span><span class="value ${totals.plannedNetBalance >= 0 ? 'positive' : 'negative'}">${plannedNetBalance}</span></span>
      <span class="toolbar-total-item"><span class="label">Unbudgeted Actuals</span><span class="sublabel">Actuals recorded with no corresponding budget entry</span><span class="value negative">${unplanned}</span></span>
    `;
}
