// migrate-to-scenarios.js
// ONE-TIME MIGRATION SCRIPT - DO NOT RUN AGAIN AFTER INITIAL MIGRATION
// Migration script to convert app-data.json to scenario-centric structure
// This script was used once during the Alpha Architecture Redesign
// Kept for reference and potential rollback scenarios

const fs = require('fs').promises;
const path = require('path');

async function migrate() {
  const dataPath = path.join(process.cwd(), 'assets', 'app-data.json');
  
  try {
    // Read current data
    const dataFile = await fs.readFile(dataPath, 'utf8');
    const oldData = JSON.parse(dataFile);
    
    console.log('[Migration] Starting migration to scenario-centric structure...');
    
    // Create new data structure
    const newData = {
      profile: oldData.profile || "User",
      scenarios: []
    };
    
    // Create default Budget scenario with existing data
    const defaultScenario = {
      id: 1,
      name: "Budget 2026",
      type: {
        id: 1,
        name: "Budget"
      },
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      accounts: [],
      plannedTransactions: [],
      actualTransactions: [],
      projections: []
    };
    
    // Migrate accounts
    if (oldData.accounts && Array.isArray(oldData.accounts)) {
      defaultScenario.accounts = oldData.accounts.map(acc => {
        // Clean up nested structure issues in old data
        const cleanType = acc.type?.name ? acc.type : { id: 1, name: "Asset" };
        const cleanCurrency = acc.currency?.name ? acc.currency : { id: 1, name: "ZAR" };
        
        return {
          id: acc.id,
          name: acc.name,
          type: cleanType,
          currency: cleanCurrency,
          balance: acc.balance || 0,
          openDate: acc.openDate || "2026-01-01",
          interestRate: acc.interest || null,
          periodicChange: null
        };
      });
      console.log(`[Migration] Migrated ${defaultScenario.accounts.length} accounts`);
    }
    
    // Migrate transactions to plannedTransactions
    if (oldData.transactions && Array.isArray(oldData.transactions)) {
      defaultScenario.plannedTransactions = oldData.transactions.map(txn => {
        return {
          id: txn.id,
          debitAccount: txn.debit_account || null,
          creditAccount: txn.credit_account || null,
          amount: txn.amount || 0,
          description: txn.description || "",
          recurrence: txn.isRecurring ? {
            recurrenceType: "Monthly - Day of Month",
            startDate: "2026-01-01",
            dayOfMonth: 1
          } : {
            recurrenceType: "One Time",
            startDate: "2026-01-01"
          },
          amountChange: null,
          tags: txn.tags || []
        };
      });
      console.log(`[Migration] Migrated ${defaultScenario.plannedTransactions.length} transactions`);
    }
    
    // Add the default scenario
    newData.scenarios.push(defaultScenario);
    
    // Optionally create a General scenario for forecasting
    const generalScenario = {
      id: 2,
      name: "General Forecast 2026",
      type: {
        id: 2,
        name: "General"
      },
      startDate: "2026-01-01",
      endDate: "2030-12-31",
      accounts: [],
      plannedTransactions: [],
      actualTransactions: [],
      projections: []
    };
    
    newData.scenarios.push(generalScenario);
    console.log('[Migration] Created additional General scenario');
    
    // Write new data
    await fs.writeFile(dataPath, JSON.stringify(newData, null, 2), 'utf8');
    console.log('[Migration] Migration complete! Data saved to', dataPath);
    console.log('[Migration] Created scenarios:', newData.scenarios.map(s => s.name).join(', '));
    
  } catch (err) {
    console.error('[Migration] Failed:', err);
    throw err;
  }
}

// Run migration if called directly
if (require.main === module) {
  migrate().then(() => {
    console.log('[Migration] Done!');
    process.exit(0);
  }).catch(err => {
    console.error('[Migration] Error:', err);
    process.exit(1);
  });
}

module.exports = { migrate };
