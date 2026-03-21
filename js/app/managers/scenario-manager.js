// scenario-manager.js
// Business logic for scenario operations
// Uses data-store for persistence

import * as DataStore from '../services/storage-service.js';
import { getNextScenarioVersion, sanitizeScenarioForWrite, allocateNextId } from '../../shared/app-data-utils.js';
import { validateAccountGroups } from '../../domain/utils/account-group-utils.js';

function toPositiveId(value) {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
}

function normalizeAccountGroupDraft(group = {}) {
    const accountIds = Array.isArray(group?.accountIds)
        ? Array.from(new Set(group.accountIds.map(toPositiveId).filter(Boolean)))
        : [];

    return {
        ...group,
        id: toPositiveId(group?.id) || 0,
        name: typeof group?.name === 'string' ? group.name.trim() : '',
        parentGroupId: toPositiveId(group?.parentGroupId),
        accountIds,
        sortOrder: Number.isFinite(Number(group?.sortOrder)) ? Number(group.sortOrder) : 0
    };
}

function normalizeAccountGroupDrafts(groups = []) {
    return Array.isArray(groups) ? groups.map(normalizeAccountGroupDraft) : [];
}

function allocateMissingGroupIds(groups = []) {
    let nextId = allocateNextId(groups);
    return groups.map((group) => {
        const id = toPositiveId(group?.id);
        if (id) return { ...group, id };
        return { ...group, id: nextId++ };
    });
}

function validateAccountGroupsOrThrow(groups = []) {
    const seenNames = new Map();
    (Array.isArray(groups) ? groups : []).forEach((group) => {
        const normalized = String(group?.name || '').trim().toLowerCase();
        if (!normalized) return;
        if (seenNames.has(normalized)) {
            const existingId = seenNames.get(normalized);
            throw new Error(`Duplicate account group name "${group?.name || ''}" (ids ${existingId} and ${group?.id}).`);
        }
        seenNames.set(normalized, group?.id);
    });

    const errors = validateAccountGroups(groups);
    if (errors.length > 0) {
        throw new Error(errors[0]?.message || 'Invalid account group configuration.');
    }
}

function updateScenarioAccountGroups(scenario, mutateGroups) {
    const currentGroups = normalizeAccountGroupDrafts(scenario?.accountGroups || []);
    const nextGroups = mutateGroups(currentGroups);
    const allocatedGroups = allocateMissingGroupIds(normalizeAccountGroupDrafts(nextGroups));
    validateAccountGroupsOrThrow(allocatedGroups);
    return {
        ...scenario,
        accountGroups: allocatedGroups
    };
}

/**
 * Get all scenarios
 * @returns {Promise<Array>} - Array of scenarios
 */
export async function getAll() {
    const scenarios = await DataStore.query('scenarios');
    return Array.isArray(scenarios) ? scenarios : [];
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
        
        const newScenario = sanitizeScenarioForWrite({
            id: allocateNextId(data.scenarios),
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
            id: allocateNextId(data.scenarios),
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

export async function getAccountGroups(scenarioId) {
    const scenarios = await getAll();
    const scenario = scenarios.find((s) => s.id === scenarioId);
    return Array.isArray(scenario?.accountGroups) ? scenario.accountGroups : [];
}

export async function saveAccountGroups(scenarioId, accountGroups) {
    return await DataStore.transaction(async (data) => {
        if (!data || typeof data !== 'object' || !Array.isArray(data.scenarios)) {
            throw new Error('No scenario data exists yet. Create a scenario first.');
        }

        const scenarioIndex = data.scenarios.findIndex((s) => s.id === scenarioId);
        if (scenarioIndex === -1) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }

        const updatedScenario = updateScenarioAccountGroups(data.scenarios[scenarioIndex], () => accountGroups);
        data.scenarios[scenarioIndex] = sanitizeScenarioForWrite({
            ...updatedScenario,
            id: scenarioId
        });
        return data;
    });
}

export async function createAccountGroup(scenarioId, groupData = {}) {
    return await DataStore.transaction(async (data) => {
        if (!data || typeof data !== 'object' || !Array.isArray(data.scenarios)) {
            throw new Error('No scenario data exists yet. Create a scenario first.');
        }

        const scenarioIndex = data.scenarios.findIndex((s) => s.id === scenarioId);
        if (scenarioIndex === -1) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }

        const scenario = data.scenarios[scenarioIndex];
        const nextGroup = normalizeAccountGroupDraft(groupData);
        nextGroup.id = allocateNextId(scenario.accountGroups || []);
        nextGroup.name = nextGroup.name || 'New Group';

        const updatedScenario = updateScenarioAccountGroups(scenario, (groups) => [...groups, nextGroup]);
        data.scenarios[scenarioIndex] = sanitizeScenarioForWrite({
            ...updatedScenario,
            id: scenarioId
        });
        return data;
    });
}

export async function updateAccountGroup(scenarioId, groupId, updates = {}) {
    return await DataStore.transaction(async (data) => {
        if (!data || typeof data !== 'object' || !Array.isArray(data.scenarios)) {
            throw new Error('No scenario data exists yet. Create a scenario first.');
        }

        const scenarioIndex = data.scenarios.findIndex((s) => s.id === scenarioId);
        if (scenarioIndex === -1) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }

        const groupIdNum = toPositiveId(groupId);
        if (!groupIdNum) {
            throw new Error('Invalid account group id.');
        }

        const scenario = data.scenarios[scenarioIndex];
        const updatedScenario = updateScenarioAccountGroups(scenario, (groups) => {
            const groupIndex = groups.findIndex((group) => Number(group.id) === groupIdNum);
            if (groupIndex === -1) {
                throw new Error(`Account group ${groupIdNum} not found`);
            }

            const currentGroup = groups[groupIndex];
            const nextAccountIds = Object.prototype.hasOwnProperty.call(updates, 'accountIds')
                ? Array.from(new Set((Array.isArray(updates.accountIds) ? updates.accountIds : []).map(toPositiveId).filter(Boolean)))
                : currentGroup.accountIds || [];
            const nextName = Object.prototype.hasOwnProperty.call(updates, 'name') && typeof updates.name === 'string'
                ? updates.name.trim()
                : currentGroup.name;
            const nextParentGroupId = Object.prototype.hasOwnProperty.call(updates, 'parentGroupId')
                ? toPositiveId(updates.parentGroupId)
                : currentGroup.parentGroupId;
            const nextSortOrder = Object.prototype.hasOwnProperty.call(updates, 'sortOrder')
                ? (Number.isFinite(Number(updates.sortOrder)) ? Number(updates.sortOrder) : 0)
                : currentGroup.sortOrder;

            groups[groupIndex] = {
                ...currentGroup,
                ...updates,
                id: groupIdNum,
                name: nextName || currentGroup.name || 'New Group',
                parentGroupId: nextParentGroupId,
                accountIds: nextAccountIds,
                sortOrder: nextSortOrder
            };
            return groups;
        });

        data.scenarios[scenarioIndex] = sanitizeScenarioForWrite({
            ...updatedScenario,
            id: scenarioId
        });
        return data;
    });
}

export async function removeAccountGroup(scenarioId, groupId) {
    return await DataStore.transaction(async (data) => {
        if (!data || typeof data !== 'object' || !Array.isArray(data.scenarios)) {
            throw new Error('No scenario data exists yet. Create a scenario first.');
        }

        const scenarioIndex = data.scenarios.findIndex((s) => s.id === scenarioId);
        if (scenarioIndex === -1) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }

        const groupIdNum = toPositiveId(groupId);
        if (!groupIdNum) {
            throw new Error('Invalid account group id.');
        }

        const scenario = data.scenarios[scenarioIndex];
        const updatedScenario = updateScenarioAccountGroups(scenario, (groups) => {
            const remainingGroups = groups
                .filter((group) => Number(group.id) !== groupIdNum)
                .map((group) => (
                    Number(group.parentGroupId) === groupIdNum
                        ? { ...group, parentGroupId: null }
                        : group
                ));
            return remainingGroups;
        });

        data.scenarios[scenarioIndex] = sanitizeScenarioForWrite({
            ...updatedScenario,
            id: scenarioId
        });
        return data;
    });
}

export async function setAccountGroupMemberships(scenarioId, accountId, groupIds = []) {
    return await DataStore.transaction(async (data) => {
        if (!data || typeof data !== 'object' || !Array.isArray(data.scenarios)) {
            throw new Error('No scenario data exists yet. Create a scenario first.');
        }

        const scenarioIndex = data.scenarios.findIndex((s) => s.id === scenarioId);
        if (scenarioIndex === -1) {
            throw new Error(`Scenario ${scenarioId} not found`);
        }

        const accountIdNum = toPositiveId(accountId);
        if (!accountIdNum) {
            throw new Error('Invalid account id.');
        }

        const targetGroupIds = Array.from(new Set((Array.isArray(groupIds) ? groupIds : []).map(toPositiveId).filter(Boolean)));
        const scenario = data.scenarios[scenarioIndex];

        const knownGroupIds = new Set((scenario.accountGroups || []).map((group) => toPositiveId(group.id)).filter(Boolean));
        const unknownGroupIds = targetGroupIds.filter((id) => !knownGroupIds.has(id));
        if (unknownGroupIds.length > 0) {
            throw new Error(`Unknown account group(s): ${unknownGroupIds.join(', ')}`);
        }

        const updatedScenario = updateScenarioAccountGroups(scenario, (groups) => groups.map((group) => ({
            ...group,
            accountIds: (group.accountIds || []).filter((id) => Number(id) !== accountIdNum)
        })).map((group) => (
            targetGroupIds.includes(Number(group.id))
                ? { ...group, accountIds: Array.from(new Set([...(group.accountIds || []), accountIdNum])) }
                : group
        )));

        data.scenarios[scenarioIndex] = sanitizeScenarioForWrite({
            ...updatedScenario,
            id: scenarioId
        });
        return data;
    });
}
