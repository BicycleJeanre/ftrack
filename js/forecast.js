// This script manages the Financial Forecast page (/pages/forecast.html).
// It uses the EditableGrid module to render and manage the forecast table.

import { EditableGrid } from './editable-grid.js';
import { loadGlobals } from './global-app.js';

//Define Editable Grid Schema. 
//Create Editable Grid. 
// handle save/insert/delete
// handle delete



function buildGridContainer(){

    const forecastEl = getEl('panel-forecast');

    // Section 1: Forecast Version
    const versionHeader = document.createElement('div');
    versionHeader.className = 'bg-main bordered rounded shadow-lg pointer flex-between accordion-header'
    versionHeader.innerHTML = `<h2 class="text-main">Forecast Version</h2><span class="accordion-arrow">&#9662;</span>`;
    versionHeader.addEventListener('click', () => window.toggleAccordion('versionContent'));
    window.add(forecastEl, versionHeader);

    const versionContent = document.createElement('div');
    versionContent.id = 'versionContent';
    versionContent.className = 'bg-main rounded shadow-md accordion-content'
    versionContent.style.display = 'block';
    versionContent.style.padding = '18px 20px 20px 20px';
    versionContent.style.marginBottom = '20px';
    window.add(forecastEl, versionContent)

    const forecastVersionTable = document.createElement('div');
    forecastVersionTable.id = 'forecastVersionTable';
    window.add(versionContent, forecastVersionTable);

    // Section 2: Forecast Setup
    const setupHeader = document.createElement('div');
    setupHeader.className = 'bg-main bordered rounded shadow-lg pointer flex-between accordion-header'
    setupHeader.innerHTML = `<h2 class="text-main">Forecast Setup</h2><span class="accordion-arrow">&#9662;</span>`;
    setupHeader.addEventListener('click', () => window.toggleAccordion('setupContent'));
    window.add(forecastEl, setupHeader);

    const setupContent = document.createElement('div');
    setupContent.id = 'setupContent';
    setupContent.className = 'bg-main rounded shadow-md accordion-content'
    setupContent.style.display = 'block';
    setupContent.style.padding = '18px 20px 20px 20px';
    setupContent.style.marginBottom = '20px';
    window.add(forecastEl, setupContent)

    const forecastSetupTable = document.createElement('div');
    forecastSetupTable.id = 'forecastSetupTable';
    window.add(setupContent, forecastSetupTable);

    // Section 3: Forecast Results
    const resultsHeader = document.createElement('div');
    resultsHeader.className = 'bg-main bordered rounded shadow-lg pointer flex-between accordion-header'
    resultsHeader.innerHTML = `<h2 class="text-main">Forecast Results</h2><span class="accordion-arrow">&#9662;</span>`;
    resultsHeader.addEventListener('click', () => window.toggleAccordion('resultsContent'));
    window.add(forecastEl, resultsHeader);

    const resultsContent = document.createElement('div');
    resultsContent.id = 'resultsContent';
    resultsContent.className = 'bg-main rounded shadow-md accordion-content'
    resultsContent.style.display = 'block';
    resultsContent.style.padding = '18px 20px 20px 20px';
    window.add(forecastEl, resultsContent)

    const forecastResultsTable = document.createElement('div');
    forecastResultsTable.id = 'forecastResultsTable';
    window.add(resultsContent, forecastResultsTable);

    return {forecastVersionTable, forecastSetupTable, forecastResultsTable}
}

async function onVersionSave(updatedForecast) {
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
    } catch (err) {
        console.error('Failed to save forecast data:', err);
    }
}

async function onSetupSave(updatedSetup) {
    // updatedSetup: the new/changed forecast setup data to persist
    const fs = window.require('fs').promises;
    const dataPath = process.cwd() + '/assets/app-data.json';
    try {
        // Read the current data file
        const dataFile = await fs.readFile(dataPath, 'utf8');
        let appData = JSON.parse(dataFile);
        // Only update the forecast setup property with the new data
        appData.forecastSetup = updatedSetup;
        // Write the updated data back to disk
        await fs.writeFile(dataPath, JSON.stringify(appData, null, 2), 'utf8');
        console.log('Forecast setup saved successfully!');
    } catch (err) {
        console.error('Failed to save forecast setup data:', err);
    }
}

async function onResultsSave(updatedData) {
    // updatedData: the new/changed forecast results data to persist
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
        console.log('Forecast results saved successfully!');
    } catch (err) {
        console.error('Failed to save forecast results data:', err);
    }
}

async function createForecastVersionSchema(tableElement, onVersionSave) {
    let gridData = {}
    gridData.targetElement = tableElement;
    gridData.tableHeader = 'Forecast Version'
    gridData.onSave = onVersionSave;
    
    // Load the schema file from disk in an Electron app
    const fs = window.require('fs').promises; 
    const schemaPath = process.cwd() + '/assets/forecast-template-grid.json';
    const dataPath = process.cwd() + '/assets/app-data.json';

    try {
        const schemaFile = await fs.readFile(schemaPath, 'utf8');
        gridData.schema = JSON.parse(schemaFile);

        const dataFile = await fs.readFile(dataPath, 'utf8');
        const initialData = JSON.parse(dataFile);
        gridData.data = initialData.forecastDefinitions;

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

async function createForecastSetupSchema(tableElement, onSetupSave) {
    let gridData = {}
    gridData.targetElement = tableElement;
    gridData.tableHeader = 'Forecast Setup'
    gridData.onSave = onSetupSave;
    
    // Load the schema file from disk in an Electron app
    const fs = window.require('fs').promises; 
    const schemaPath = process.cwd() + '/assets/forecast-setup-grid.json';
    const dataPath = process.cwd() + '/assets/app-data.json';

    try {
        const schemaFile = await fs.readFile(schemaPath, 'utf8');
        gridData.schema = JSON.parse(schemaFile);

        const dataFile = await fs.readFile(dataPath, 'utf8');
        const initialData = JSON.parse(dataFile);
        // TODO: Create forecastSetup data structure in app-data.json
        gridData.data = initialData.forecastSetup || [];

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

async function createForecastResultsSchema(tableElement, onResultsSave) {
    let gridData = {}
    gridData.targetElement = tableElement;
    gridData.tableHeader = 'Forecast Results'
    gridData.onSave = onResultsSave;
    
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

function loadTables(forecastVersionData, forecastSetupData, forecastResultsData){
    forecastVersionData.showActions = false; // Hide actions column - use keyboard shortcuts instead
    const versionGrid =  new EditableGrid(forecastVersionData)
    versionGrid.render()
    
    forecastSetupData.showActions = false; // Hide actions column - use keyboard shortcuts instead
    const setupGrid =  new EditableGrid(forecastSetupData)
    setupGrid.render()
    
    forecastResultsData.showActions = false; // Hide actions column - use keyboard shortcuts instead
    const resultsGrid =  new EditableGrid(forecastResultsData)
    resultsGrid.render()
}

loadGlobals();
const {forecastVersionTable, forecastSetupTable, forecastResultsTable} = buildGridContainer();
const forecastVersionData = await createForecastVersionSchema(forecastVersionTable, onVersionSave)
const forecastSetupData = await createForecastSetupSchema(forecastSetupTable, onSetupSave)
const forecastResultsData = await createForecastResultsSchema(forecastResultsTable, onResultsSave)
loadTables(forecastVersionData, forecastSetupData, forecastResultsData)