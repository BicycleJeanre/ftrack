// toolbar-totals.js
// Render Money In / Money Out / Net totals into a toolbar container

import { numValueClass, formatCurrency } from '../../../shared/format-utils.js';
import { renderTotalsCard } from './totals-card.js';

export function renderMoneyTotals(targetEl, totals, currency = 'ZAR') {
  if (!targetEl || !totals) return;

  const moneyIn = formatCurrency(totals.moneyIn || 0, currency);
  const moneyOut = formatCurrency(totals.moneyOut || 0, currency);
  const net = formatCurrency(totals.net || 0, currency);
  const capitalIn = formatCurrency(totals.capitalIn || 0, currency);
  const capitalOut = formatCurrency(totals.capitalOut || 0, currency);
  const interestIn = formatCurrency(totals.interestIn || 0, currency);
  const interestOut = formatCurrency(totals.interestOut || 0, currency);
  const hasSplitTotals =
    Math.abs(Number(totals.capitalIn || 0)) > 0 ||
    Math.abs(Number(totals.capitalOut || 0)) > 0 ||
    Math.abs(Number(totals.interestIn || 0)) > 0 ||
    Math.abs(Number(totals.interestOut || 0)) > 0;

  const items = hasSplitTotals
    ? [
      {
        label: 'Capital In',
        valueHtml: capitalIn,
        valueClass: 'positive',
        calc: 'Sum of inflow capital components for visible rows.',
        uses: 'Track principal/base inflow movement.',
        shows: 'Total capital inflows for the current view.'
      },
      {
        label: 'Interest In',
        valueHtml: interestIn,
        valueClass: 'positive',
        calc: 'Sum of inflow interest components for visible rows.',
        uses: 'Track interest-driven inflow movement.',
        shows: 'Total interest inflows for the current view.'
      },
      {
        label: 'Money In',
        valueHtml: moneyIn,
        valueClass: 'positive',
        calc: 'Capital In + Interest In.',
        uses: 'Single total inflow view.',
        shows: 'Total inflows for the current view.'
      },
      {
        label: 'Capital Out',
        valueHtml: capitalOut,
        valueClass: 'negative',
        calc: 'Sum of outflow capital components for visible rows.',
        uses: 'Track principal/base outflow movement.',
        shows: 'Total capital outflows for the current view.'
      },
      {
        label: 'Interest Out',
        valueHtml: interestOut,
        valueClass: 'negative',
        calc: 'Sum of outflow interest components for visible rows.',
        uses: 'Track interest-driven outflow movement.',
        shows: 'Total interest outflows for the current view.'
      },
      {
        label: 'Money Out',
        valueHtml: moneyOut,
        valueClass: 'negative',
        calc: 'Capital Out + Interest Out.',
        uses: 'Single total outflow view.',
        shows: 'Total outflows for the current view.'
      },
      {
        label: 'Net',
        valueHtml: net,
        valueClass: numValueClass(totals.net),
        calc: 'Money In − Money Out for the current view.',
        uses: 'Quick surplus/deficit signal.',
        shows: 'Net movement across visible rows.'
      }
    ]
    : [
      {
        label: 'Money In',
        valueHtml: moneyIn,
        valueClass: 'positive',
        calc: 'Sum of Money In amounts for the currently visible (filtered) rows.',
        uses: 'Spot income changes while filtering.',
        shows: 'Total inflows for the current view.'
      },
      {
        label: 'Money Out',
        valueHtml: moneyOut,
        valueClass: 'negative',
        calc: 'Sum of Money Out amounts for the currently visible (filtered) rows.',
        uses: 'Spot spending changes while filtering.',
        shows: 'Total outflows for the current view.'
      },
      {
        label: 'Net',
        valueHtml: net,
        valueClass: numValueClass(totals.net),
        calc: 'Money In − Money Out for the current view.',
        uses: 'Quick surplus/deficit signal.',
        shows: 'Net movement across visible rows.'
      }
    ];

  renderTotalsCard(targetEl, { title: 'TRANSACTION TOTALS', items });
}

export function renderBudgetTotals(targetEl, totals, currency = 'ZAR') {
  if (!targetEl || !totals) return;

  const moneyIn = formatCurrency(totals.moneyIn || 0, currency);
  const moneyOut = formatCurrency(totals.moneyOut || 0, currency);
  const net = formatCurrency(totals.net || 0, currency);
  const capitalIn = formatCurrency(totals.capitalIn || 0, currency);
  const capitalOut = formatCurrency(totals.capitalOut || 0, currency);
  const interestIn = formatCurrency(totals.interestIn || 0, currency);
  const interestOut = formatCurrency(totals.interestOut || 0, currency);
  const actualNet = formatCurrency(totals.actualNet || 0, currency);
  const plannedOutstanding = formatCurrency(totals.plannedOutstanding || 0, currency);
  const plannedNetBalance = formatCurrency(totals.plannedNetBalance || 0, currency);
  const unplanned = formatCurrency(totals.unplanned || 0, currency);
  const hasSplitTotals =
    Math.abs(Number(totals.capitalIn || 0)) > 0 ||
    Math.abs(Number(totals.capitalOut || 0)) > 0 ||
    Math.abs(Number(totals.interestIn || 0)) > 0 ||
    Math.abs(Number(totals.interestOut || 0)) > 0;

  const items = [
    {
      label: 'Realized Net',
      valueHtml: actualNet,
      valueClass: numValueClass(totals.actualNet),
      calc: 'Actual Money In − Actual Money Out for the visible rows.',
      uses: 'Track what actually happened vs plan.',
      shows: 'Net actual result for the current view.'
    },
    {
      label: 'Planned Income',
      valueHtml: moneyIn,
      valueClass: 'positive',
      calc: 'Sum of planned Money In for the visible rows.',
      uses: 'Plan funding and expected inflows.',
      shows: 'Planned inflows for the current view.'
    },
    ...(hasSplitTotals ? [
      {
        label: 'Planned Capital In',
        valueHtml: capitalIn,
        valueClass: 'positive',
        calc: 'Sum of planned capital inflow components.',
        uses: 'Separate base inflows from interest effects.',
        shows: 'Planned capital inflows.'
      },
      {
        label: 'Planned Interest In',
        valueHtml: interestIn,
        valueClass: 'positive',
        calc: 'Sum of planned interest inflow components.',
        uses: 'Track projected interest inflows.',
        shows: 'Planned interest inflows.'
      }
    ] : []),
    {
      label: 'Planned Expenses',
      valueHtml: moneyOut,
      valueClass: 'negative',
      calc: 'Sum of planned Money Out for the visible rows.',
      uses: 'Plan spending and obligations.',
      shows: 'Planned outflows for the current view.'
    },
    ...(hasSplitTotals ? [
      {
        label: 'Planned Capital Out',
        valueHtml: capitalOut,
        valueClass: 'negative',
        calc: 'Sum of planned capital outflow components.',
        uses: 'Separate base outflows from interest effects.',
        shows: 'Planned capital outflows.'
      },
      {
        label: 'Planned Interest Out',
        valueHtml: interestOut,
        valueClass: 'negative',
        calc: 'Sum of planned interest outflow components.',
        uses: 'Track projected interest outflows.',
        shows: 'Planned interest outflows.'
      }
    ] : []),
    {
      label: 'Planned Net Income',
      valueHtml: net,
      valueClass: numValueClass(totals.net),
      calc: 'Planned Income − Planned Expenses for the visible rows.',
      uses: 'See whether the plan is net positive/negative.',
      shows: 'Planned net result for the current view.'
    },
    {
      label: 'Open Commitments',
      valueHtml: plannedOutstanding,
      valueClass: numValueClass(totals.plannedOutstanding),
      calc: 'Planned amounts with no actual recorded yet (net of in/out).',
      uses: 'Understand remaining items still expected to happen.',
      shows: 'Net outstanding planned commitments.'
    },
    {
      label: 'Forecast Position',
      valueHtml: plannedNetBalance,
      valueClass: numValueClass(totals.plannedNetBalance),
      calc: 'Realized Net − Open Commitments.',
      uses: 'Quick “where do we land if the remaining plan executes?” check.',
      shows: 'Projected budget position for the current view.'
    },
    {
      label: 'Unbudgeted Actuals',
      valueHtml: unplanned,
      valueClass: numValueClass(totals.unplanned),
      calc: 'Actual amounts where planned amount is 0 (net of in/out).',
      uses: 'Identify surprises and missing budget entries.',
      shows: 'Net unbudgeted activity.'
    }
  ];

  renderTotalsCard(targetEl, { title: 'BUDGET TOTALS', items });
}
