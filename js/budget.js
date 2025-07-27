// This script manages the Budget page (/pages/budget.html).
// It uses the EditableGrid module to render and manage the budget table.

import { EditableGrid } from './editable-grid.js';
import { loadGlobals } from './global-app.js';

//Define Editable Grid Schema. 
//Create Editable Grid. 
// handle save/insert/delete
// handle delete



function buildGridContainer(){

    const budgetEl = getEl('panel-budget');

    //create header with foldable content    
    const panelHeader = document.createElement('div');
    panelHeader.className = 'bg-main bordered rounded shadow-lg pointer flex-between accordion-header'
    panelHeader.innerHTML = `<h2 class="text-main">Budget</h2><span class="accordion-arrow">&#9662;</span>`;
    panelHeader.addEventListener('click', () => window.toggleAccordion('content'));
    window.add(budgetEl, panelHeader);

    //foldable content
    const content = document.createElement('div');
    content.id = 'content';
    content.className = 'bg-main rounded shadow-md accordion-content'
    content.style.display = 'block';
    content.style.padding = '18px 20px 20px 20px';
    window.add(budgetEl, content)

    //create budget table section
    const table = document.createElement('div');
    table.id = 'budgetTable';
    window.add(content, table);

    return table;
}

async function onSave(updatedBudget) {
    // updatedBudget: the new/changed budget data to persist
    const fs = window.require('fs').promises;
    const dataPath = process.cwd() + '/assets/app-data.json';
    try {
        // Read the current data file
        const dataFile = await fs.readFile(dataPath, 'utf8');
        let appData = JSON.parse(dataFile);
        // Only update the budget property with the new data
        appData.budgetDefinitions = updatedBudget;
        // Write the updated data back to disk
        await fs.writeFile(dataPath, JSON.stringify(appData, null, 2), 'utf8');
        console.log('Budget saved successfully!');
    } catch (err) {
        console.error('Failed to save budget data:', err);
    }
}

async function createGridSchema(tableElement, onSave) {
    let gridData = {}
    gridData.targetElement = tableElement;
    gridData.tableHeader = 'Budget'
    gridData.onSave = onSave;
    
    // Load the schema file from disk in an Electron app
    const fs = window.require('fs').promises; 
    const schemaPath = process.cwd() + '/assets/budget-definition-grid.json';
    const dataPath = process.cwd() + '/assets/app-data.json';

    try {
        const schemaFile = await fs.readFile(schemaPath, 'utf8');
        gridData.schema = JSON.parse(schemaFile);

        const dataFile = await fs.readFile(dataPath, 'utf8');
        const initialData = JSON.parse(dataFile);
        gridData.data = initialData.budgetDefinitions;
    } catch (err) {
        console.error('Failed to read or parse data files:', err);
        return null; 
    }

    return gridData
}

function loadTable(tableData){
    const grid =  new EditableGrid(tableData)
    grid.render()
}

loadGlobals();
const table = buildGridContainer();
const tableData = await createGridSchema(table, onSave)
loadTable(tableData);