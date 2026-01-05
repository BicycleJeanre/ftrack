// data-manager.js
// Centralized data management for scenario-centric architecture
// All operations read/write from assets/app-data.json

const fs = window.require('fs').promises;
const dataPath = process.cwd() + '/assets/app-data.json';

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
    console.log('[DataManager] Data saved successfully');
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
    startDate: scenarioData.startDate || new Date().toISOString().slice(0, 10),
    endDate: scenarioData.endDate || null,
    accounts: [],
    plannedTransactions: [],
    actualTransactions: [],
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
export async function createAccount(scenarioId, accountData) {
  const appData = await readAppData();
  const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);
  
  if (scenarioIndex === -1) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  const scenario = appData.scenarios[scenarioIndex];
  if (!scenario.accounts) {
    scenario.accounts = [];
  }
  
  // Generate new ID
  const maxId = scenario.accounts.length > 0 
    ? Math.max(...scenario.accounts.map(a => a.id)) 
    : 0;
  
  const newAccount = {
    id: maxId + 1,
    name: accountData.name || 'New Account',
    type: accountData.type || { id: 1, name: 'Asset' },
    currency: accountData.currency || { id: 1, name: 'ZAR' },
    balance: accountData.balance || 0,
    openDate: accountData.openDate || new Date().toISOString().slice(0, 10),
    interestRate: accountData.interestRate || null,
    periodicChange: accountData.periodicChange || null,
    ...accountData
  };
  
  scenario.accounts.push(newAccount);
  await writeAppData(appData);
  
  return newAccount;
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
 * @param {number} scenarioId - The scenario ID
 * @param {number} accountId - The account ID
 * @returns {Promise<void>}
 */
export async function deleteAccount(scenarioId, accountId) {
  const appData = await readAppData();
  const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);
  
  if (scenarioIndex === -1) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  const scenario = appData.scenarios[scenarioIndex];
  scenario.accounts = scenario.accounts.filter(a => a.id !== accountId);
  
  await writeAppData(appData);
}

/**
 * Save all accounts for a scenario (bulk update)
 * @param {number} scenarioId - The scenario ID
 * @param {Array} accounts - Array of accounts
 * @returns {Promise<void>}
 */
export async function saveAccounts(scenarioId, accounts) {
  const appData = await readAppData();
  const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);
  
  if (scenarioIndex === -1) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  appData.scenarios[scenarioIndex].accounts = accounts;
  await writeAppData(appData);
}

// ============================================================================
// PLANNED TRANSACTION OPERATIONS (Scenario-scoped)
// ============================================================================

/**
 * Get all planned transactions for a scenario
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<Array>} - Array of planned transactions
 */
export async function getPlannedTransactions(scenarioId) {
  const scenario = await getScenario(scenarioId);
  return scenario ? scenario.plannedTransactions || [] : [];
}

/**
 * Create a new planned transaction in a scenario
 * @param {number} scenarioId - The scenario ID
 * @param {Object} transactionData - The transaction data
 * @returns {Promise<Object>} - The created transaction
 */
export async function createPlannedTransaction(scenarioId, transactionData) {
  const appData = await readAppData();
  const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);
  
  if (scenarioIndex === -1) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  const scenario = appData.scenarios[scenarioIndex];
  if (!scenario.plannedTransactions) {
    scenario.plannedTransactions = [];
  }
  
  // Generate new ID
  const maxId = scenario.plannedTransactions.length > 0 
    ? Math.max(...scenario.plannedTransactions.map(t => t.id)) 
    : 0;
  
  const newTransaction = {
    id: maxId + 1,
    debitAccount: transactionData.debitAccount || null,
    creditAccount: transactionData.creditAccount || null,
    amount: transactionData.amount || 0,
    description: transactionData.description || '',
    recurrence: transactionData.recurrence || {
      recurrenceType: 'Monthly - Day of Month',
      startDate: new Date().toISOString().slice(0, 10),
      dayOfMonth: 1
    },
    amountChange: transactionData.amountChange || null,
    tags: transactionData.tags || [],
    ...transactionData
  };
  
  scenario.plannedTransactions.push(newTransaction);
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
  
  appData.scenarios[scenarioIndex].plannedTransactions = transactions;
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
    date: transactionData.date || new Date().toISOString().slice(0, 10),
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
  
  appData.scenarios[scenarioIndex].actualTransactions = transactions;
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
