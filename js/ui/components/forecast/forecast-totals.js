// forecast-totals.js
// Forecast toolbar totals helpers extracted from forecast.js (no behavior change).

import { calculateCategoryTotals, calculateBudgetTotals } from '../../transforms/data-aggregators.js';
import { renderMoneyTotals, renderBudgetTotals } from '../widgets/toolbar-totals.js';

export function updateTransactionTotals(table, filteredRows = null) {
  if (!table) {
    return;
  }

  const visibleData = filteredRows ? filteredRows.map(r => r.getData()) : table.getData('active');

  const txTotals = calculateCategoryTotals(visibleData, {
    amountField: 'amount',
    typeField: 'transactionType',
    typeNameField: 'transactionTypeName',
    typeIdField: 'transactionTypeId'
  });

  const toolbarTotals = document.querySelector('#transactionsContent .toolbar-totals');
  renderMoneyTotals(toolbarTotals, txTotals);
}

export function updateBudgetTotals(table, filteredRows = null) {
  if (!table) {
    return;
  }

  const visibleData = filteredRows ? filteredRows.map(r => r.getData()) : table.getData('active');

  const budgetTotals = calculateBudgetTotals(visibleData, {
    plannedField: 'plannedAmount',
    actualField: 'actualAmount',
    typeField: 'transactionType',
    typeNameField: 'transactionTypeName',
    typeIdField: 'transactionTypeId'
  });

  const budgetTotalsContainer = document.querySelector('#budgetContent');
  renderBudgetTotals(budgetTotalsContainer, budgetTotals);
}
