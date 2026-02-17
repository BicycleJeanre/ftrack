// scenario-manager.js
// Business logic for scenario operations
// Uses data-store for persistence

import * as DataStore from '../services/storage-service.js';
import { formatDateOnly } from '../../shared/date-utils.js';

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
        if (!data || typeof data !== 'object') {
            data = { scenarios: [] };
        }
        if (!Array.isArray(data.scenarios)) {
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
            startDate: scenarioData.startDate || formatDateOnly(new Date()),
            endDate: scenarioData.endDate || null,
            projectionPeriod: scenarioData.projectionPeriod || { id: 3, name: 'Month' },
            accounts: [],
            transactions: [],
            projections: [],
            budgets: [],
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
    
    return await DataStore.transaction(async (data) => {
        if (!data || typeof data !== 'object' || !Array.isArray(data.scenarios)) {
            throw new Error('No scenario data exists yet. Create a scenario first.');
        }
        const scenarioIndex = data.scenarios.findIndex(s => s.id === scenarioId);
        
        if (scenarioIndex === -1) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }
        
        
        data.scenarios[scenarioIndex] = {
            ...data.scenarios[scenarioIndex],
            ...updates
        };
        
        
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
        
        const newScenario = {
            ...sourceScenario,
            id: maxId + 1,
            name: newName || `${sourceScenario.name} (Copy)`,
            accounts: [...sourceScenario.accounts],
            transactions: [...(sourceScenario.transactions || [])],
            projections: []
        };
        
        data.scenarios.push(newScenario);
        return data;
    });
}
