// scenario-manager.js
// Business logic for scenario operations
// Uses data-store for persistence

import * as DataStore from '../services/storage-service.js';
import { getNextScenarioVersion, sanitizeScenarioForWrite } from '../../shared/app-data-utils.js';

/**
 * Get all scenarios
 * @returns {Promise<Array>} - Array of scenarios
 */
export async function getAll() {
    const scenarios = await DataStore.query('scenarios');
    return Array.isArray(scenarios) ? scenarios : [];
}

/**
 * Get a specific scenario by ID
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<Object|null>} - The scenario object or null
 */
export async function getById(scenarioId) {
    const scenarios = await getAll();
    return scenarios.find(s => s.id === scenarioId) || null;
}

/**
 * Create a new scenario
 * @param {Object} scenarioData - The scenario data
 * @returns {Promise<Object>} - The created scenario with ID
 */
export async function create(scenarioData) {
    return await DataStore.transaction(async (data) => {
        if (!data || typeof data !== 'object') data = {};
        if (!Array.isArray(data.scenarios)) data.scenarios = [];
        
        // Generate new ID
        const maxId = data.scenarios.length > 0 
            ? Math.max(...data.scenarios.map(s => s.id)) 
            : 0;
        
        const newScenario = sanitizeScenarioForWrite({
            id: maxId + 1,
            version: 1,
            name: scenarioData.name || 'New Scenario',
            description: Object.prototype.hasOwnProperty.call(scenarioData, 'description')
              ? scenarioData.description
              : null,
            lineage: null,
            accounts: [],
            transactions: [],
            budgets: [],
            projection: null,
            planning: null,
            ...scenarioData
        });
        
        data.scenarios.push(newScenario);
        return data;
    });
}

/**
 * Update an existing scenario
 * @param {number} scenarioId - The scenario ID
 * @param {Object} updates - The fields to update
 * @returns {Promise<Object>} - The updated scenario
 */
export async function update(scenarioId, updates) {
    
    return await DataStore.transaction(async (data) => {
        if (!data || typeof data !== 'object' || !Array.isArray(data.scenarios)) {
            throw new Error('No scenario data exists yet. Create a scenario first.');
        }
        const scenarioIndex = data.scenarios.findIndex(s => s.id === scenarioId);
        
        if (scenarioIndex === -1) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }
        
        
        data.scenarios[scenarioIndex] = sanitizeScenarioForWrite({
            ...data.scenarios[scenarioIndex],
            ...updates,
            id: scenarioId
        });
        
        
        return data;
    });
}

/**
 * Delete a scenario
 * @param {number} scenarioId - The scenario ID
 * @returns {Promise<void>}
 */
export async function remove(scenarioId) {
    return await DataStore.transaction(async (data) => {
        if (!data || typeof data !== 'object' || !Array.isArray(data.scenarios)) {
            return { scenarios: [] };
        }
        data.scenarios = data.scenarios.filter(s => s.id !== scenarioId);
        return data;
    });
}

/**
 * Duplicate a scenario
 * @param {number} scenarioId - The scenario ID to duplicate
 * @param {string} newName - Name for the duplicated scenario
 * @returns {Promise<Object>} - The new scenario
 */
export async function duplicate(scenarioId, newName) {
    return await DataStore.transaction(async (data) => {
        if (!data || typeof data !== 'object' || !Array.isArray(data.scenarios) || data.scenarios.length === 0) {
            throw new Error('No scenarios exist yet to duplicate. Create a scenario first.');
        }
        const sourceScenario = data.scenarios.find(s => s.id === scenarioId);
        
        if (!sourceScenario) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }
        
        // Generate new ID
        const maxId = Math.max(...data.scenarios.map(s => s.id));
        
        const ancestorScenarioIds = Array.isArray(sourceScenario.lineage?.ancestorScenarioIds)
          ? sourceScenario.lineage.ancestorScenarioIds
          : [];
        const nextAncestors = [...ancestorScenarioIds, sourceScenario.id];
        const nextVersion = getNextScenarioVersion({ sourceScenario, scenarios: data.scenarios });

        const cloned = JSON.parse(JSON.stringify(sourceScenario));
        const nextProjection = cloned.projection
          ? { ...cloned.projection, rows: [], generatedAt: null }
          : null;

        const newScenario = sanitizeScenarioForWrite({
            ...cloned,
            id: maxId + 1,
            version: nextVersion,
            name: newName || `${sourceScenario.name} (Copy)`,
            lineage: {
              duplicatedFromScenarioId: sourceScenario.id,
              ancestorScenarioIds: nextAncestors
            },
            projection: nextProjection
        });
        
        data.scenarios.push(newScenario);
        return data;
    });
}
