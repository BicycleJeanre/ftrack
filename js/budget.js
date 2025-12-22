// This script manages the Budget page (/pages/budget.html).
// It uses the EditableGrid module to render and manage the budget table.

import { EditableGrid } from './editable-grid.js';
import { loadGlobals } from './global-app.js';
import { generateForecast } from './forecast-generator.js';

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

    //create budget Definition table section
    const budgetDefinitionTable = document.createElement('div');
    budgetDefinitionTable.id = 'budgetDefinitionTable';
    window.add(content, budgetDefinitionTable);


    //create budget forecast table section
    const budgetForecastTable = document.createElement('div');
    budgetForecastTable.id = 'budgetForecastTable';
    window.add(content, budgetForecastTable);

    return {budgetForecastTable, budgetDefinitionTable}
}

async function onDefinitionSave(updatedBudget) {
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
        // Call forecast generator directly
        await generateForecast();
        console.log('Forecast generated!');
    } catch (err) {
        console.error('Failed to save budget data or generate forecast:', err);
    }
}

async function onForecastSave(updatedData) {
    // updatedBudget: the new/changed budget data to persist
    const fs = window.require('fs').promises;
    const dataPath = process.cwd() + '/assets/app-data.json';
    try {
        // Read the current data file
        const dataFile = await fs.readFile(dataPath, 'utf8');
        let appData = JSON.parse(dataFile);
        // Only update the budget property with the new data
        appData.budgetForecasts = updatedData;
        // Write the updated data back to disk
        await fs.writeFile(dataPath, JSON.stringify(appData, null, 2), 'utf8');
        console.log('Budget saved successfully!');
    } catch (err) {
        console.error('Failed to save budget data:', err);
    }
}

async function createBudgetDefinitionSchema(tableElement, onDefinitionSave) {
    let gridData = {}
    gridData.targetElement = tableElement;
    gridData.tableHeader = 'Budget'
    gridData.onSave = onDefinitionSave;
    
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

        gridData.schema.mainGrid.columns.forEach(col => {
            if (col.optionsSourceFile && col.optionsSourceFile === 'app-data.json' && initialData[col.optionsSource]) {
                gridData.schema[col.optionsSource] = initialData[col.optionsSource].map(opt => ({ id: opt.id, name: opt.name }));
            }
        });
    } catch (err) {
        console.error('Failed to read or parse data files:', err);
        return null; 
    }

    return gridData
}

async function createBudgetForecastSchema(tableElement, onForecastSave) {
    let gridData = {}
    gridData.targetElement = tableElement;
    gridData.tableHeader = 'Budget'
    gridData.onSave = onForecastSave;
    
    // Load the schema file from disk in an Electron app
    const fs = window.require('fs').promises; 
    const schemaPath = process.cwd() + '/assets/budget-forecast-grid.json';
    const dataPath = process.cwd() + '/assets/app-data.json';

    try {
        const schemaFile = await fs.readFile(schemaPath, 'utf8');
        gridData.schema = JSON.parse(schemaFile);

        const dataFile = await fs.readFile(dataPath, 'utf8');
        const initialData = JSON.parse(dataFile);
        gridData.data = initialData.budgetForecasts;

        // Inject dynamic options for columns with optionsSourceFile
        gridData.schema.mainGrid.columns.forEach(col => {
            if (col.optionsSourceFile && col.optionsSourceFile === 'app-data.json' && initialData[col.optionsSource]) {
                gridData.schema[col.optionsSource] = initialData[col.optionsSource].map(opt => ({ id: opt.id, name: opt.name }));
            }
        });
    } catch (err) {
        console.error('Failed to read or parse data files:', err);
        return null; 
    }

    return gridData
}

function loadTables(budgetDefinitionData, budgetForecastData){
    const definitionGrid =  new EditableGrid(budgetDefinitionData)
    definitionGrid.render()
    const forecastGrid =  new EditableGrid(budgetForecastData)
    forecastGrid.render()
}

loadGlobals();
const {budgetForecastTable, budgetDefinitionTable} = buildGridContainer();
const budgetDefinitionData = await createBudgetDefinitionSchema(budgetDefinitionTable, onDefinitionSave)
const budgetForecastData = await createBudgetForecastSchema(budgetForecastTable, onForecastSave)

loadTables(budgetDefinitionData, budgetForecastData);