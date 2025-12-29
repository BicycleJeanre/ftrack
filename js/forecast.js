// This script manages the Financial Forecast page (/pages/forecast.html).
// It uses the EditableGrid module to render and manage the forecast table.

import { EditableGrid } from './editable-grid.js';
import { loadGlobals } from './global-app.js';
import { generateForecast } from './forecast-generator.js';

//Define Editable Grid Schema. 
//Create Editable Grid. 
// handle save/insert/delete
// handle delete



function buildGridContainer(){

    const forecastEl = getEl('panel-forecast');

    //create header with foldable content    
    const panelHeader = document.createElement('div');
    panelHeader.className = 'bg-main bordered rounded shadow-lg pointer flex-between accordion-header'
    panelHeader.innerHTML = `<h2 class="text-main">Financial Forecast</h2><span class="accordion-arrow">&#9662;</span>`;
    panelHeader.addEventListener('click', () => window.toggleAccordion('content'));
    window.add(forecastEl, panelHeader);

    //foldable content
    const content = document.createElement('div');
    content.id = 'content';
    content.className = 'bg-main rounded shadow-md accordion-content'
    content.style.display = 'block';
    content.style.padding = '18px 20px 20px 20px';
    window.add(forecastEl, content)

    //create forecast Definition table section
    const forecastDefinitionTable = document.createElement('div');
    forecastDefinitionTable.id = 'forecastDefinitionTable';
    window.add(content, forecastDefinitionTable);


    //create forecast snapshot table section
    const forecastSnapshotTable = document.createElement('div');
    forecastSnapshotTable.id = 'forecastSnapshotTable';
    window.add(content, forecastSnapshotTable);

    return {forecastSnapshotTable, forecastDefinitionTable}
}

async function onDefinitionSave(updatedForecast) {
    // updatedForecast: the new/changed forecast data to persist
    const fs = window.require('fs').promises;
    const dataPath = process.cwd() + '/assets/app-data.json';
    try {
        // Read the current data file
        const dataFile = await fs.readFile(dataPath, 'utf8');
        let appData = JSON.parse(dataFile);
        // Only update the forecast property with the new data
        appData.forecastDefinitions = updatedForecast;
        // Write the updated data back to disk
        await fs.writeFile(dataPath, JSON.stringify(appData, null, 2), 'utf8');
        console.log('Forecast saved successfully!');
        // Call forecast generator directly
        await generateForecast();
        console.log('Forecast generated!');
    } catch (err) {
        console.error('Failed to save forecast data or generate forecast:', err);
    }
}

async function onSnapshotSave(updatedData) {
    // updatedData: the new/changed forecast snapshot data to persist
    const fs = window.require('fs').promises;
    const dataPath = process.cwd() + '/assets/app-data.json';
    try {
        // Read the current data file
        const dataFile = await fs.readFile(dataPath, 'utf8');
        let appData = JSON.parse(dataFile);
        // Only update the forecast snapshots property with the new data
        appData.forecastSnapshots = updatedData;
        // Write the updated data back to disk
        await fs.writeFile(dataPath, JSON.stringify(appData, null, 2), 'utf8');
        console.log('Forecast snapshots saved successfully!');
    } catch (err) {
        console.error('Failed to save forecast snapshot data:', err);
    }
}

async function createForecastDefinitionSchema(tableElement, onDefinitionSave) {
    let gridData = {}
    gridData.targetElement = tableElement;
    gridData.tableHeader = 'Financial Forecast'
    gridData.onSave = onDefinitionSave;
    
    // Load the schema file from disk in an Electron app
    const fs = window.require('fs').promises; 
    const schemaPath = process.cwd() + '/assets/forecast-definition-grid.json';
    const dataPath = process.cwd() + '/assets/app-data.json';

    try {
        const schemaFile = await fs.readFile(schemaPath, 'utf8');
        gridData.schema = JSON.parse(schemaFile);

        const dataFile = await fs.readFile(dataPath, 'utf8');
        const initialData = JSON.parse(dataFile);
        gridData.data = initialData.forecastDefinitions;

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

async function createForecastSnapshotSchema(tableElement, onSnapshotSave) {
    let gridData = {}
    gridData.targetElement = tableElement;
    gridData.tableHeader = 'Forecast Snapshots'
    gridData.onSave = onSnapshotSave;
    
    // Load the schema file from disk in an Electron app
    const fs = window.require('fs').promises; 
    const schemaPath = process.cwd() + '/assets/forecast-snapshot-grid.json';
    const dataPath = process.cwd() + '/assets/app-data.json';

    try {
        const schemaFile = await fs.readFile(schemaPath, 'utf8');
        gridData.schema = JSON.parse(schemaFile);

        const dataFile = await fs.readFile(dataPath, 'utf8');
        const initialData = JSON.parse(dataFile);
        gridData.data = initialData.forecastSnapshots;

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

function loadTables(forecastDefinitionData, forecastSnapshotData){
    const definitionGrid =  new EditableGrid(forecastDefinitionData)
    definitionGrid.render()
    const snapshotGrid =  new EditableGrid(forecastSnapshotData)
    snapshotGrid.render()
}

loadGlobals();
const {forecastSnapshotTable, forecastDefinitionTable} = buildGridContainer();
const forecastDefinitionData = await createForecastDefinitionSchema(forecastDefinitionTable, onDefinitionSave)
const forecastSnapshotData = await createForecastSnapshotSchema(forecastSnapshotTable, onSnapshotSave)

loadTables(forecastDefinitionData, forecastSnapshotData);