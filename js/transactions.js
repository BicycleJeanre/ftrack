// This script manages the Transactions page (/pages/transactions.html).
// It uses the EditableGrid module to render and manage the transactions table.

import { EditableGrid } from './editable-grid.js';
import { loadGlobals } from './global-app.js';

//Define Editable Grid Schema. 
//Create Editable Grid. 
// handle save/insert/delete
// handle delete



function buildGridContainer(){

    const transactionsEl = getEl('panel-transactions');

    //create header with foldable content    
    const panelHeader = document.createElement('div');
    panelHeader.className = 'bg-main bordered rounded shadow-lg pointer flex-between accordion-header'
    panelHeader.innerHTML = `<h2 class="text-main">Transactions</h2><span class="accordion-arrow">&#9662;</span>`;
    panelHeader.addEventListener('click', () => window.toggleAccordion('content'));
    window.add(transactionsEl, panelHeader);

    //foldable content
    const content = document.createElement('div');
    content.id = 'content';
    content.className = 'bg-main rounded shadow-md accordion-content'
    content.style.display = 'block';
    content.style.padding = '18px 20px 20px 20px';
    window.add(transactionsEl, content)

    //create transactions table section
    const table = document.createElement('div');
    table.id = 'transactionsTable';
    window.add(content, table);

    return table;
}

async function onSave(updatedTransactions) {
    // updatedTransactions: the new/changed transactions data to persist
    const fs = window.require('fs').promises;
    const dataPath = process.cwd() + '/assets/app-data.json';
    const accountsSchemaPath = process.cwd() + '/assets/accounts-grid.json';
    try {
        // Load accounts schema for default values
        const accountsSchemaFile = await fs.readFile(accountsSchemaPath, 'utf8');
        const accountsSchema = JSON.parse(accountsSchemaFile);
        const acctCols = accountsSchema.mainGrid.columns;
        // Read the current data file
        const dataFile = await fs.readFile(dataPath, 'utf8');
        let appData = JSON.parse(dataFile);
        // Quick-add accounts: detect new account names and assign ids
        let nextId = appData.accounts.reduce((max, a) => a.id > max ? a.id : max, 0) + 1;
        updatedTransactions.forEach(tx => {
            ['debit_account','credit_account'].forEach(field => {
                const acct = tx[field];
                if (acct && (acct.id === null || acct.id === undefined)) {
                    // New account: assign id and add with schema defaults
                    acct.id = nextId;
                    const newAcct = { id: nextId, name: acct.name };
                    acctCols.forEach(col => {
                        switch(col.field) {
                            case 'type': {
                                const def = col.default;
                                const optList = accountsSchema.accountType || [];
                                const found = optList.find(o => o.name.toLowerCase() === String(def).toLowerCase());
                                newAcct.type = found || { id: null, name: def };
                                break;
                            }
                            case 'currency': {
                                const def = col.default;
                                const optList = accountsSchema.currencies || [];
                                const found = optList.find(o => o.name.toLowerCase() === String(def).toLowerCase());
                                newAcct.currency = found || { id: null, name: def };
                                break;
                            }
                            case 'balance': {
                                newAcct.balance = (typeof col.default !== 'undefined') ? col.default : 0;
                                break;
                            }
                            case 'current_balance': {
                                newAcct.current_balance = (typeof col.default !== 'undefined') ? col.default : 0;
                                break;
                            }
                            case 'interest': {
                                newAcct.interest = col.default || null;
                                break;
                            }
                            case 'openDate': {
                                newAcct.openDate = (typeof col.default !== 'undefined') ? col.default : '';
                                break;
                            }
                        }
                    });
                    appData.accounts.push(newAcct);
                    nextId++;
                }
            });
        });
        // Update transactions data
        appData.transactions = updatedTransactions;
        // Write the updated data back to disk
        await fs.writeFile(dataPath, JSON.stringify(appData, null, 2), 'utf8');
        console.log('Transactions saved successfully!');
    } catch (err) {
        console.error('Failed to save transactions data:', err);
    }
}

async function createGridSchema(tableElement, onSave, onDelete) {
    let gridData = {}
    gridData.targetElement = tableElement;
    gridData.tableHeader = 'Transactions'
    gridData.onSave = onSave;
    gridData.onDelete = onDelete;
    
    // Load the schema file from disk in an Electron app
    const fs = window.require('fs').promises; // Use the promise-based fs module
    const schemaPath = process.cwd() + '/assets/transactions-grid.json';
    const dataPath = process.cwd() + '/assets/app-data.json';

    try {
        const schemaFile = await fs.readFile(schemaPath, 'utf8');
        gridData.schema = JSON.parse(schemaFile);

        const dataFile = await fs.readFile(dataPath, 'utf8');
        const initialData = JSON.parse(dataFile);
        gridData.data = initialData.transactions;

        // Inject dynamic options for columns with optionsSourceFile
        gridData.schema.mainGrid.columns.forEach(col => {
            if (col.optionsSourceFile && col.optionsSourceFile === 'app-data.json' && initialData[col.optionsSource]) {
                gridData.schema[col.optionsSource] = initialData[col.optionsSource].map(opt => ({ id: opt.id, name: opt.name }));
            }
        });
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
const tableData = await createGridSchema(table, onSave)
loadTable(tableData);