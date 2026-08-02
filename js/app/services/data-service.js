// data-service.js
// Centralized data management for scenario-centric architecture
// All operations read/write from localStorage (Web)

import { generatePeriods } from '../../domain/calculations/period-utils.js';
import { formatDateOnly } from '../../shared/date-utils.js';
import * as ScenarioManager from '../managers/scenario-manager.js';
import * as AccountManager from '../managers/account-manager.js';
import * as TransactionManager from '../managers/transaction-manager.js';
import * as DataStore from './storage-service.js';
import { notifyError } from '../../shared/notifications.js';
import {
  DEFAULT_PERIOD_TYPE_ID,
  CURRENT_SCHEMA_VERSION,
  assertCurrentSchemaVersion,
  sanitizeAppDataForWrite,
  sanitizeScenarioForWrite,
  allocateNextId,
  normalizeUiState
} from '../../shared/app-data-utils.js';
import { migrateAppData } from '../../shared/migration-utils.js';
import { validateAppData } from './validation-service.js';

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
    assertCurrentSchemaVersion(data);
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
 * Save all accounts for a scenario (bulk update)
 * @param {number} scenarioId - The scenario ID
 * @param {Array} accounts - Array of accounts
 * @returns {Promise<void>}
 */
export async function saveAccounts(scenarioId, accounts) {
  // Delegate bulk account save to AccountManager to keep normalization consistent
  await AccountManager.saveAll(scenarioId, accounts);
}

export async function getAccountGroups(scenarioId) {
  const scenario = await getScenario(scenarioId);
  return Array.isArray(scenario?.accountGroups)
    ? scenario.accountGroups.map((group) => ({
      ...group,
      accountIds: Array.isArray(group.accountIds) ? [...group.accountIds] : []
    }))
    : [];
}

export async function saveAccountGroups(scenarioId, accountGroups) {
  return await ScenarioManager.saveAccountGroups(scenarioId, accountGroups);
}

export async function createAccountGroup(scenarioId, groupData) {
  const data = await ScenarioManager.createAccountGroup(scenarioId, groupData);
  const scenario = data.scenarios.find((s) => s.id === scenarioId);
  return scenario?.accountGroups?.[scenario.accountGroups.length - 1] || null;
}

export async function updateAccountGroup(scenarioId, groupId, updates) {
  const data = await ScenarioManager.updateAccountGroup(scenarioId, groupId, updates);
  const scenario = data.scenarios.find((s) => s.id === scenarioId);
  return Array.isArray(scenario?.accountGroups)
    ? scenario.accountGroups.find((group) => Number(group.id) === Number(groupId)) || null
    : null;
}

export async function removeAccountGroup(scenarioId, groupId) {
  return await ScenarioManager.removeAccountGroup(scenarioId, groupId);
}

export async function setAccountGroupMemberships(scenarioId, accountId, groupIds = []) {
  return await ScenarioManager.setAccountGroupMemberships(scenarioId, accountId, groupIds);
}

export async function assignAccountToGroup(scenarioId, accountId, groupId) {
  return await ScenarioManager.setAccountGroupMemberships(scenarioId, accountId, groupId ? [groupId] : []);
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
 * Save the full projection bundle for a scenario (config + rows + generatedAt)
 * @param {number} scenarioId - The scenario ID
 * @param {Object} bundle - Projection bundle
 * @returns {Promise<void>}
 */
export async function saveProjectionBundle(scenarioId, bundle) {
  let saved = false;
  await DataStore.transaction(async (appData) => {
    const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);

    if (scenarioIndex === -1) {
      throw new Error(`Scenario ${scenarioId} not found`);
    }

    const scenario = appData.scenarios[scenarioIndex];
    const hasExpectedStaleAt = Object.prototype.hasOwnProperty.call(
      bundle || {},
      'expectedStaleAt'
    );
    const currentStaleAt = scenario?.projection?.staleAt ?? null;
    if (hasExpectedStaleAt && currentStaleAt !== (bundle?.expectedStaleAt ?? null)) {
      return appData;
    }

    const existingConfig = scenario?.projection?.config || null;
    const today = formatDateOnly(new Date());
    const nextProjection = {
      config: bundle?.config || existingConfig || {
        startDate: today,
        endDate: today,
        periodTypeId: DEFAULT_PERIOD_TYPE_ID
      },
      rows: Array.isArray(bundle?.rows) ? bundle.rows : [],
      generatedAt:
        bundle && Object.prototype.hasOwnProperty.call(bundle, 'generatedAt')
          ? (bundle.generatedAt === undefined ? new Date().toISOString() : bundle.generatedAt)
          : new Date().toISOString(),
      stale: bundle?.stale === true,
      staleAt: bundle?.stale === true ? (bundle?.staleAt ?? new Date().toISOString()) : null,
      staleReason: bundle?.stale === true ? (bundle?.staleReason ?? 'plan-changed') : null
    };

    appData.scenarios[scenarioIndex] = sanitizeScenarioForWrite({
      ...scenario,
      id: scenarioId,
      projection: nextProjection
    });
    saved = true;
    return appData;
  });
  return saved;
}



/**
 * Save canonical transaction occurrences for a scenario.
 * @param {number} scenarioId - The scenario ID
 * @param {Array} occurrences - Array of occurrence records
 * @returns {Promise<void>}
 */
export async function saveTransactionOccurrences(scenarioId, occurrences) {
  const appData = await readAppData();
  const scenarioIndex = appData.scenarios.findIndex(s => s.id === scenarioId);
  
  if (scenarioIndex === -1) {
    throw new Error(`Scenario ${scenarioId} not found`);
  }
  
  appData.scenarios[scenarioIndex].transactionOccurrences =
    Array.isArray(occurrences) ? occurrences : [];
  await writeAppData(appData);
}

/**
 * Get canonical transaction occurrences for a scenario.
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<Array>}
 */
export async function getTransactionOccurrences(scenarioId) {
  const scenario = await getScenario(scenarioId);
  return scenario?.transactionOccurrences || [];
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
export async function getScenarioPeriods(scenarioId, customPeriodType = null, windowType = 'projection') {
  const PERIOD_ID_TO_NAME = {
    1: 'Day',
    2: 'Week',
    3: 'Month',
    4: 'Quarter',
    5: 'Year'
  };

  const scenario = await getScenario(scenarioId);
  if (!scenario) throw new Error(`Scenario ${scenarioId} not found`);

  // Select window config based on windowType
  let windowConfig;
  if (windowType === 'planning') {
    // Future support for planning windows
    windowConfig = scenario?.planning?.generatePlan;
    if (!windowConfig) {
      // Fall back to projection if planning window not set
      windowConfig = scenario?.projection?.config;
    }
  } else {
    // Default: projection window
    windowConfig = scenario?.projection?.config;
  }

  if (!windowConfig) {
    throw new Error(`Scenario ${scenarioId} is missing window configuration for type '${windowType}'`);
  }

  const windowStart = windowConfig.startDate;
  const windowEnd = windowConfig.endDate;

  if (!windowStart || !windowEnd) {
    throw new Error(`Scenario ${scenarioId} window (${windowType}) is missing startDate or endDate`);
  }

  let periodType = customPeriodType;
  if (!periodType) {
    // Use the selected projection/planning period type.
    const periodTypeIdRaw = windowConfig.periodTypeId ?? 3;
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
    let importedData = JSON.parse(jsonString);
    let wasMigrated = false;
    
    // Validate basic structure
    if (!importedData.scenarios || !Array.isArray(importedData.scenarios)) {
      throw new Error('Invalid app data format: missing scenarios array');
    }

    if (importedData.schemaVersion !== CURRENT_SCHEMA_VERSION) {
      importedData = migrateAppData(importedData);
      wasMigrated = true;
    }
    assertCurrentSchemaVersion(importedData);
    if (!importedData.uiState || typeof importedData.uiState !== 'object') {
      throw new Error('Invalid app data format: missing uiState object');
    }
    const legacyFields = importedData.scenarios.flatMap((scenario, index) => {
      const paths = [];
      if (Object.prototype.hasOwnProperty.call(scenario || {}, 'budgets')) {
        paths.push(`scenarios[${index}].budgets`);
      }
      if (Object.prototype.hasOwnProperty.call(scenario || {}, 'budgetWindow')) {
        paths.push(`scenarios[${index}].budgetWindow`);
      }
      if (Object.prototype.hasOwnProperty.call(scenario?.projection?.config || {}, 'source')) {
        paths.push(`scenarios[${index}].projection.config.source`);
      }
      return paths;
    });
    if (legacyFields.length) {
      throw new Error(
        `Invalid schemaVersion ${CURRENT_SCHEMA_VERSION} data: legacy field ${legacyFields[0]}`
      );
    }
    importedData = sanitizeAppDataForWrite(importedData);
    const validation = validateAppData(importedData);
    if (!validation.isValid) {
      const firstRootIssue = validation.rootIssues?.[0];
      const firstScenarioIssue = validation.scenarios
        ?.flatMap((scenario) => scenario.issues || [])
        ?.[0];
      const firstIssue = firstRootIssue || firstScenarioIssue;
      throw new Error(
        `Invalid schemaVersion ${CURRENT_SCHEMA_VERSION} data` +
        (firstIssue ? ` at ${firstIssue.path}: ${firstIssue.message}` : '')
      );
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
      if (importedData.migrationReport) {
        currentData.migrationReport = importedData.migrationReport;
      }
      
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
    return {
      migrated: wasMigrated,
      migrationReport: importedData.migrationReport || null
    };
  } catch (err) {
    throw new Error(`Import failed: ${err.message}`);
  }
}
