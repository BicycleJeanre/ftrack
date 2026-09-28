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

export function renderTotalsCard(targetEl, {
  title = 'TOTALS',
  items = [],
  groups = [],
  columnsClass = 'budget-totals-rows'
} = {}) {
  if (!targetEl) return;

  const renderMetrics = (metricItems) => (Array.isArray(metricItems) ? metricItems : []).map((item) => {
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

  const normalizedGroups = Array.isArray(groups) ? groups : [];
  const contentHtml = normalizedGroups.length
    ? normalizedGroups.map((group) => {
      const groupKey = String(group?.key || group?.title || 'totals')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-');
      return `
        <section class="totals-group totals-group-${escapeAttr(groupKey)}">
          <div class="totals-group-title">${escapeHtml(group?.title || '')}</div>
          <div class="budget-totals-rows">${renderMetrics(group?.items)}</div>
        </section>
      `;
    }).join('')
    : renderMetrics(items);

  targetEl.innerHTML = `
    <div class="summary-card overall-total">
      <div class="summary-card-title">${escapeHtml(title)}</div>
      <div class="${escapeHtml(columnsClass)}">${contentHtml}</div>
    </div>
  `;
}
