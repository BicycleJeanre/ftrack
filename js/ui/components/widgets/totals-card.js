// totals-card.js
// Shared renderer for self-describing totals cards (Calc / Uses / Shows).

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value) {
  // HTML attributes need quotes escaped; we also encode newlines for `title=""`.
  return escapeHtml(value).replaceAll('\n', '&#10;');
}

function toTooltip({ calc = '', uses = '', shows = '' } = {}) {
  const lines = [];
  if (calc) lines.push(`Calc: ${calc}`);
  if (uses) lines.push(`Uses: ${uses}`);
  if (shows) lines.push(`Shows: ${shows}`);
  return lines.join('\n');
}

export function renderTotalsCard(targetEl, { title = 'TOTALS', items = [], columnsClass = 'budget-totals-rows' } = {}) {
  if (!targetEl) return;

  const metricHtml = (Array.isArray(items) ? items : []).map((item) => {
    const label = item?.label ?? '';
    const valueHtml = item?.valueHtml ?? '';
    const valueClass = item?.valueClass ? ` ${item.valueClass}` : '';
    const tooltip = toTooltip({
      calc: item?.calc || '',
      uses: item?.uses || '',
      shows: item?.shows || ''
    });
    const tooltipAttr = tooltip ? ` data-tooltip="${escapeAttr(tooltip)}"` : '';
    const tooltipCls = tooltip ? ' has-tooltip' : '';

    return `
      <div class="total-metric">
        <div class="summary-card-row">
          <span class="label${tooltipCls}"${tooltipAttr}>${escapeHtml(label)}</span>
          <span class="value${valueClass}${tooltipCls}"${tooltipAttr}>${valueHtml}</span>
        </div>
      </div>
    `;
  }).join('');

  targetEl.innerHTML = `
    <div class="summary-card overall-total">
      <div class="summary-card-title">${escapeHtml(title)}</div>
      <div class="${escapeHtml(columnsClass)}">${metricHtml}</div>
    </div>
  `;
}
