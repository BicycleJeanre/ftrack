// Debug transaction expansion
const { getLookupData, loadCoreModules } = require('./QC/tests/helpers');

async function debugTransactionExpansion() {
  console.log('Testing transaction expansion...\n');
  
  const lookupData = getLookupData();
  const { calculationUtils, dateUtils, transactionExpander } = await loadCoreModules();
  
  const startDate = dateUtils.parseDateOnly('2026-01-01');
  const endDate = dateUtils.parseDateOnly('2026-12-31');
  
  const transactions = [
    {
      id: 1,
      primaryAccountId: 1,
      secondaryAccountId: 1,
      transactionTypeId: 1,
      amount: 100,
      effectiveDate: '2026-01-01',
      description: 'Test transaction',
      recurrence: {
        recurrenceType: 1,
        startDate: '2026-01-01',
        endDate: '2026-12-31'
      },
      periodicChange: null,
      status: { name: 'planned' },
      tags: []
    }
  ];
  
  console.log('Input transaction:', JSON.stringify(transactions[0], null, 2));
  console.log(`Period: ${dateUtils.formatDateOnly(startDate)} to ${dateUtils.formatDateOnly(endDate)}\n`);
  
  // Check what recurrence dates are generated
  const recurrenceDates = calculationUtils.generateRecurrenceDates(
    transactions[0].recurrence,
    startDate,
    endDate
  );
  
  console.log('Recurrence dates generated:', recurrenceDates.length);
  recurrenceDates.forEach((date, i) => {
    console.log(`  [${i}] ${dateUtils.formatDateOnly(date)}`);
  });
  
  console.log('\n');
  
  // Now expand transactions
  const expandedTransactions = transactionExpander.expandTransactions(
    transactions,
    startDate,
    endDate,
    []
  );
  
  console.log('Expanded transactions:', expandedTransactions.length);
  expandedTransactions.forEach((tx, i) => {
    const occDate = tx._occurrenceDate ? dateUtils.formatDateOnly(tx._occurrenceDate) : 'undefined';
    console.log(`  [${i}] ${occDate}: amount=${tx.amount}, dateKey=${tx.dateKey}`);
  });
}

debugTransactionExpansion();

