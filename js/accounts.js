// This script manages the Accounts page (/pages/accounts.html).
// It uses the EditableGrid module to render and manage the accounts table.

import { EditableGrid } from './editable-grid.js';
import { loadGlobals } from './global-app.js';
import * as dataManager from './data-manager.js';
import { getSelectedScenarioId } from './config.js';

//Define Editable Grid Schema. 
//Create Editable Grid. 
// handle save/insert/delete
// handle delete



function buildGridContainer(){

    const accountsEl = getEl('panel-accounts');

    //create header with foldable content    
    const panelHeader = document.createElement('div');
    panelHeader.className = 'bg-main bordered rounded shadow-lg pointer flex-between accordion-header'
    panelHeader.innerHTML = `<h2 class="text-main">Accounts</h2><span class="accordion-arrow">&#9662;</span>`;
    panelHeader.addEventListener('click', () => window.toggleAccordion('content'));
    window.add(accountsEl, panelHeader);

    //foldable content
    const content = document.createElement('div');
    content.id = 'content';
    content.className = 'bg-main rounded shadow-md accordion-content'
    content.style.display = 'block';
    content.style.padding = '18px 20px 20px 20px';
    window.add(accountsEl, content)

    //create accounts table section
    const table = document.createElement('div');
    table.id = 'accountsTable';
    window.add(content, table);

    return table;
}

async function onSave(updatedAccounts) {
    const scenarioId = getSelectedScenarioId();
    await dataManager.saveAccounts(scenarioId, updatedAccounts);
}

async function onDelete(accountId) {
    const scenarioId = getSelectedScenarioId();
    await dataManager.deleteAccount(scenarioId, accountId);
}

async function createGridSchema(tableElement, onSave, onDelete) {
    let gridData = {}
    gridData.targetElement = tableElement;
    gridData.tableHeader = 'Accounts'
    gridData.onSave = onSave;
    gridData.onDelete = onDelete;
    
    // Load the schema file from disk in an Electron app
    const fs = window.require('fs').promises;
    const path = window.require('path');
    const schemaPath = path.join(__dirname, '..', 'assets', 'accounts-grid.json');

    try {
        const schemaFile = await fs.readFile(schemaPath, 'utf8');
        gridData.schema = JSON.parse(schemaFile);

        // Load accounts data from DataManager
        const scenarioId = getSelectedScenarioId();
        gridData.data = await dataManager.getAccounts(scenarioId);
    } catch (err) {
        console.error('Failed to read or parse schema file:', err);
        console.error('Schema path:', schemaPath);
        alert('Error: Could not load accounts configuration. Please check that all required files are present.');
        return null; 
    }

    return gridData
}

function loadTable(tableData){
    if (!tableData) {
        console.error('Cannot load table: tableData is null');
        return;
    }
    tableData.showActions = false; // Hide actions column - use keyboard shortcuts instead
    const grid =  new EditableGrid(tableData)
    grid.render()
}

loadGlobals();
const table = buildGridContainer();
const tableData = await createGridSchema(table, onSave)
loadTable(tableData);