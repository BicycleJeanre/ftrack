// Debug projection-engine issue
const { getLookupData, loadCoreModules, roundToCents } = require('./QC/tests/helpers');
const { buildScenario } = require('./QC/tests/helpers');

async function debugProjection() {
  console.log('Testing projection engine...\n');
  
  const lookupData = getLookupData();
  const { projectionEngine, dateUtils } = await loadCoreModules();
  
  // Simple one-time recurrence test
  const startDate = '2026-01-01';
  const endDate = '2026-12-31';
  
  const scenario = buildScenario({
    startDate,
    endDate,
    projectionPeriodName: 'Month',
    accounts: [
      {
        id: 1,
        name: 'Test Account',
        type: 1,
        currency: 1,
        startingBalance: 0,
        openDate: startDate,
        periodicChange: null,
        goalAmount: null,
        goalDate: null
      }
    ],
    transactions: [
      {
        id: 1,
        primaryAccountId: 1,
        secondaryAccountId: 1,
        transactionTypeId: 1, // Income
        amount: 100,
        effectiveDate: startDate,
        description: 'Test transaction',
        recurrence: {
          type: {id: 1, name: 'One Time'},
          startDate,
          endDate
        },
        periodicChange: null,
        status: { name: 'planned', actualAmount: null, actualDate: null },
        tags: []
      }
    ]
  });
  
  console.log('Scenario:', JSON.stringify(scenario, null, 2));
  console.log('\n');
  
  try {
    const projections = await projectionEngine.generateProjectionsForScenario(
      scenario,
      { periodicity: 'monthly' },
      lookupData
    );
    
    console.log('Projections generated:', projections.length);
    console.log('First 3 projections:');
    projections.slice(0, 3).forEach((p, i) => {
      console.log(`  [${i}] ${p.date}: balance=${p.balance}, income=${p.income}`);
    });
    
    const lastProjection = projections[projections.length - 1];
    console.log(`\nLast projection: ${lastProjection.date}: balance=${lastProjection.balance}`);
    console.log(`Expected: 100, Got: ${lastProjection.balance}`);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

debugProjection();
