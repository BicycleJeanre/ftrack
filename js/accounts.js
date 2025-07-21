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
    panelHeader.className = 'panel-header';
    panelHeader.innerHTML = `<h2>Accounts</h2><span class="panel-arrow">&#9662;</span>`;
    panelHeader.addEventListener('click', () => window.toggleAccordion('content'));
    window.add(accountsEl, panelHeader);

    //foldable content
    const content = document.createElement('div');
    content.id = 'content';
    content.className = 'content';
    // content.innerHTML = `<h2>placeholder</h2>`;
    content.style.display = 'block';
    window.add(accountsEl, content)

    //create accounts table section
    const table = document.createElement('div');
    table.id = 'accountsTable';
    window.add(content, table);

    return table;
}

async function onSave(){
    console.log("saving!")
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
    // const fs = window.require('fs');
    // const path = process.cwd() + '/assets/accounts-grid.json'
    // await fs.readFile(path, 'utf8', (err, data) => {
    //     if (err) {
    //         console.error('Failed to read schema:', err);
    //         return;
    //     }
    //     try {
    //         gridData.schema = JSON.parse(data);
    //         // console.log(schema);
    //         // You can now use the schema object as needed
    //     } catch (parseErr) {
    //         console.error('Failed to parse schema JSON:', parseErr);
    //     }
    // });
    // const dataPath = process.cwd() + '/assets/app-data.json'
    // await fs.readFile(dataPath, 'utf8', (err, data) => {
    //     if (err) {
    //         console.error('Failed to read schema:', err);
    //         return;
    //     }
    //     try {
    //         let initialData = JSON.parse(data);
    //         //parse internal data
    //         gridData.data = initialData.accounts

    //     } catch (parseErr) {
    //         console.error('Failed to parse schema JSON:', parseErr);
    //     }
    // });

    // console.log(initialData)

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
   
    // gridData.data = initialData;

    return gridData
}

function loadTable(tableData){
    const grid =  new EditableGrid(tableData)
    grid.render()
}

loadGlobals();
const table = buildGridContainer();
const tableData = await createGridSchema(table)
loadTable(tableData);