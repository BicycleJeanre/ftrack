// scenario-manager.js
// Business logic for scenario operations
// Uses data-store for persistence

import * as DataStore from '../core/data-store.js';

/**
 * Get all scenarios
 * @returns {Promise<Array>} - Array of scenarios
 */
export async function getAll() {
    return await DataStore.query('scenarios') || [];
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
        if (!data.scenarios) {
            data.scenarios = [];
        }
        
        // Generate new ID
        const maxId = data.scenarios.length > 0 
            ? Math.max(...data.scenarios.map(s => s.id)) 
            : 0;
        
        const newScenario = {
            id: maxId + 1,
            name: scenarioData.name || 'New Scenario',
            type: scenarioData.type || { id: 1, name: 'Budget' },
            description: scenarioData.description || '',
            startDate: scenarioData.startDate || new Date().toISOString().slice(0, 10),
            endDate: scenarioData.endDate || null,
            projectionPeriod: scenarioData.projectionPeriod || { id: 3, name: 'Month' },
            accounts: [],
            plannedTransactions: [],
            actualTransactions: [],
            projections: [],
            ...scenarioData
        };
        
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
    console.log(`[ScenarioManager] Updating scenario ${scenarioId} with:`, updates);
    
    return await DataStore.transaction(async (data) => {
        const scenarioIndex = data.scenarios.findIndex(s => s.id === scenarioId);
        
        if (scenarioIndex === -1) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }
        
        console.log(`[ScenarioManager] Before update:`, data.scenarios[scenarioIndex]);
        
        data.scenarios[scenarioIndex] = {
            ...data.scenarios[scenarioIndex],
            ...updates
        };
        
        console.log(`[ScenarioManager] After update:`, data.scenarios[scenarioIndex]);
        
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
        const sourceScenario = data.scenarios.find(s => s.id === scenarioId);
        
        if (!sourceScenario) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }
        
        // Generate new ID
        const maxId = Math.max(...data.scenarios.map(s => s.id));
        
        const newScenario = {
            ...sourceScenario,
            id: maxId + 1,
            name: newName || `${sourceScenario.name} (Copy)`,
            accounts: [...sourceScenario.accounts],
            plannedTransactions: [...sourceScenario.plannedTransactions],
            actualTransactions: [],
            projections: []
        };
        
        data.scenarios.push(newScenario);
        return data;
    });
}
