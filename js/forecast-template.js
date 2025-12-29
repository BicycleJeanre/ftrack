// This script manages the Forecast Template page (/pages/forecast-template.html).
// It uses the EditableGrid module to render and manage the forecast template table.

import { EditableGrid } from './editable-grid.js';
import { loadGlobals } from './global-app.js';

function buildGridContainer(){

    const forecastTemplateEl = getEl('panel-forecast-template');

    //create header with foldable content    
    const panelHeader = document.createElement('div');
    panelHeader.className = 'bg-main bordered rounded shadow-lg pointer flex-between accordion-header'
    panelHeader.innerHTML = `<h2 class="text-main">Forecast Templates</h2><span class="accordion-arrow">&#9662;</span>`;
    panelHeader.addEventListener('click', () => window.toggleAccordion('content'));
    window.add(forecastTemplateEl, panelHeader);

    //foldable content
    const content = document.createElement('div');
    content.id = 'content';
    content.className = 'bg-main rounded shadow-md accordion-content'
    content.style.display = 'block';
    content.style.padding = '18px 20px 20px 20px';
    window.add(forecastTemplateEl, content)

    //create forecast template table section
    const table = document.createElement('div');
    table.id = 'forecastTemplateTable';
    window.add(content, table);

    return table;
}

async function onSave(updatedTemplates) {
    // updatedTemplates: the new/changed forecast template data to persist
    const fs = window.require('fs').promises;
    const dataPath = process.cwd() + '/assets/app-data.json';
    try {
        // Read the current data file
        const dataFile = await fs.readFile(dataPath, 'utf8');
        let appData = JSON.parse(dataFile);
        // Only update the forecastDefinitions property with the new data
        appData.forecastDefinitions = updatedTemplates;
        // Write the updated data back to disk
        await fs.writeFile(dataPath, JSON.stringify(appData, null, 2), 'utf8');
        console.log('Forecast templates saved successfully!');
    } catch (err) {
        console.error('Failed to save forecast template data:', err);
    }
}

async function createGridSchema(tableElement, onSave) {
    let gridData = {}
    gridData.targetElement = tableElement;
    gridData.tableHeader = 'Forecast Templates'
    gridData.onSave = onSave;
    
    // Load the schema file from disk in an Electron app
    const fs = window.require('fs').promises; // Use the promise-based fs module
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
        // Return null or an empty structure if files can't be loaded
        return null; 
    }

    return gridData
}

function loadTable(tableData){
    tableData.showActions = false; // Hide actions column - use keyboard shortcuts instead
    const grid =  new EditableGrid(tableData)
    grid.render()
}

loadGlobals();
const table = buildGridContainer();
const tableData = await createGridSchema(table, onSave)
loadTable(tableData);
