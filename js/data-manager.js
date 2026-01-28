// data-manager.js
// Centralized data management for scenario-centric architecture
// All operations read/write from assets/app-data.json

import { generateRecurrenceDates } from './calculation-utils.js';
import { formatDateOnly } from './date-utils.js';
import { getAppDataPath } from './app-paths.js';

const fs = window.require('fs').promises;
const dataPath = getAppDataPath();

// ============================================================================
// DATA FILE OPERATIONS
// ============================================================================

/**
 * Read the entire app-data.json file
 * @returns {Promise<Object>} - The app data object
 */
async function readAppData() {
  try {
    const dataFile = await fs.readFile(dataPath, 'utf8');
    return JSON.parse(dataFile);
  } catch (err) {
    console.error('[DataManager] Failed to read app-data.json:', err);
    throw err;
  }
}

/**
 * Write to the app-data.json file
 * @param {Object} data - The data to write
 * @returns {Promise<void>}
 */
async function writeAppData(data) {
  try {
    await fs.writeFile(dataPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[DataManager] Failed to write app-data.json:', err);
    throw err;
  }
}

// ============================================================================
// SCENARIO OPERATIONS
// ============================================================================

/**
 * Get all scenarios
 * @returns {Promise<Array>} - Array of scenarios
 */
export async function getScenarios() {
  const appData = await readAppData();
  return appData.scenarios || [];
}

/**
 * Get a specific scenario by ID
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<Object|null>} - The scenario object or null
 */
export async function getScenario(scenarioId) {
  const scenarios = await getScenarios();
  return scenarios.find(s => s.id === scenarioId) || null;
}

/**
 * Create a new scenario
 * @param {Object} scenarioData - The scenario data
 * @returns {Promise<Object>} - The created scenario with ID
 */
export async function createScenario(scenarioData) {
  const appData = await readAppData();
  
  if (!appData.scenarios) {
    appData.scenarios = [];
  }
  
  // Generate new ID
  const maxId = appData.scenarios.length > 0 
    ? Math.max(...appData.scenarios.map(s => s.id)) 
    : 0;
  
  const newScenario = {
    id: maxId + 1,
    name: scenarioData.name || 'New Scenario',
    type: scenarioData.type || { id: 1, name: 'Budget' },
    startDate: scenarioData.startDate || formatDateOnly(new Date()),
    endDate: scenarioData.endDate || null,
    accounts: [],
    transactions: [],
    projections: [],
    ...scenarioData
  };
  
  appData.scenarios.push(newScenario);
  await writeAppData(appData);
  
  return newScenario;
}

/**
 * Update an existing scenario
 * @param {number} scenarioId - The scenario ID
 * @param {Object} updates - The fields to update
 * @returns {Promise<Object>} - The updated scenario
 */
export async function updateScenario(scenarioId, updates) {
  const appData = await readAppData();
  const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);
  
  if (scenarioIndex === -1) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  appData.scenarios[scenarioIndex] = {
    ...appData.scenarios[scenarioIndex],
    ...updates
  };
  
  await writeAppData(appData);
  return appData.scenarios[scenarioIndex];
}

/**
 * Delete a scenario
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<void>}
 */
export async function deleteScenario(scenarioId) {
  const appData = await readAppData();
  appData.scenarios = appData.scenarios.filter(s => s.id !== scenarioId);
  await writeAppData(appData);
}

/**
 * Duplicate a scenario
 * @param {number} scenarioId - The scenario ID to duplicate
 * @param {string} newName - Name for the duplicated scenario
 * @returns {Promise<Object>} - The new scenario
 */
export async function duplicateScenario(scenarioId, newName) {
  const appData = await readAppData();
  const sourceScenario = appData.scenarios.find(s => s.id === scenarioId);
  
  if (!sourceScenario) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  // Deep copy the scenario
  const duplicatedScenario = JSON.parse(JSON.stringify(sourceScenario));
  
  // Generate new ID
  const maxId = Math.max(...appData.scenarios.map(s => s.id));
  duplicatedScenario.id = maxId + 1;
  duplicatedScenario.name = newName || `${sourceScenario.name} (Copy)`;
  
  // Reset projection data in the copy
  duplicatedScenario.projections = [];
  
  appData.scenarios.push(duplicatedScenario);
  await writeAppData(appData);
  
  return duplicatedScenario;
}

// ============================================================================
// ACCOUNT OPERATIONS (Scenario-scoped)
// ============================================================================

/**
 * Get all accounts for a scenario
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<Array>} - Array of accounts
 */
export async function getAccounts(scenarioId) {
  const scenario = await getScenario(scenarioId);
  return scenario ? scenario.accounts || [] : [];
}

/**
 * Create a new account in a scenario
 * @param {number} scenarioId - The scenario ID
 * @param {Object} accountData - The account data
 * @returns {Promise<Object>} - The created account
 */
import { transaction } from './core/data-store.js';

import * as AccountManager from './managers/account-manager.js';

export async function createAccount(scenarioId, accountData) {
  // Delegate to the single canonical AccountManager implementation
  const data = await AccountManager.create(scenarioId, accountData);
  const scenario = data.scenarios.find(s => s.id === scenarioId);
  // Return the last account (the one just created)
  return scenario.accounts[scenario.accounts.length - 1];
}

/**
 * Update an account in a scenario
 * @param {number} scenarioId - The scenario ID
 * @param {number} accountId - The account ID
 * @param {Object} updates - The fields to update
 * @returns {Promise<Object>} - The updated account
 */
export async function updateAccount(scenarioId, accountId, updates) {
  const appData = await readAppData();
  const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);
  
  if (scenarioIndex === -1) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  const scenario = appData.scenarios[scenarioIndex];
  const accountIndex = scenario.accounts.findIndex(a => a.id === accountId);
  
  if (accountIndex === -1) {
    throw new Error(`Account ${accountId} not found in scenario ${scenarioId}`);
  }
  
  scenario.accounts[accountIndex] = {
    ...scenario.accounts[accountIndex],
    ...updates
  };
  
  await writeAppData(appData);
  return scenario.accounts[accountIndex];
}

/**
 * Delete an account from a scenario
 * Cascades delete to all transactions that reference this account
 * @param {number} scenarioId - The scenario ID
 * @param {number} accountId - The account ID
 * @returns {Promise<void>}
 */
export async function deleteAccount(scenarioId, accountId) {
  // Run as a transaction to avoid race conditions
  await transaction(async (appData) => {
    const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);
    if (scenarioIndex === -1) throw new Error(`Scenario ${scenarioId} not found`);

    const scenario = appData.scenarios[scenarioIndex];
    const accountIdNum = Number(accountId);

    // Cascade delete: Remove all transactions that reference this account (primary or secondary)
    if (scenario.transactions) {
      const beforeCount = scenario.transactions.length;
      scenario.transactions = scenario.transactions.filter(tx => {
        const hasPrimary = tx.primaryAccountId && Number(tx.primaryAccountId) === accountIdNum;
        const hasSecondary = tx.secondaryAccountId && Number(tx.secondaryAccountId) === accountIdNum;
        
        // Keep transaction only if it doesn't reference the deleted account
        return !hasPrimary && !hasSecondary;
      });
      const afterCount = scenario.transactions.length;
      const deletedCount = beforeCount - afterCount;
      if (deletedCount > 0) {
        console.log(`[DataManager] Cascade deleted ${deletedCount} transaction(s) referencing account ${accountId}`);
      }
    }

    // Delete the account
    scenario.accounts = scenario.accounts.filter(a => a.id !== accountId);
    return appData;
  });
}

/**
 * Save all accounts for a scenario (bulk update)
 * @param {number} scenarioId - The scenario ID
 * @param {Array} accounts - Array of accounts
 * @returns {Promise<void>}
 */
export async function saveAccounts(scenarioId, accounts) {
  // Serialize this through a transaction to ensure consistent ID generation
  await transaction(async (appData) => {
    const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);
    if (scenarioIndex === -1) throw new Error(`Scenario ${scenarioId} not found`);

    // Assign IDs to any accounts that don't have them
    const validIds = accounts
      .map(a => a.id)
      .filter(id => id !== null && id !== undefined && typeof id === 'number');
    let nextId = validIds.length > 0 ? Math.max(...validIds) + 1 : 1;

    const accountsWithIds = accounts.map(account => {
      if (account.id === null || account.id === undefined || isNaN(account.id)) {
        return { ...account, id: nextId++ };
      }
      return account;
    });

    appData.scenarios[scenarioIndex].accounts = accountsWithIds;
    return appData;
  });
}

// ============================================================================
// PLANNED TRANSACTION OPERATIONS (Scenario-scoped)
// ============================================================================

/**
 * Get all transactions for a scenario
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<Array>} - Array of transactions
 */
export async function getTransactions(scenarioId) {
  const scenario = await getScenario(scenarioId);
  if (!scenario) return [];
  
  const transactions = scenario.transactions || [];
  const accounts = scenario.accounts || [];

  console.log('[DataManager.getTransactions] scenario', { scenarioId, count: transactions.length });
  
  // Resolve account IDs to full account objects for UI display
  return transactions.map(tx => {
    const primaryAccount = accounts.find(a => a.id === tx.primaryAccountId);
    const secondaryAccount = accounts.find(a => a.id === tx.secondaryAccountId);
    const transactionType = tx.transactionTypeId === 1
      ? { id: 1, name: 'Money In' }
      : { id: 2, name: 'Money Out' };
    
    // Map to legacy debitAccount/creditAccount based on transaction type
    // transactionTypeId: 1 = Money In (secondary → primary), 2 = Money Out (primary → secondary)
    const debitAccount = tx.transactionTypeId === 1 ? secondaryAccount : primaryAccount;
    const creditAccount = tx.transactionTypeId === 1 ? primaryAccount : secondaryAccount;
    
    return {
      ...tx,
      debitAccount: debitAccount || null,
      creditAccount: creditAccount || null,
      transactionType
    };
  });
}

/**
 * Create a new transaction in a scenario
 * @param {number} scenarioId - The scenario ID
 * @param {Object} transactionData - The transaction data
 * @returns {Promise<Object>} - The created transaction
 */
export async function createTransaction(scenarioId, transactionData) {
  const appData = await readAppData();
  const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);

  if (scenarioIndex === -1) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }

  const scenario = appData.scenarios[scenarioIndex];
  if (!scenario.transactions) {
    scenario.transactions = [];
  }

  // Generate new ID
  const maxId = scenario.transactions.length > 0
    ? Math.max(...scenario.transactions.map(t => t.id))
    : 0;

  // Normalize amount sign based on transaction type
  const transactionTypeId = transactionData.transactionTypeId || 2;
  const rawAmount = transactionData.amount || 0;
  const absAmount = Math.abs(rawAmount);
  const normalizedAmount = transactionTypeId === 1 
    ? absAmount  // Money In: always positive
    : -absAmount; // Money Out: always negative

  const newTransaction = {
    id: maxId + 1,
    primaryAccountId: transactionData.primaryAccountId || null,
    secondaryAccountId: transactionData.secondaryAccountId || null,
    transactionTypeId: transactionTypeId,
    amount: normalizedAmount,
    description: transactionData.description || '',
    recurrence: transactionData.recurrence || null,
    periodicChange: transactionData.periodicChange || null,
    status: {
      name: transactionData.status || 'planned',
      actualAmount: transactionData.actualAmount || null,
      actualDate: transactionData.actualDate || null
    },
    tags: transactionData.tags || []
  };

  scenario.transactions.push(newTransaction);
  await writeAppData(appData);

  return newTransaction;
}

/**
 * Update a planned transaction in a scenario
 * @param {number} scenarioId - The scenario ID
 * @param {number} transactionId - The transaction ID
 * @param {Object} updates - The fields to update
 * @returns {Promise<Object>} - The updated transaction
 */
export async function updatePlannedTransaction(scenarioId, transactionId, updates) {
  const appData = await readAppData();
  const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);
  
  if (scenarioIndex === -1) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  const scenario = appData.scenarios[scenarioIndex];
  const transactionIndex = scenario.plannedTransactions.findIndex(t => t.id === transactionId);
  
  if (transactionIndex === -1) {
    throw new Error(`Planned transaction ${transactionId} not found in scenario ${scenarioId}`);
  }
  
  scenario.plannedTransactions[transactionIndex] = {
    ...scenario.plannedTransactions[transactionIndex],
    ...updates
  };
  
  await writeAppData(appData);
  return scenario.plannedTransactions[transactionIndex];
}

/**
 * Delete a planned transaction from a scenario
 * @param {number} scenarioId - The scenario ID
 * @param {number} transactionId - The transaction ID
 * @returns {Promise<void>}
 */
export async function deletePlannedTransaction(scenarioId, transactionId) {
  const appData = await readAppData();
  const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);
  
  if (scenarioIndex === -1) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  const scenario = appData.scenarios[scenarioIndex];
  scenario.plannedTransactions = scenario.plannedTransactions.filter(t => t.id !== transactionId);
  
  await writeAppData(appData);
}

/**
 * Save all planned transactions for a scenario (bulk update)
 * Ensures all transactions have unique IDs
 * @param {number} scenarioId - The scenario ID
 * @param {Array} transactions - Array of transactions
 * @returns {Promise<void>}
 */
export async function savePlannedTransactions(scenarioId, transactions) {
  const appData = await readAppData();
  const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);
  
  if (scenarioIndex === -1) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  // Ensure all transactions have IDs (assign if missing)
  const validIds = transactions.map(t => t.id).filter(id => id != null && !isNaN(id));
  const maxId = validIds.length > 0 ? Math.max(...validIds) : 0;
  let nextId = maxId + 1;
  
  const transactionsWithIds = transactions.map(tx => {
    if (tx.id == null || isNaN(tx.id)) {
      return { ...tx, id: nextId++ };
    }
    return tx;
  });
  
  appData.scenarios[scenarioIndex].plannedTransactions = transactionsWithIds;
  await writeAppData(appData);
}

// ============================================================================
// ACTUAL TRANSACTION OPERATIONS (Scenario-scoped)
// ============================================================================

/**
 * Get all actual transactions for a scenario
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<Array>} - Array of actual transactions
 */
export async function getActualTransactions(scenarioId) {
  const scenario = await getScenario(scenarioId);
  return scenario ? scenario.actualTransactions || [] : [];
}

/**
 * Create a new actual transaction in a scenario
 * @param {number} scenarioId - The scenario ID
 * @param {Object} transactionData - The transaction data
 * @returns {Promise<Object>} - The created transaction
 */
export async function createActualTransaction(scenarioId, transactionData) {
  const appData = await readAppData();
  const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);
  
  if (scenarioIndex === -1) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  const scenario = appData.scenarios[scenarioIndex];
  if (!scenario.actualTransactions) {
    scenario.actualTransactions = [];
  }
  
  // Generate new ID
  const maxId = scenario.actualTransactions.length > 0 
    ? Math.max(...scenario.actualTransactions.map(t => t.id)) 
    : 0;
  
  const newTransaction = {
    id: maxId + 1,
    date: transactionData.date || formatDateOnly(new Date()),
    debitAccount: transactionData.debitAccount || null,
    creditAccount: transactionData.creditAccount || null,
    amount: transactionData.amount || 0,
    description: transactionData.description || '',
    status: transactionData.status || { id: 2, name: 'Completed' },
    tags: transactionData.tags || [],
    ...transactionData
  };
  
  scenario.actualTransactions.push(newTransaction);
  await writeAppData(appData);
  
  return newTransaction;
}

/**
 * Update an actual transaction in a scenario
 * @param {number} scenarioId - The scenario ID
 * @param {number} transactionId - The transaction ID
 * @param {Object} updates - The fields to update
 * @returns {Promise<Object>} - The updated transaction
 */
export async function updateActualTransaction(scenarioId, transactionId, updates) {
  const appData = await readAppData();
  const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);
  
  if (scenarioIndex === -1) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  const scenario = appData.scenarios[scenarioIndex];
  const transactionIndex = scenario.actualTransactions.findIndex(t => t.id === transactionId);
  
  if (transactionIndex === -1) {
    throw new Error(`Actual transaction ${transactionId} not found in scenario ${scenarioId}`);
  }
  
  scenario.actualTransactions[transactionIndex] = {
    ...scenario.actualTransactions[transactionIndex],
    ...updates
  };
  
  await writeAppData(appData);
  return scenario.actualTransactions[transactionIndex];
}

/**
 * Delete an actual transaction from a scenario
 * @param {number} scenarioId - The scenario ID
 * @param {number} transactionId - The transaction ID
 * @returns {Promise<void>}
 */
export async function deleteActualTransaction(scenarioId, transactionId) {
  const appData = await readAppData();
  const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);
  
  if (scenarioIndex === -1) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  const scenario = appData.scenarios[scenarioIndex];
  scenario.actualTransactions = scenario.actualTransactions.filter(t => t.id !== transactionId);
  
  await writeAppData(appData);
}

/**
 * Save all actual transactions for a scenario (bulk update)
 * Ensures all transactions have unique IDs
 * @param {number} scenarioId - The scenario ID
 * @param {Array} transactions - Array of transactions
 * @returns {Promise<void>}
 */
export async function saveActualTransactions(scenarioId, transactions) {
  const appData = await readAppData();
  const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);
  
  if (scenarioIndex === -1) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  // Ensure all transactions have IDs (assign if missing)
  const validIds = transactions.map(t => t.id).filter(id => id != null && !isNaN(id));
  const maxId = validIds.length > 0 ? Math.max(...validIds) : 0;
  let nextId = maxId + 1;
  
  const transactionsWithIds = transactions.map(tx => {
    if (tx.id == null || isNaN(tx.id)) {
      return { ...tx, id: nextId++ };
    }
    return tx;
  });
  
  appData.scenarios[scenarioIndex].actualTransactions = transactionsWithIds;
  await writeAppData(appData);
}

// ============================================================================
// PROJECTION OPERATIONS (Scenario-scoped)
// ============================================================================

/**
 * Get all projections for a scenario
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<Array>} - Array of projections
 */
export async function getProjections(scenarioId) {
  const scenario = await getScenario(scenarioId);
  return scenario ? scenario.projections || [] : [];
}

/**
 * Save projections for a scenario (replaces all existing projections)
 * @param {number} scenarioId - The scenario ID
 * @param {Array} projections - Array of projection records
 * @returns {Promise<void>}
 */
export async function saveProjections(scenarioId, projections) {
  const appData = await readAppData();
  const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);
  
  if (scenarioIndex === -1) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  appData.scenarios[scenarioIndex].projections = projections;
  await writeAppData(appData);
}

/**
 * Clear all projections for a scenario
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<void>}
 */
export async function clearProjections(scenarioId) {
  await saveProjections(scenarioId, []);
}

// ============================================================================
// BUDGET OPERATIONS
// ============================================================================

/**
 * Save budget for a scenario (replaces all existing budget occurrences)
 * @param {number} scenarioId - The scenario ID
 * @param {Array} budgets - Array of budget occurrence records
 * @returns {Promise<void>}
 */
export async function saveBudget(scenarioId, budgets) {
  const appData = await readAppData();
  const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);
  
  if (scenarioIndex === -1) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  appData.scenarios[scenarioIndex].budgets = budgets;
  await writeAppData(appData);
}

/**
 * Get budget for a scenario
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<Array>} - Array of budget occurrences
 */
export async function getBudget(scenarioId) {
  const scenario = await getScenario(scenarioId);
  return scenario?.budgets || [];
}

/**
 * Clear all budget occurrences for a scenario
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<void>}
 */
export async function clearBudget(scenarioId) {
  await saveBudget(scenarioId, []);
}

// ============================================================================
// PERIOD OPERATIONS
// ============================================================================

/**
 * Calculate all periods for a scenario based on start/end dates and period type
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<Array>} - Array of period objects
 */
import { parseDateOnly } from './date-utils.js';

export async function getScenarioPeriods(scenarioId) {
  const scenario = await getScenario(scenarioId);
  
  if (!scenario) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  const periods = [];
  const start = typeof scenario.startDate === 'string' ? parseDateOnly(scenario.startDate) : new Date(scenario.startDate);
  const end = typeof scenario.endDate === 'string' ? parseDateOnly(scenario.endDate) : new Date(scenario.endDate);
  const periodType = scenario.projectionPeriod?.name || 'Month';
  
  let current = new Date(start);
  
  while (current <= end) {
    if (periodType === 'Month') {
      const periodId = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
      const monthName = current.toLocaleString('default', { month: 'long' });
      const year = current.getFullYear();
      
      periods.push({
        id: periodId,
        label: `${monthName} ${year}`,
        startDate: new Date(current.getFullYear(), current.getMonth(), 1),
        endDate: new Date(current.getFullYear(), current.getMonth() + 1, 0)
      });
      
      current.setMonth(current.getMonth() + 1);
    } else if (periodType === 'Week') {
      // TODO: Implement weekly period calculation
      current.setDate(current.getDate() + 7);
    } else if (periodType === 'Quarter') {
      // TODO: Implement quarterly period calculation
      current.setMonth(current.getMonth() + 3);
    } else if (periodType === 'Year') {
      // TODO: Implement yearly period calculation
      current.setFullYear(current.getFullYear() + 1);
    } else {
      // Default to month
      current.setMonth(current.getMonth() + 1);
    }
  }
  
  return periods;
}

/**
 * Get planned transactions that occur in a specific period
 * @param {number} scenarioId - The scenario ID
 * @param {string} periodId - The period ID (e.g., '2026-01')
 * @returns {Promise<Array>} - Array of planned transaction instances for the period
 */
export async function getPlannedTransactionsForPeriod(scenarioId, periodId) {
  const scenario = await getScenario(scenarioId);
  
  if (!scenario) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  const periods = await getScenarioPeriods(scenarioId);
  const period = periods.find(p => p.id === periodId);
  
  if (!period) {
    throw new Error(`Period ${periodId} not found in scenario ${scenarioId}`);
  }
  
  const periodTransactions = [];
  const plannedTransactions = scenario.plannedTransactions || [];
  
  plannedTransactions.forEach(pt => {
    const occurrences = calculateOccurrencesInPeriod(pt.recurrence, period);
    
    occurrences.forEach(date => {
      periodTransactions.push({
        ...pt,
        calculatedDate: date,
        instanceId: `${pt.id}-${formatDateOnly(date)}`,
        sourceTransactionId: pt.id
      });
    });
  });
  
  return periodTransactions;
}

/**
 * Calculate when a recurring transaction occurs within a period
 * @param {Object} recurrence - The recurrence rule
 * @param {Object} period - The period object with startDate and endDate
 * @returns {Array<Date>} - Array of dates when transaction occurs
 */
function calculateOccurrencesInPeriod(recurrence, period) {
  if (!recurrence || !recurrence.recurrenceType) {
    return [];
  }
  
  // Use the proven recurrence calculation logic from calculation-utils
  // This handles all 8 recurrence types consistently with the projection engine
  return generateRecurrenceDates(recurrence, period.startDate, period.endDate);
}

/**
 * Get actual transactions for a specific period
 * @param {number} scenarioId - The scenario ID
 * @param {string} periodId - The period ID (e.g., '2026-01')
 * @returns {Promise<Array>} - Array of actual transactions for the period
 */
export async function getActualTransactionsForPeriod(scenarioId, periodId) {
  const actuals = await getActualTransactions(scenarioId);
  return actuals.filter(at => at.period === periodId);
}

/**
 * Create or update an actual transaction
 * @param {number} scenarioId - The scenario ID
 * @param {Object} actualTransaction - The actual transaction data
 * @returns {Promise<Object>} - The saved actual transaction
 */
export async function saveActualTransaction(scenarioId, actualTransaction) {
  const appData = await readAppData();
  const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);
  
  if (scenarioIndex === -1) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  const scenario = appData.scenarios[scenarioIndex];
  if (!scenario.actualTransactions) {
    scenario.actualTransactions = [];
  }
  
  if (actualTransaction.id) {
    // Update existing
    const index = scenario.actualTransactions.findIndex(at => at.id === actualTransaction.id);
    if (index >= 0) {
      scenario.actualTransactions[index] = actualTransaction;
    } else {
      // ID provided but not found - add as new
      scenario.actualTransactions.push(actualTransaction);
    }
  } else {
    // Create new
    const maxId = scenario.actualTransactions.length > 0
      ? Math.max(...scenario.actualTransactions.map(at => at.id || 0))
      : 0;
    actualTransaction.id = maxId + 1;
    scenario.actualTransactions.push(actualTransaction);
  }
  
  await writeAppData(appData);
  return actualTransaction;
}
