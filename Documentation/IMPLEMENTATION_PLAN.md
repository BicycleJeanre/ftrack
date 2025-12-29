# Budget & Forecast System - Implementation Plan
**Date**: December 29, 2025  
**For**: GitHub Copilot Coding Agent  
**Reference**: See `COMPLETE_FORECAST_DESIGN.md` for full specification

---

## Overview

Implement a universal budget/forecast/projection system with:
- Scenario-based planning with account/transaction overrides
- Double-entry bookkeeping (debits = credits)
- Primary account filtering UI
- Manual projection generation with interest/growth calculations
- Recurrence patterns for recurring transactions

---

## Implementation Phases

### Phase 1: Schema Updates & File Renames ⏱️ 2 hours

**Objective**: Rename files and update schemas to new terminology

#### Tasks:

**1.1. Rename Schema Files**
- `assets/forecast-template-grid.json` → `assets/scenario-grid.json`
- `assets/forecast-setup-grid.json` → `assets/planned-transactions-grid.json`
- `assets/forecast-snapshot-grid.json` → `assets/projections-grid.json`

**1.2. Update scenario-grid.json**
```json
{
  "columns": [
    {"field": "id", "header": "ID", "type": "number", "editable": false, "display": false},
    {"field": "name", "header": "Scenario Name", "type": "text", "editable": true, "display": true},
    {"field": "type", "header": "Type", "type": "select", "optionsSource": "scenarioTypes", "editable": true, "display": true},
    {"field": "description", "header": "Description", "type": "textarea", "editable": true, "display": true},
    {"field": "startDate", "header": "Start Date", "type": "date", "editable": true, "display": true},
    {"field": "endDate", "header": "End Date", "type": "date", "editable": true, "display": true},
    {"field": "projectionPeriod", "header": "Period Type", "type": "select", "optionsSource": "periodTypes", "editable": true, "display": true},
    {"field": "accounts", "header": "Accounts", "type": "multiselect", "optionsSource": "accounts", "editable": true, "display": true},
    {"field": "accountOverrides", "header": "Account Overrides", "type": "json", "editable": false, "display": false, "default": []},
    {"field": "transactionOverrides", "header": "Transaction Overrides", "type": "json", "editable": false, "display": false, "default": []},
    {"field": "createdDate", "header": "Created", "type": "date", "editable": false, "display": true},
    {"field": "lastCalculated", "header": "Last Calculated", "type": "datetime", "editable": false, "display": true},
    {"field": "tags", "header": "Tags", "type": "tags", "editable": true, "display": true, "default": []}
  ],
  "options": {
    "scenarioTypes": [
      {"id": 1, "name": "Budget"},
      {"id": 2, "name": "Loan Payoff"},
      {"id": 3, "name": "Investment Growth"},
      {"id": 4, "name": "General"}
    ],
    "periodTypes": [
      {"id": 1, "name": "Day"},
      {"id": 2, "name": "Week"},
      {"id": 3, "name": "Month"},
      {"id": 4, "name": "Quarter"},
      {"id": 5, "name": "Year"}
    ]
  }
}
```

**1.3. Update planned-transactions-grid.json**
```json
{
  "columns": [
    {"field": "id", "header": "ID", "type": "number", "editable": false, "display": false},
    {"field": "scenarioId", "header": "Scenario ID", "type": "number", "editable": false, "display": false},
    {"field": "transactionTemplateId", "header": "Template ID", "type": "number", "editable": false, "display": false},
    {"field": "description", "header": "Description", "type": "text", "editable": true, "display": true},
    {"field": "fromAccount", "header": "From Account (Debit)", "type": "addSelect", "optionsSource": "accounts", "editable": true, "display": true},
    {"field": "toAccount", "header": "To Account (Credit)", "type": "addSelect", "optionsSource": "accounts", "editable": true, "display": true},
    {"field": "amount", "header": "Amount", "type": "currency", "editable": true, "display": true},
    {"field": "recurrence", "header": "Recurrence", "type": "modal", "editable": true, "display": true, "modalSchema": {
      "columns": [
        {"field": "type", "header": "Type", "type": "select", "optionsSource": "recurrenceTypes", "default": "one-time"},
        {"field": "frequency", "header": "Frequency", "type": "select", "optionsSource": "recurrenceFrequencies", "default": "Monthly"},
        {"field": "interval", "header": "Every X periods", "type": "number", "default": 1},
        {"field": "startDate", "header": "Start Date", "type": "date"},
        {"field": "endDate", "header": "End Date", "type": "date"},
        {"field": "dayOfMonth", "header": "Day of Month", "type": "number"},
        {"field": "dayOfWeek", "header": "Day of Week", "type": "select", "optionsSource": "daysOfWeek"},
        {"field": "monthOfYear", "header": "Month of Year", "type": "select", "optionsSource": "monthsOfYear"}
      ]
    }},
    {"field": "enabled", "header": "Enabled", "type": "checkbox", "editable": true, "display": true, "default": true},
    {"field": "category", "header": "Category", "type": "text", "editable": false, "display": true},
    {"field": "tags", "header": "Tags", "type": "tags", "editable": true, "display": true, "default": []}
  ],
  "options": {
    "recurrenceTypes": [
      {"id": 1, "name": "one-time"},
      {"id": 2, "name": "recurring"}
    ],
    "recurrenceFrequencies": [
      {"id": 1, "name": "Daily"},
      {"id": 2, "name": "Weekly"},
      {"id": 3, "name": "Biweekly"},
      {"id": 4, "name": "Monthly"},
      {"id": 5, "name": "Quarterly"},
      {"id": 6, "name": "Yearly"}
    ],
    "daysOfWeek": [
      {"id": 1, "name": "Monday"},
      {"id": 2, "name": "Tuesday"},
      {"id": 3, "name": "Wednesday"},
      {"id": 4, "name": "Thursday"},
      {"id": 5, "name": "Friday"},
      {"id": 6, "name": "Saturday"},
      {"id": 7, "name": "Sunday"}
    ],
    "monthsOfYear": [
      {"id": 1, "name": "January"},
      {"id": 2, "name": "February"},
      {"id": 3, "name": "March"},
      {"id": 4, "name": "April"},
      {"id": 5, "name": "May"},
      {"id": 6, "name": "June"},
      {"id": 7, "name": "July"},
      {"id": 8, "name": "August"},
      {"id": 9, "name": "September"},
      {"id": 10, "name": "October"},
      {"id": 11, "name": "November"},
      {"id": 12, "name": "December"}
    ]
  }
}
```

**1.4. Update projections-grid.json**
```json
{
  "columns": [
    {"field": "id", "header": "ID", "type": "number", "editable": false, "display": false},
    {"field": "scenarioId", "header": "Scenario ID", "type": "number", "editable": false, "display": false},
    {"field": "accountId", "header": "Account ID", "type": "number", "editable": false, "display": false},
    {"field": "accountName", "header": "Account", "type": "text", "editable": false, "display": true},
    {"field": "isPrimary", "header": "Primary", "type": "boolean", "editable": false, "display": true},
    {"field": "period", "header": "Period End", "type": "date", "editable": false, "display": true},
    {"field": "periodLabel", "header": "Period", "type": "text", "editable": false, "display": true},
    {"field": "periodType", "header": "Period Type", "type": "text", "editable": false, "display": false},
    {"field": "openingBalance", "header": "Opening Balance", "type": "currency", "editable": false, "display": true},
    {"field": "totalDebits", "header": "Debits", "type": "currency", "editable": false, "display": true},
    {"field": "totalCredits", "header": "Credits", "type": "currency", "editable": false, "display": true},
    {"field": "netTransactions", "header": "Net Transactions", "type": "currency", "editable": false, "display": true},
    {"field": "interestEarned", "header": "Interest", "type": "currency", "editable": false, "display": true},
    {"field": "growthAmount", "header": "Growth", "type": "currency", "editable": false, "display": true},
    {"field": "netChange", "header": "Net Change", "type": "currency", "editable": false, "display": true},
    {"field": "projectedBalance", "header": "Projected Balance", "type": "currency", "editable": false, "display": true},
    {"field": "transactionCount", "header": "Tx Count", "type": "number", "editable": false, "display": true},
    {"field": "calculatedAt", "header": "Calculated", "type": "datetime", "editable": false, "display": false}
  ]
}
```

**1.5. Update accounts-grid.json (add interest/growth fields)**

Add these columns to existing accounts schema:
```json
{
  "field": "interest",
  "header": "Interest",
  "type": "modal",
  "editable": true,
  "display": true,
  "modalSchema": {
    "columns": [
      {"field": "enabled", "header": "Enable Interest", "type": "checkbox", "default": false},
      {"field": "rate", "header": "Annual Rate (%)", "type": "number", "default": 0},
      {"field": "compounding", "header": "Compounding", "type": "select", "optionsSource": "compoundingFrequencies", "default": "Monthly"},
      {"field": "calculationType", "header": "Calculation Type", "type": "select", "optionsSource": "calculationTypes", "default": "Compound"}
    ]
  },
  "default": null
},
{
  "field": "growth",
  "header": "Growth",
  "type": "modal",
  "editable": true,
  "display": true,
  "modalSchema": {
    "columns": [
      {"field": "enabled", "header": "Enable Growth", "type": "checkbox", "default": false},
      {"field": "rate", "header": "Annual Rate (%)", "type": "number", "default": 0},
      {"field": "type", "header": "Growth Type", "type": "select", "optionsSource": "growthTypes", "default": "Compound-Annual"}
    ]
  },
  "default": null
}
```

Add option lists to accounts-grid.json:
```json
"options": {
  "compoundingFrequencies": [
    {"id": 1, "name": "Daily"},
    {"id": 2, "name": "Weekly"},
    {"id": 3, "name": "Monthly"},
    {"id": 4, "name": "Quarterly"},
    {"id": 5, "name": "Annually"}
  ],
  "calculationTypes": [
    {"id": 1, "name": "Simple"},
    {"id": 2, "name": "Compound"}
  ],
  "growthTypes": [
    {"id": 1, "name": "Linear"},
    {"id": 2, "name": "Compound-Annual"}
  ]
}
```

**Acceptance Criteria**:
- ✅ All 3 schema files renamed
- ✅ New schemas have all required fields
- ✅ Accounts schema includes interest/growth fields
- ✅ All option lists defined
- ✅ No references to old names remain in schemas

---

### Phase 2: Data Migration ⏱️ 1 hour

**Objective**: Migrate app-data.json to new structure

#### Tasks:

**2.1. Update app-data.json structure**

Current structure:
```json
{
  "accounts": [...],
  "transactions": [...],
  "forecastDefinitions": [...],
  "forecastSetup": [...],
  "forecastSnapshots": [...]
}
```

New structure:
```json
{
  "accounts": [...],
  "transactions": [...],
  "scenarios": [...],
  "plannedTransactions": [...],
  "projections": []
}
```

**2.2. Migrate existing forecast data**

Transform `forecastDefinitions` → `scenarios`:
- Rename `accounts` field to `accounts` array with isPrimary flag
- Add `accountOverrides: []`
- Add `transactionOverrides: []`
- Add `type: "Budget"`
- Add `projectionPeriod` from periodType.name
- Add `createdDate`, `lastCalculated: null`

Transform `forecastSetup` → `plannedTransactions`:
- Rename `versionId` → `scenarioId`
- Add `transactionTemplateId: null` (no existing links)
- Add `recurrence` object from existing data
- Add `enabled: true`
- Add `category` auto-detected from accounts

Keep `forecastSnapshots` → `projections` (rename only)

**2.3. Add default values to existing accounts**

For each account without interest/growth:
```json
{
  "interest": null,
  "growth": null
}
```

**Acceptance Criteria**:
- ✅ app-data.json has new structure
- ✅ Existing data migrated without loss
- ✅ All scenarios have required new fields
- ✅ All accounts have interest/growth fields (null if not set)
- ✅ Backwards compatibility maintained (old data transformed)

---

### Phase 3: Data Manager Updates ⏱️ 2 hours

**Objective**: Update DataManager with new methods and logic

#### Tasks:

**3.1. Add scenario methods to data-manager.js**

```javascript
// Scenarios
async saveScenarios(scenarios) {
  await this.loadData();
  this.cachedData.scenarios = scenarios;
  await this.saveData();
}

getScenario(scenarioId) {
  return this.cachedData.scenarios?.find(s => s.id === scenarioId);
}

async cloneScenario(scenarioId, newName) {
  await this.loadData();
  const original = this.getScenario(scenarioId);
  if (!original) throw new Error(`Scenario ${scenarioId} not found`);
  
  const clone = {
    ...original,
    id: this.getNextId('scenarios'),
    name: newName,
    createdDate: new Date().toISOString(),
    lastCalculated: null
  };
  
  this.cachedData.scenarios.push(clone);
  
  // Clone planned transactions
  const plannedTxs = this.cachedData.plannedTransactions.filter(
    pt => pt.scenarioId === scenarioId
  );
  for (const pt of plannedTxs) {
    this.cachedData.plannedTransactions.push({
      ...pt,
      id: this.getNextId('plannedTransactions'),
      scenarioId: clone.id
    });
  }
  
  await this.saveData();
  return clone;
}
```

**3.2. Add planned transaction methods**

```javascript
async savePlannedTransactions(plannedTransactions, scenarioId) {
  await this.loadData();
  
  for (const plannedTx of plannedTransactions) {
    // Ensure scenarioId is set
    plannedTx.scenarioId = scenarioId;
    
    // Check if this is a new planned transaction (null id)
    if (!plannedTx.id) {
      plannedTx.id = this.getNextId('plannedTransactions');
      
      // If transactionTemplateId not set, create base transaction
      if (!plannedTx.transactionTemplateId && plannedTx.description) {
        const newTransactionId = this.getNextId('transactions');
        plannedTx.transactionTemplateId = newTransactionId;
        
        // Create simple base transaction
        const baseTransaction = {
          id: newTransactionId,
          description: plannedTx.description,
          debit_account: plannedTx.fromAccount,
          credit_account: plannedTx.toAccount,
          amount: plannedTx.amount,
          date: plannedTx.recurrence?.startDate || new Date().toISOString(),
          isRecurring: plannedTx.recurrence?.type === 'recurring'
        };
        this.cachedData.transactions.push(baseTransaction);
      }
    }
    
    // Auto-create accounts from addSelect fields
    if (plannedTx.fromAccount?.id === null) {
      const schema = await this._loadSchema('accounts-grid.json');
      plannedTx.fromAccount = await this._createAccountFromSchema(
        this.getNextId('accounts'),
        plannedTx.fromAccount.name,
        schema.columns,
        schema
      );
    }
    if (plannedTx.toAccount?.id === null) {
      const schema = await this._loadSchema('accounts-grid.json');
      plannedTx.toAccount = await this._createAccountFromSchema(
        this.getNextId('accounts'),
        plannedTx.toAccount.name,
        schema.columns,
        schema
      );
    }
  }
  
  // Remove old planned transactions for this scenario
  this.cachedData.plannedTransactions = this.cachedData.plannedTransactions.filter(
    pt => pt.scenarioId !== scenarioId
  );
  
  // Add updated planned transactions
  this.cachedData.plannedTransactions.push(...plannedTransactions);
  
  await this.saveData();
}

getPlannedTransactions(scenarioId) {
  return this.cachedData.plannedTransactions?.filter(
    pt => pt.scenarioId === scenarioId
  ) || [];
}
```

**3.3. Add projection methods**

```javascript
async saveProjections(projections, scenarioId) {
  await this.loadData();
  
  // Remove old projections for this scenario
  this.cachedData.projections = this.cachedData.projections.filter(
    p => p.scenarioId !== scenarioId
  );
  
  // Add new projections
  this.cachedData.projections.push(...projections);
  
  // Update scenario lastCalculated timestamp
  const scenario = this.cachedData.scenarios.find(s => s.id === scenarioId);
  if (scenario) {
    scenario.lastCalculated = new Date().toISOString();
  }
  
  await this.saveData();
}

getProjections(scenarioId, accountId = null) {
  const projections = this.cachedData.projections?.filter(
    p => p.scenarioId === scenarioId
  ) || [];
  
  if (accountId) {
    return projections.filter(p => p.accountId === accountId);
  }
  
  return projections;
}

async clearProjections(scenarioId) {
  await this.loadData();
  this.cachedData.projections = this.cachedData.projections.filter(
    p => p.scenarioId !== scenarioId
  );
  await this.saveData();
}
```

**3.4. Update getNextId to support new entity types**

```javascript
getNextId(entityType) {
  const entities = this.cachedData[entityType] || [];
  if (entities.length === 0) return 1;
  return Math.max(...entities.map(e => e.id)) + 1;
}
```

**Acceptance Criteria**:
- ✅ All new methods added to DataManager
- ✅ Scenario CRUD operations work
- ✅ Clone scenario copies data correctly
- ✅ Planned transactions auto-create base transactions
- ✅ Planned transactions auto-create accounts from addSelect
- ✅ Projections can be saved, retrieved, cleared
- ✅ lastCalculated timestamp updates correctly

---

### Phase 4: UI Updates (forecast.js) ⏱️ 3 hours

**Objective**: Update forecast page with new terminology and primary account filtering

#### Tasks:

**4.1. Update forecast.js imports and initialization**

```javascript
import { dataManager } from './data-manager.js';
import { EditableGrid } from './editable-grid.js';
import { setupNavigation } from './navbar.js';

let scenarioGrid;
let plannedTransactionsGrid;
let projectionsGrid;
let activeScenarioId = null;
let activePrimaryAccountId = null;
```

**4.2. Update buildGridContainer for 3 sections**

```javascript
function buildGridContainer() {
  const container = document.getElementById('grid-container');
  container.innerHTML = `
    <div class="forecast-sections">
      <!-- Section 1: Scenarios -->
      <div class="section">
        <div class="section-header" id="scenarioHeader">
          <h2>Scenarios</h2>
          <button id="generateProjectionBtn" class="btn-primary" disabled>
            Generate Projection
          </button>
        </div>
        <div class="section-content" id="scenarioContent">
          <div id="scenarioTableDiv"></div>
        </div>
      </div>
      
      <!-- Section 2: Planned Transactions -->
      <div class="section">
        <div class="section-header" id="plannedTxHeader">
          <h2>Planned Transactions</h2>
          <div class="filter-controls">
            <label>Primary Account:</label>
            <select id="primaryAccountFilter" disabled>
              <option value="">Select scenario first...</option>
            </select>
          </div>
        </div>
        <div class="section-content" id="plannedTxContent">
          <div id="plannedTxTableDiv"></div>
        </div>
      </div>
      
      <!-- Section 3: Projections -->
      <div class="section">
        <div class="section-header" id="projectionsHeader">
          <h2>Projections</h2>
          <div class="filter-info">
            <span id="projectionInfo">No projections generated</span>
          </div>
        </div>
        <div class="section-content" id="projectionsContent">
          <div id="projectionsTableDiv"></div>
        </div>
      </div>
    </div>
  `;
  
  // Add event listeners
  document.getElementById('generateProjectionBtn').addEventListener('click', generateProjection);
  document.getElementById('primaryAccountFilter').addEventListener('change', onPrimaryAccountFilterChange);
}
```

**4.3. Initialize grids with new schemas**

```javascript
async function initializeGrids() {
  const scenarioSchema = await window.electron.loadSchema('scenario-grid.json');
  const plannedTxSchema = await window.electron.loadSchema('planned-transactions-grid.json');
  const projectionsSchema = await window.electron.loadSchema('projections-grid.json');
  
  // Scenario grid
  scenarioGrid = new EditableGrid('scenarioTableDiv', scenarioSchema, {
    onSave: onScenarioSave,
    onRowSelect: onScenarioSelect,
    onDelete: onScenarioDelete
  });
  
  // Planned transactions grid
  plannedTransactionsGrid = new EditableGrid('plannedTxTableDiv', plannedTxSchema, {
    onSave: onPlannedTransactionsSave,
    onDelete: onPlannedTransactionsDelete
  });
  
  // Projections grid (read-only)
  projectionsGrid = new EditableGrid('projectionsTableDiv', projectionsSchema, {
    readOnly: true
  });
  
  // Load initial data
  await loadData();
}
```

**4.4. Implement scenario selection logic**

```javascript
async function onScenarioSelect(scenario) {
  activeScenarioId = scenario.id;
  
  // Enable controls
  document.getElementById('generateProjectionBtn').disabled = false;
  document.getElementById('primaryAccountFilter').disabled = false;
  
  // Populate primary account filter
  const accountFilter = document.getElementById('primaryAccountFilter');
  accountFilter.innerHTML = '<option value="">All accounts</option>';
  
  if (scenario.accounts && scenario.accounts.length > 0) {
    scenario.accounts.forEach(acc => {
      const option = document.createElement('option');
      option.value = acc.id;
      option.textContent = acc.name + (acc.isPrimary ? ' (Primary)' : '');
      accountFilter.appendChild(option);
    });
    
    // Auto-select primary account
    const primaryAccount = scenario.accounts.find(a => a.isPrimary);
    if (primaryAccount) {
      accountFilter.value = primaryAccount.id;
      activePrimaryAccountId = primaryAccount.id;
    }
  }
  
  // Load planned transactions and projections
  await loadPlannedTransactions();
  await loadProjections();
}
```

**4.5. Implement primary account filtering**

```javascript
async function onPrimaryAccountFilterChange(e) {
  activePrimaryAccountId = e.target.value ? parseInt(e.target.value) : null;
  await loadPlannedTransactions();
  await loadProjections();
}

async function loadPlannedTransactions() {
  if (!activeScenarioId) {
    plannedTransactionsGrid.loadData([]);
    return;
  }
  
  let plannedTxs = dataManager.getPlannedTransactions(activeScenarioId);
  
  // Filter by primary account if selected
  if (activePrimaryAccountId) {
    plannedTxs = plannedTxs.filter(pt => 
      pt.fromAccount.id === activePrimaryAccountId || 
      pt.toAccount.id === activePrimaryAccountId
    );
  }
  
  plannedTransactionsGrid.loadData(plannedTxs);
}

async function loadProjections() {
  if (!activeScenarioId) {
    projectionsGrid.loadData([]);
    document.getElementById('projectionInfo').textContent = 'No projections generated';
    return;
  }
  
  let projections = dataManager.getProjections(activeScenarioId);
  
  // Filter by primary account and related accounts if selected
  if (activePrimaryAccountId) {
    // Get all accounts involved in transactions with primary account
    const plannedTxs = dataManager.getPlannedTransactions(activeScenarioId);
    const relatedAccountIds = new Set([activePrimaryAccountId]);
    
    plannedTxs.forEach(pt => {
      if (pt.fromAccount.id === activePrimaryAccountId) {
        relatedAccountIds.add(pt.toAccount.id);
      }
      if (pt.toAccount.id === activePrimaryAccountId) {
        relatedAccountIds.add(pt.fromAccount.id);
      }
    });
    
    projections = projections.filter(p => relatedAccountIds.has(p.accountId));
  }
  
  projectionsGrid.loadData(projections);
  
  if (projections.length > 0) {
    const scenario = dataManager.getScenario(activeScenarioId);
    const lastCalc = scenario?.lastCalculated 
      ? new Date(scenario.lastCalculated).toLocaleString()
      : 'Unknown';
    document.getElementById('projectionInfo').textContent = 
      `${projections.length} projections | Last calculated: ${lastCalc}`;
  } else {
    document.getElementById('projectionInfo').textContent = 'No projections generated';
  }
}
```

**4.6. Implement save handlers**

```javascript
async function onScenarioSave(updatedScenarios) {
  await dataManager.saveScenarios(updatedScenarios);
  // Reload if active scenario was modified
  if (activeScenarioId) {
    const scenario = dataManager.getScenario(activeScenarioId);
    if (scenario) {
      await onScenarioSelect(scenario);
    }
  }
}

async function onPlannedTransactionsSave(updatedPlannedTxs) {
  await dataManager.savePlannedTransactions(updatedPlannedTxs, activeScenarioId);
  await loadPlannedTransactions();
}

async function onScenarioDelete(scenarioId) {
  // Clear projections for deleted scenario
  await dataManager.clearProjections(scenarioId);
  
  // Remove planned transactions for deleted scenario
  await dataManager.loadData();
  dataManager.cachedData.plannedTransactions = 
    dataManager.cachedData.plannedTransactions.filter(pt => pt.scenarioId !== scenarioId);
  await dataManager.saveData();
  
  // Clear active scenario
  if (activeScenarioId === scenarioId) {
    activeScenarioId = null;
    activePrimaryAccountId = null;
    document.getElementById('generateProjectionBtn').disabled = true;
    document.getElementById('primaryAccountFilter').disabled = true;
    await loadPlannedTransactions();
    await loadProjections();
  }
}

async function onPlannedTransactionsDelete(plannedTxId) {
  // Just reload - delete handled by grid
  await loadPlannedTransactions();
}
```

**Acceptance Criteria**:
- ✅ Forecast page shows 3 sections
- ✅ Scenario selection enables controls and loads data
- ✅ Primary account filter populated from scenario accounts
- ✅ Planned transactions filtered by primary account
- ✅ Projections show primary + related secondary accounts
- ✅ Visual distinction between primary and secondary accounts
- ✅ Save handlers use dataManager methods
- ✅ Delete scenario cascades to planned transactions and projections

---

### Phase 5: Projection Engine ⏱️ 4 hours

**Objective**: Implement projection generation with interest/growth calculations

#### Tasks:

**5.1. Create projection-engine.js module**

```javascript
// js/projection-engine.js

export class ProjectionEngine {
  constructor(dataManager) {
    this.dataManager = dataManager;
  }
  
  async generateProjections(scenarioId) {
    const scenario = this.dataManager.getScenario(scenarioId);
    if (!scenario) throw new Error(`Scenario ${scenarioId} not found`);
    
    // 1. Calculate periods
    const periods = this.calculatePeriods(
      scenario.startDate,
      scenario.endDate,
      scenario.projectionPeriod
    );
    
    // 2. Get planned transactions
    const plannedTransactions = this.dataManager.getPlannedTransactions(scenarioId);
    
    // 3. Apply transaction overrides
    const effectivePlannedTxs = this.applyTransactionOverrides(
      plannedTransactions,
      scenario.transactionOverrides
    );
    
    // 4. Get accounts for scenario
    const allAccounts = this.dataManager.cachedData.accounts;
    const scenarioAccounts = scenario.accounts.map(sa => {
      const baseAccount = allAccounts.find(a => a.id === sa.id);
      return { ...baseAccount, isPrimary: sa.isPrimary };
    });
    
    // 5. Generate projections for each account
    const allProjections = [];
    for (const account of scenarioAccounts) {
      const accountProjections = this.projectAccount(
        account,
        scenario,
        effectivePlannedTxs,
        periods
      );
      allProjections.push(...accountProjections);
    }
    
    // 6. Validate double-entry (debits = credits)
    this.validateDoubleEntry(allProjections, periods);
    
    // 7. Save projections
    await this.dataManager.saveProjections(allProjections, scenarioId);
    
    return allProjections;
  }
  
  calculatePeriods(startDate, endDate, periodType) {
    const periods = [];
    let currentDate = new Date(startDate);
    const end = new Date(endDate);
    
    while (currentDate <= end) {
      const periodEnd = this.addPeriod(new Date(currentDate), periodType);
      const periodStart = new Date(currentDate);
      
      periods.push({
        startDate: periodStart,
        endDate: periodEnd < end ? periodEnd : end,
        label: this.formatPeriodLabel(periodStart, periodType),
        days: this.daysBetween(periodStart, periodEnd < end ? periodEnd : end)
      });
      
      currentDate = new Date(periodEnd);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return periods;
  }
  
  addPeriod(date, periodType) {
    const result = new Date(date);
    switch (periodType) {
      case 'Day':
        result.setDate(result.getDate() + 1);
        break;
      case 'Week':
        result.setDate(result.getDate() + 7);
        break;
      case 'Month':
        result.setMonth(result.getMonth() + 1);
        break;
      case 'Quarter':
        result.setMonth(result.getMonth() + 3);
        break;
      case 'Year':
        result.setFullYear(result.getFullYear() + 1);
        break;
    }
    result.setDate(result.getDate() - 1); // Last day of period
    return result;
  }
  
  formatPeriodLabel(date, periodType) {
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();
    
    switch (periodType) {
      case 'Day':
        return date.toLocaleDateString();
      case 'Week':
        return `Week of ${date.toLocaleDateString()}`;
      case 'Month':
        return `${month} ${year}`;
      case 'Quarter':
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        return `Q${quarter} ${year}`;
      case 'Year':
        return `${year}`;
      default:
        return date.toLocaleDateString();
    }
  }
  
  daysBetween(start, end) {
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.ceil((end - start) / msPerDay) + 1;
  }
  
  applyTransactionOverrides(plannedTransactions, overrides) {
    if (!overrides || overrides.length === 0) return plannedTransactions;
    
    return plannedTransactions.map(pt => {
      const override = overrides.find(o => o.plannedTransactionId === pt.id);
      if (!override) return pt;
      
      // Deep merge override onto planned transaction
      return {
        ...pt,
        ...override,
        recurrence: {
          ...pt.recurrence,
          ...(override.recurrence || {})
        }
      };
    });
  }
  
  projectAccount(account, scenario, plannedTransactions, periods) {
    const projections = [];
    
    // Get effective account parameters (with overrides)
    const effectiveParams = this.getEffectiveAccountParams(account, scenario);
    let currentBalance = effectiveParams.startingBalance ?? account.balance ?? 0;
    
    for (const period of periods) {
      // 1. Expand planned transactions for this period
      const periodTransactions = plannedTransactions
        .filter(pt => pt.enabled)
        .flatMap(pt => this.expandRecurrence(pt, period));
      
      // 2. Calculate debits and credits for this account
      const debits = periodTransactions
        .filter(tx => tx.fromAccount.id === account.id)
        .reduce((sum, tx) => sum + tx.amount, 0);
      
      const credits = periodTransactions
        .filter(tx => tx.toAccount.id === account.id)
        .reduce((sum, tx) => sum + tx.amount, 0);
      
      const netTransactions = credits - debits;
      
      // 3. Calculate interest
      let interest = 0;
      if (effectiveParams.interest?.enabled) {
        interest = this.calculateInterest(
          currentBalance,
          effectiveParams.interest.rate,
          effectiveParams.interest.compounding,
          period.days
        );
      }
      
      // 4. Calculate growth
      let growth = 0;
      if (effectiveParams.growth?.enabled) {
        growth = this.calculateGrowth(
          currentBalance,
          effectiveParams.growth.rate,
          effectiveParams.growth.type,
          period.days
        );
      }
      
      // 5. Calculate projected balance
      const netChange = netTransactions + interest + growth;
      const projectedBalance = currentBalance + netChange;
      
      // 6. Create projection
      projections.push({
        id: null, // Will be assigned when saved
        scenarioId: scenario.id,
        accountId: account.id,
        accountName: effectiveParams.customLabel || account.name,
        isPrimary: account.isPrimary || false,
        period: period.endDate.toISOString().split('T')[0],
        periodLabel: period.label,
        periodType: scenario.projectionPeriod,
        openingBalance: currentBalance,
        totalDebits: debits,
        totalCredits: credits,
        netTransactions: netTransactions,
        interestEarned: interest,
        growthAmount: growth,
        netChange: netChange,
        projectedBalance: projectedBalance,
        transactionCount: periodTransactions.filter(tx => 
          tx.fromAccount.id === account.id || tx.toAccount.id === account.id
        ).length,
        calculatedAt: new Date().toISOString()
      });
      
      // 7. Carry forward
      currentBalance = projectedBalance;
    }
    
    return projections;
  }
  
  getEffectiveAccountParams(account, scenario) {
    const override = scenario.accountOverrides?.find(o => o.accountId === account.id);
    
    return {
      startingBalance: override?.startingBalance ?? account.balance,
      interest: override?.interest ?? account.interest,
      growth: override?.growth ?? account.growth,
      customLabel: override?.customLabel
    };
  }
  
  expandRecurrence(plannedTransaction, period) {
    const recurrence = plannedTransaction.recurrence;
    
    if (!recurrence || recurrence.type === 'one-time') {
      const txDate = new Date(recurrence?.startDate || new Date());
      if (txDate >= period.startDate && txDate <= period.endDate) {
        return [{
          date: txDate,
          amount: plannedTransaction.amount,
          fromAccount: plannedTransaction.fromAccount,
          toAccount: plannedTransaction.toAccount,
          description: plannedTransaction.description
        }];
      }
      return [];
    }
    
    // Recurring transactions
    const instances = [];
    const startDate = new Date(recurrence.startDate);
    const endDate = recurrence.endDate ? new Date(recurrence.endDate) : period.endDate;
    
    let currentDate = new Date(startDate);
    while (currentDate <= period.endDate && currentDate <= endDate) {
      if (currentDate >= period.startDate) {
        instances.push({
          date: new Date(currentDate),
          amount: plannedTransaction.amount,
          fromAccount: plannedTransaction.fromAccount,
          toAccount: plannedTransaction.toAccount,
          description: plannedTransaction.description
        });
      }
      
      // Advance to next occurrence
      currentDate = this.nextOccurrence(currentDate, recurrence);
    }
    
    return instances;
  }
  
  nextOccurrence(date, recurrence) {
    const next = new Date(date);
    const interval = recurrence.interval || 1;
    
    switch (recurrence.frequency) {
      case 'Daily':
        next.setDate(next.getDate() + interval);
        break;
      case 'Weekly':
        next.setDate(next.getDate() + (7 * interval));
        break;
      case 'Biweekly':
        next.setDate(next.getDate() + 14);
        break;
      case 'Monthly':
        next.setMonth(next.getMonth() + interval);
        if (recurrence.dayOfMonth) {
          next.setDate(recurrence.dayOfMonth);
        }
        break;
      case 'Quarterly':
        next.setMonth(next.getMonth() + (3 * interval));
        break;
      case 'Yearly':
        next.setFullYear(next.getFullYear() + interval);
        if (recurrence.monthOfYear) {
          next.setMonth(recurrence.monthOfYear - 1);
        }
        if (recurrence.dayOfMonth) {
          next.setDate(recurrence.dayOfMonth);
        }
        break;
    }
    
    return next;
  }
  
  calculateInterest(principal, annualRate, compounding, days) {
    const rate = annualRate / 100;
    
    switch (compounding) {
      case 'Daily':
        return principal * Math.pow(1 + rate/365, days) - principal;
      case 'Weekly':
        const weeks = days / 7;
        return principal * Math.pow(1 + rate/52, weeks) - principal;
      case 'Monthly':
        const months = days / 30.44;
        return principal * Math.pow(1 + rate/12, months) - principal;
      case 'Quarterly':
        const quarters = days / 91.31;
        return principal * Math.pow(1 + rate/4, quarters) - principal;
      case 'Annually':
        const years = days / 365.25;
        return principal * Math.pow(1 + rate, years) - principal;
      default:
        return 0;
    }
  }
  
  calculateGrowth(principal, annualRate, type, days) {
    const rate = annualRate / 100;
    const years = days / 365.25;
    
    switch (type) {
      case 'Linear':
        return principal * rate * years;
      case 'Compound-Annual':
        return principal * Math.pow(1 + rate, years) - principal;
      default:
        return 0;
    }
  }
  
  validateDoubleEntry(projections, periods) {
    for (const period of periods) {
      const periodEnd = period.endDate.toISOString().split('T')[0];
      const periodProjections = projections.filter(p => p.period === periodEnd);
      
      const totalDebits = periodProjections.reduce((sum, p) => sum + p.totalDebits, 0);
      const totalCredits = periodProjections.reduce((sum, p) => sum + p.totalCredits, 0);
      
      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new Error(
          `Double-entry validation failed for ${period.label}: ` +
          `Debits=$${totalDebits.toFixed(2)}, Credits=$${totalCredits.toFixed(2)}`
        );
      }
    }
  }
}
```

**5.2. Integrate projection engine into forecast.js**

```javascript
import { ProjectionEngine } from './projection-engine.js';

let projectionEngine;

async function initialize() {
  // ... existing initialization
  projectionEngine = new ProjectionEngine(dataManager);
}

async function generateProjection() {
  if (!activeScenarioId) {
    alert('Please select a scenario first');
    return;
  }
  
  const btn = document.getElementById('generateProjectionBtn');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  
  try {
    await projectionEngine.generateProjections(activeScenarioId);
    await loadProjections();
    alert('Projection generated successfully!');
  } catch (error) {
    console.error('Projection generation failed:', error);
    alert(`Projection generation failed: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate Projection';
  }
}
```

**Acceptance Criteria**:
- ✅ ProjectionEngine module created
- ✅ Period calculation works for all period types
- ✅ Recurrence expansion generates correct instances
- ✅ Transaction overrides applied correctly
- ✅ Account overrides applied correctly
- ✅ Interest calculated correctly (all compounding types)
- ✅ Growth calculated correctly (linear and compound)
- ✅ Double-entry validation enforces debits = credits
- ✅ Generate button triggers projection generation
- ✅ Projections saved and displayed correctly

---

### Phase 6: Testing & Polish ⏱️ 2 hours

**Objective**: Test complete workflow and add polish

#### Tasks:

**6.1. Create test scenario**

Create a test scenario with:
- Name: "2026 Test Budget"
- Type: Budget
- Date range: 2026-01-01 to 2026-12-31
- Period: Month
- Primary account: Checking
- Secondary accounts: Savings, Income, Expenses

**6.2. Add test planned transactions**

- Salary: Income → Checking, $5000/month, 15th of month
- Rent: Checking → Rent Expense, $1500/month, 1st of month
- Savings: Checking → Savings, $500/month, 16th of month
- Groceries: Checking → Groceries, $800/month, varies

**6.3. Test account overrides**

Set Checking account override:
- Interest: 2.5% monthly compound (vs 0% base)
- Starting balance: $2500 (vs $2000 base)

**6.4. Test transaction overrides**

Override rent transaction in scenario:
- Amount: $1800 starting June (vs $1500 base)

**6.5. Generate and validate projection**

- Click "Generate Projection"
- Verify 12 periods created (Jan - Dec)
- Verify debits = credits for each period
- Verify interest calculated on Checking
- Verify balances carry forward correctly
- Verify primary account filter shows Checking + related accounts

**6.6. Test scenario cloning**

- Clone scenario to "2026 Refinance Test"
- Modify account overrides in clone
- Generate projection for clone
- Verify original scenario unaffected

**6.7. Add CSS styling**

Update `styles/app.css` to add:
- Visual distinction for primary accounts (bold/highlighted)
- Indentation for secondary accounts
- Section layouts
- Filter controls styling
- Button states (disabled, loading)

**Acceptance Criteria**:
- ✅ Test scenario creates successfully
- ✅ Planned transactions create and link correctly
- ✅ Account overrides apply correctly
- ✅ Transaction overrides apply correctly
- ✅ Projection generates without errors
- ✅ Debits = credits validation passes
- ✅ Primary account filtering works
- ✅ Scenario cloning preserves data
- ✅ UI is visually clear and polished
- ✅ Error handling works (missing data, validation failures)

---

## File Changes Summary

### New Files:
- `js/projection-engine.js` - Projection calculation engine

### Renamed Files:
- `assets/forecast-template-grid.json` → `assets/scenario-grid.json`
- `assets/forecast-setup-grid.json` → `assets/planned-transactions-grid.json`
- `assets/forecast-snapshot-grid.json` → `assets/projections-grid.json`

### Modified Files:
- `assets/scenario-grid.json` - New schema with scenarios
- `assets/planned-transactions-grid.json` - New schema with recurrence
- `assets/projections-grid.json` - New schema with debits/credits
- `assets/accounts-grid.json` - Add interest/growth fields
- `assets/app-data.json` - Migrate to new structure
- `js/data-manager.js` - Add scenario/planned transaction/projection methods
- `js/forecast.js` - Complete rewrite with new UI and logic
- `styles/app.css` - Add styling for new UI elements

### Removed Files:
- None (old forecast files renamed)

---

## Testing Checklist

### Basic Functionality:
- [ ] Create new scenario
- [ ] Edit scenario
- [ ] Delete scenario
- [ ] Clone scenario
- [ ] Add planned transaction
- [ ] Edit planned transaction
- [ ] Delete planned transaction
- [ ] Set account override
- [ ] Set transaction override
- [ ] Generate projection
- [ ] View projections
- [ ] Filter by primary account

### Edge Cases:
- [ ] Scenario with no accounts
- [ ] Scenario with no planned transactions
- [ ] Planned transaction with no recurrence
- [ ] One-time transaction
- [ ] Daily recurrence
- [ ] Weekly recurrence
- [ ] Monthly recurrence (with day of month)
- [ ] Yearly recurrence
- [ ] Transaction spanning multiple periods
- [ ] Account with interest but no growth
- [ ] Account with growth but no interest
- [ ] Account with both interest and growth
- [ ] Very long projection period (5 years)
- [ ] Scenario ending mid-month

### Error Handling:
- [ ] Invalid date range (end before start)
- [ ] Invalid recurrence pattern
- [ ] Missing required fields
- [ ] Debits ≠ credits (should fail validation)
- [ ] Delete scenario with projections
- [ ] Generate projection for scenario with no transactions

### UI/UX:
- [ ] Primary account dropdown populates correctly
- [ ] Primary account filter works
- [ ] Visual distinction between primary/secondary accounts
- [ ] Generate button states (enabled/disabled/loading)
- [ ] Projection info updates correctly
- [ ] Last calculated timestamp shows
- [ ] Scenario selection enables controls
- [ ] All sections accordion properly
- [ ] Responsive layout

---

## Success Metrics

1. **All schemas renamed** and updated with new fields
2. **Data migration** completes without loss
3. **DataManager** supports all CRUD operations for scenarios/planned/projections
4. **Forecast page** shows 3 sections with proper filtering
5. **Projection engine** generates accurate projections with interest/growth
6. **Double-entry validation** ensures debits = credits
7. **Primary account filtering** shows correct data
8. **Clone scenario** duplicates data correctly
9. **All test cases** pass
10. **No console errors** during normal operation

---

## Implementation Time Estimate

- Phase 1: 2 hours
- Phase 2: 1 hour
- Phase 3: 2 hours
- Phase 4: 3 hours
- Phase 5: 4 hours
- Phase 6: 2 hours

**Total**: ~14 hours

---

## Notes for Copilot Agent

- Follow existing code patterns from accounts.js and transactions.js
- Use EditableGrid component for all grids
- Use dataManager for all data operations
- Add console.log for debugging projection engine
- Handle errors gracefully with try-catch
- Update lastCalculated timestamp after projection generation
- Ensure all IDs are properly generated/assigned
- Test with small data sets first
- Validate double-entry before saving projections
- Keep UI responsive during long calculations

**Reference Documents**:
- `COMPLETE_FORECAST_DESIGN.md` - Full design specification
- `TECHNICAL_DOCUMENTATION.md` - Component APIs and patterns
- `.github/copilot-instructions.md` - Coding standards and rules
