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
