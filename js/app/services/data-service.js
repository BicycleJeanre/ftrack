// data-service.js
// Centralized data management for scenario-centric architecture
// All operations read/write from localStorage (Web)

import { generatePeriods } from '../../domain/calculations/period-utils.js';
import { formatDateOnly } from '../../shared/date-utils.js';
import * as AccountManager from '../managers/account-manager.js';
import * as TransactionManager from '../managers/transaction-manager.js';
import * as DataStore from './storage-service.js';
import { notifyError } from '../../shared/notifications.js';
import {
  createDefaultUiState,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_PERIOD_TYPE_ID,
  assertSchemaVersion43,
  sanitizeScenarioForWrite,
  allocateNextId
} from '../../shared/app-data-utils.js';
import { DEFAULT_WORKFLOW_ID } from '../../shared/workflow-registry.js';

// ============================================================================
// DATA FILE OPERATIONS
// ============================================================================

/**
 * Read the entire app-data.json file (Electron) or localStorage (Web)
 * @returns {Promise<Object>} - The app data object
 */
async function readAppData() {
  try {
    const data = await DataStore.read();
    assertSchemaVersion43(data);
    return data;
  } catch (err) {
    if (err && err.name === 'SchemaVersionError') {
      throw err;
    }
    throw new Error('No app data found. Please import a data file or create a new scenario.');
  }
}

/**
 * Write to the app-data.json file (Electron) or localStorage (Web)
 * @param {Object} data - The data to write
 * @returns {Promise<void>}
 */
async function writeAppData(data) {
  try {
    await DataStore.write(data);
  } catch (err) {
    if (err.name === 'QuotaExceededError') {
      notifyError('Storage quota exceeded. Please export your data and clear some scenarios.');
    }
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

// ============================================================================
// ACCOUNT OPERATIONS (Scenario-scoped)
// ============================================================================
// NOTE: Scenario CRUD operations (create, update, delete, duplicate) are
// handled by the ScenarioManager business logic layer in:
// js/app/managers/scenario-manager.js

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
  // Delegate to AccountManager for canonical account updates
  const result = await AccountManager.update(scenarioId, accountId, updates);
  // AccountManager.update returns the mutated app-data object from the transaction
  const scenario = result.scenarios.find(s => s.id === scenarioId);
  return scenario.accounts.find(a => a.id === accountId);
}

/**
 * Delete an account from a scenario
 * Cascades delete to all transactions that reference this account
 * @param {number} scenarioId - The scenario ID
 * @param {number} accountId - The account ID
 * @returns {Promise<void>}
 */
export async function deleteAccount(scenarioId, accountId) {
  // Delegate to AccountManager.remove which performs cascading deletes
  await AccountManager.remove(scenarioId, accountId);
}

/**
 * Save all accounts for a scenario (bulk update)
 * @param {number} scenarioId - The scenario ID
 * @param {Array} accounts - Array of accounts
 * @returns {Promise<void>}
 */
export async function saveAccounts(scenarioId, accounts) {
  // Delegate bulk account save to AccountManager to keep normalization consistent
  await AccountManager.saveAll(scenarioId, accounts);
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

  
  // Resolve account IDs to full account objects for UI display
  return transactions.map(tx => {
    const primaryAccount = accounts.find(a => a.id === tx.primaryAccountId);
    const secondaryAccount = accounts.find(a => a.id === tx.secondaryAccountId);
    const transactionType = tx.transactionTypeId === 1
      ? { id: 1, name: 'Money In' }
      : { id: 2, name: 'Money Out' };
    
    return {
      ...tx,
      primaryAccount: primaryAccount || null,
      secondaryAccount: secondaryAccount || null,
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
  // Delegate to TransactionManager for canonical normalization
  const result = await TransactionManager.create(scenarioId, transactionData);
  const scenario = result.scenarios.find(s => s.id === scenarioId);
  return scenario.transactions[scenario.transactions.length - 1];
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
  return scenario?.projection?.rows || [];
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
  
  const scenario = appData.scenarios[scenarioIndex];
  const existingConfig = scenario?.projection?.config || null;
  const today = formatDateOnly(new Date());

  const nextProjection = {
    config: existingConfig || {
      startDate: today,
      endDate: today,
      periodTypeId: DEFAULT_PERIOD_TYPE_ID,
      source: 'transactions'
    },
    rows: Array.isArray(projections) ? projections : [],
    generatedAt: new Date().toISOString()
  };

  appData.scenarios[scenarioIndex] = sanitizeScenarioForWrite({
    ...scenario,
    id: scenarioId,
    projection: nextProjection
  });
  await writeAppData(appData);
}

/**
 * Save the full projection bundle for a scenario (config + rows + generatedAt)
 * @param {number} scenarioId - The scenario ID
 * @param {Object} bundle - Projection bundle
 * @returns {Promise<void>}
 */
export async function saveProjectionBundle(scenarioId, bundle) {
  const appData = await readAppData();
  const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);

  if (scenarioIndex === -1) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }

  const scenario = appData.scenarios[scenarioIndex];
  const existingConfig = scenario?.projection?.config || null;
  const today = formatDateOnly(new Date());

  const nextProjection = {
    config: bundle?.config || existingConfig || {
      startDate: today,
      endDate: today,
      periodTypeId: DEFAULT_PERIOD_TYPE_ID,
      source: 'transactions'
    },
    rows: Array.isArray(bundle?.rows) ? bundle.rows : [],
    generatedAt:
      bundle && Object.prototype.hasOwnProperty.call(bundle, 'generatedAt')
        ? (bundle.generatedAt === undefined ? new Date().toISOString() : bundle.generatedAt)
        : new Date().toISOString()
  };

  appData.scenarios[scenarioIndex] = sanitizeScenarioForWrite({
    ...scenario,
    id: scenarioId,
    projection: nextProjection
  });

  await writeAppData(appData);
}

/**
 * Clear all projections for a scenario
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<void>}
 */
export async function clearProjections(scenarioId) {
  await saveProjectionBundle(scenarioId, { rows: [], generatedAt: null });
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
 * @param {string} customPeriodType - Optional period type override (Day, Week, Month, Quarter, Year)
 * @returns {Promise<Array>} - Array of period objects
 */
export async function getScenarioPeriods(scenarioId, customPeriodType = null) {
  const PERIOD_ID_TO_NAME = {
    1: 'Day',
    2: 'Week',
    3: 'Month',
    4: 'Quarter',
    5: 'Year'
  };

  const scenario = await getScenario(scenarioId);
  if (!scenario) throw new Error(`Scenario ${scenarioId} not found`);

  const windowStart = scenario?.projection?.config?.startDate;
  const windowEnd   = scenario?.projection?.config?.endDate;
  if (!windowStart || !windowEnd) {
    throw new Error(`Scenario ${scenarioId} is missing projection window dates`);
  }

  let periodType = customPeriodType;
  if (!periodType) {
    const periodTypeIdRaw = scenario?.projection?.config?.periodTypeId ?? 3;
    const periodTypeId = typeof periodTypeIdRaw === 'number'
      ? periodTypeIdRaw
      : (typeof periodTypeIdRaw === 'object' ? Number(periodTypeIdRaw?.id) : Number(periodTypeIdRaw)) || 3;
    periodType = PERIOD_ID_TO_NAME[periodTypeId] || 'Month';
  }

  return generatePeriods(windowStart, windowEnd, periodType);
}

// ============================================================================
// EXPORT/IMPORT OPERATIONS
// ============================================================================

/**
 * Export all app data as JSON blob (for download)
 * @returns {Promise<Blob>} - JSON blob ready for download
 */
export async function exportAppData() {
  const appData = await readAppData();
  const jsonString = JSON.stringify(appData, null, 2);
  return new Blob([jsonString], { type: 'application/json' });
}

/**
 * Import app data from JSON string
 * @param {string} jsonString - The JSON string to import
 * @param {boolean} merge - Whether to merge (true) or replace (false)
 * @returns {Promise<void>}
 */
export async function importAppData(jsonString, merge = false) {
  try {
    const importedData = JSON.parse(jsonString);
    
    // Validate basic structure
    if (!importedData.scenarios || !Array.isArray(importedData.scenarios)) {
      throw new Error('Invalid app data format: missing scenarios array');
    }

    assertSchemaVersion43(importedData);
    if (!importedData.uiState || typeof importedData.uiState !== 'object') {
      throw new Error('Invalid app data format: missing uiState object');
    }
    
    
    if (merge) {
      // Merge mode: add imported scenarios with new IDs
      const currentData = await readAppData();
      const startId = allocateNextId(currentData.scenarios);
      // Renumber imported scenarios to start after current max
      importedData.scenarios.forEach((scenario, index) => {
        scenario.id = startId + index;
      });
      
      currentData.scenarios.push(...importedData.scenarios);
      
      // Merge uiState: preserve current selections but allow imported workflow if valid
      if (importedData.uiState && typeof importedData.uiState === 'object') {
        const importedState = normalizeUiState(importedData.uiState);
        currentData.uiState = {
          ...currentData.uiState,
          // Keep viewing preferences from current
          viewPeriodTypeIds: currentData.uiState.viewPeriodTypeIds,
          // Allow imported workflow if valid, else keep current
          lastWorkflowId: importedState.lastWorkflowId || currentData.uiState.lastWorkflowId,
          // Don't restore imported scenario IDs since we renumbered them
          lastScenarioId: null,
          lastScenarioVersion: null
        };
      }
      
      await writeAppData(currentData);
    } else {
      // Replace mode: overwrite all data
      await writeAppData(importedData);
    }
  } catch (err) {
    throw new Error(`Import failed: ${err.message}`);
  }
}
