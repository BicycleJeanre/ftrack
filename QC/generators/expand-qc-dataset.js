#!/usr/bin/env node

/**
 * Expand QC Dataset Generator
 * Generates QC scenarios for all scenario types and updates QC files
 * Usage: node QC/generators/expand-qc-dataset.js
 */

const fs = require('fs');
const path = require('path');
const { createScenarioForType, createExpectedOutputsForScenario } = require('./scenario-generator');

const QC_DATA_PATH = path.join(__dirname, '../ftrack-qc-data.json');
const EXPECTED_PATH = path.join(__dirname, '../expected-outputs.json');
const LOOKUP_PATH = path.join(__dirname, '../../assets/lookup-data.json');

// Load current data
const qcData = JSON.parse(fs.readFileSync(QC_DATA_PATH, 'utf8'));
const expectedOutputs = JSON.parse(fs.readFileSync(EXPECTED_PATH, 'utf8'));
const lookupData = JSON.parse(fs.readFileSync(LOOKUP_PATH, 'utf8'));

console.log('🧩 Expanding QC dataset with all scenario types...\n');

// Determine next scenario ID
const existingIds = qcData.scenarios.map(s => s.id);
const maxId = Math.max(...existingIds);
let nextId = maxId + 1;

// Generate scenarios for each scenario type (except General which already exists)
const scenarioTypesToAdd = [1, 3, 4, 5, 6]; // Budget, Funds, Debt Repayment, Goal-Based, Advanced Goal Solver

const newScenarios = [];
const newExpectedOutputs = [];

scenarioTypesToAdd.forEach((typeId, idx) => {
  try {
    const scenario = createScenarioForType(typeId, nextId + idx);
    const expectedOutput = createExpectedOutputsForScenario(scenario);
    
    newScenarios.push(scenario);
    newExpectedOutputs.push(expectedOutput);
    
    const typeName = lookupData.scenarioTypes.find(st => st.id === typeId).name;
    console.log(`✓ Generated QC scenario for ${typeName} (ID: ${scenario.id})`);
  } catch (err) {
    console.error(`✗ Error generating scenario for type ${typeId}: ${err.message}`);
  }
});

// Update QC data
qcData.scenarios = [...qcData.scenarios, ...newScenarios];
fs.writeFileSync(QC_DATA_PATH, JSON.stringify(qcData, null, 2));
console.log(`\n✓ Updated ${QC_DATA_PATH} with ${newScenarios.length} new scenarios`);

// Update expected outputs
expectedOutputs.scenarios = [...expectedOutputs.scenarios, ...newExpectedOutputs];
expectedOutputs.version = '1.2.0';
expectedOutputs.description = 'Golden expected outputs for QC dataset validation. Includes scenarios for all 6 scenario types.';
fs.writeFileSync(EXPECTED_PATH, JSON.stringify(expectedOutputs, null, 2));
console.log(`✓ Updated ${EXPECTED_PATH} with expected outputs (version ${expectedOutputs.version})`);

console.log(`\n📊 Summary:`);
console.log(`  Total scenarios: ${qcData.scenarios.length}`);
console.log(`  Scenario types covered: ${qcData.scenarios.map(s => s.type.name).join(', ')}`);
console.log(`\n✨ QC dataset expansion complete!`);
