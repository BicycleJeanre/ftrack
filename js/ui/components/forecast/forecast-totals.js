// forecast-totals.js
// Forecast toolbar totals helpers extracted from forecast.js (no behavior change).

import { calculateCategoryTotals, calculateBudgetTotals, calculateCapitalInterestTotals } from '../../transforms/data-aggregators.js';
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
  const txCapitalInterestTotals = calculateCapitalInterestTotals(visibleData, {
    amountField: 'amount',
    typeField: 'transactionType',
    typeNameField: 'transactionTypeName',
    typeIdField: 'transactionTypeId',
    capitalField: 'capitalAmount',
    interestField: 'interestAmount',
    roleField: 'transactionGroupRole'
  });

  const transactionsContainer = document.querySelector('#transactionsContent');
  renderMoneyTotals(transactionsContainer, { ...txTotals, ...txCapitalInterestTotals });
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
  const budgetCapitalInterestTotals = calculateCapitalInterestTotals(visibleData, {
    amountField: 'plannedAmount',
    typeField: 'transactionType',
    typeNameField: 'transactionTypeName',
    typeIdField: 'transactionTypeId',
    capitalField: 'capitalAmount',
    interestField: 'interestAmount',
    roleField: 'transactionGroupRole'
  });

  const budgetTotalsContainer = document.querySelector('#budgetContent');
  renderBudgetTotals(budgetTotalsContainer, { ...budgetTotals, ...budgetCapitalInterestTotals });
}
