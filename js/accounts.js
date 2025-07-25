// This script manages the Accounts page (/pages/accounts.html).
// It uses the EditableGrid module to render and manage the accounts table.

import { EditableGrid } from './editable-grid.js';
import { loadGlobals } from './global-app.js';

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
    // updatedAccounts: the new/changed accounts data to persist
    const fs = window.require('fs').promises;
    const dataPath = process.cwd() + '/assets/app-data.json';
    try {
        // Read the current data file
        const dataFile = await fs.readFile(dataPath, 'utf8');
        let appData = JSON.parse(dataFile);
        // Only update the accounts property with the new data
        appData.accounts = updatedAccounts;
        // Write the updated data back to disk
        await fs.writeFile(dataPath, JSON.stringify(appData, null, 2), 'utf8');
        console.log('Accounts saved successfully!');
    } catch (err) {
        console.error('Failed to save accounts data:', err);
    }
}

async function onDelete(){
    console.log("Deleting!")
}

async function createGridSchema(tableElement, onSave, onDelete) {
    let gridData = {}
    gridData.targetElement = tableElement;
    gridData.tableHeader = 'Accounts'
    gridData.onSave = onSave;
    gridData.onDelete = onDelete;
    
    // Load the schema file from disk in an Electron app
    const fs = window.require('fs').promises; // Use the promise-based fs module
    const schemaPath = process.cwd() + '/assets/accounts-grid.json';
    const dataPath = process.cwd() + '/assets/app-data.json';

    try {
        const schemaFile = await fs.readFile(schemaPath, 'utf8');
        gridData.schema = JSON.parse(schemaFile);

        const dataFile = await fs.readFile(dataPath, 'utf8');
        const initialData = JSON.parse(dataFile);
        gridData.data = initialData.accounts;
    } catch (err) {
        console.error('Failed to read or parse data files:', err);
        // Return null or an empty structure if files can't be loaded
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
const tableData = await createGridSchema(table, onSave, onDelete)
loadTable(tableData);