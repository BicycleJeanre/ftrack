# Data Linking Analysis & Implementation Plan

**Date**: December 29, 2025  
**Purpose**: Analyze current data linking approach and propose centralized data management

---

## 1. Current State Analysis

### 1.1. ID Fields Present

✅ **All entities have ID fields**:
- Accounts: `id` field (number)
- Transactions: `id` field (number)
- Forecast Versions: `id` field (number)
- Forecast Setup: `id` field (number) 
- Forecast Results: `id` field (number)

### 1.2. Current Linking Mechanisms

**Transactions → Accounts**:
- Fields: `debit_account` and `credit_account`
- Structure: `{ id: number, name: string }`
- Type: `addSelect` allows creating new accounts
- Current save logic: In [transactions.js](../js/transactions.js) `onSave()` function

**Forecast Setup → Accounts**:
- Field: `account`
- Structure: `{ id: number, name: string }`
- Type: `addSelect` allows creating new accounts

**Forecast Setup → Transactions**:
- Field: `transaction`
- Structure: `{ id: number, name: string }`
- Type: `addSelect` allows creating new transactions

**Missing Links**:
- ❌ Forecast Setup → Forecast Version (no `versionId` field yet)
- ❌ Forecast Results → Forecast Version (no `versionId` field yet)

### 1.3. Current Save Logic Location

Each page controller handles its own saving:

- [accounts.js](../js/accounts.js): `onSave()` - saves accounts only
- [transactions.js](../js/transactions.js): `onSave()` - saves transactions AND creates new accounts
- [forecast.js](../js/forecast.js): 
  - `onVersionSave()` - saves forecast versions
  - `onSetupSave()` - saves forecast setup
  - `onResultsSave()` - saves forecast results

**Issues**:
1. Logic is duplicated (account creation logic in transactions.js)
2. Schema loading happens in multiple places
3. No centralized validation
4. Hard to maintain consistency

---

## 2. Proposed Solution: Centralized Data Manager

### 2.1. Created Module

✅ Created [js/data-manager.js](../js/data-manager.js)

**Features**:
- Single source of truth for data operations
- Automatic ID generation
- Auto-linking of new entities
- Schema-based default value population
- Data validation
- Error handling

### 2.2. Key Methods

| Method | Purpose |
|--------|---------|
| `loadData()` | Load app-data.json into memory |
| `saveData()` | Write cached data to disk |
| `getNextId(entityType)` | Generate next available ID |
| `saveAccounts(data)` | Save accounts |
| `saveTransactions(data)` | Save transactions + auto-create accounts |
| `saveForecastVersions(data)` | Save forecast versions |
| `saveForecastSetup(data, versionId)` | Save setup + link to version |
| `saveForecastResults(data, versionId)` | Save results + link to version |
| `validateData()` | Check data integrity |

### 2.3. Migration Plan

**Phase 1: Add Missing Links**
1. Add `versionId` field to forecast-setup-grid.json
2. Add `versionId` field to forecast-snapshot-grid.json (results)
3. Update app-data.json structure

**Phase 2: Refactor Existing Controllers**
1. Update [accounts.js](../js/accounts.js) to use dataManager
2. Update [transactions.js](../js/transactions.js) to use dataManager
3. Update [forecast.js](../js/forecast.js) to use dataManager

**Phase 3: Add Validation**
1. Run validation on app load
2. Show warnings for broken links
3. Add repair utilities

---

## 3. Data Schema Updates Needed

### 3.1. Forecast Setup Schema

**Add to [forecast-setup-grid.json](../assets/forecast-setup-grid.json)**:

```json
{
  "field": "versionId",
  "header": "Forecast Version",
  "type": "select",
  "editable": true,
  "display": true,
  "optionsSource": "forecastDefinitions",
  "optionsSourceFile": "app-data.json",
  "default": null
}
```

Or make it hidden and auto-set based on active version selection.

### 3.2. Forecast Results Schema

**Add to [forecast-snapshot-grid.json](../assets/forecast-snapshot-grid.json)**:

```json
{
  "field": "versionId",
  "header": "Forecast Version",
  "type": "number",
  "editable": false,
  "display": false,
  "default": null
}
```

Hidden field auto-populated by forecast generation engine.

### 3.3. App Data Structure

**Add to [app-data.json](../assets/app-data.json)**:

```json
{
  "forecastSetup": []
}
```

Currently missing - causes TODO in forecast.js.

---

## 4. Workflow Examples

### 4.1. Adding Account from Transaction

**Current Flow**:
1. User types new account name in transaction addSelect dropdown
2. Transaction saved with `{ id: null, name: "New Account" }`
3. `onSave()` detects null ID
4. Loads accounts schema
5. Creates account with schema defaults
6. Assigns new ID
7. Updates transaction reference
8. Saves both to app-data.json

**Proposed Flow with DataManager**:
1. User types new account name
2. Transaction saved with `{ id: null, name: "New Account" }`
3. Call `dataManager.saveTransactions(data)`
4. DataManager handles detection, creation, linking automatically
5. Single write to disk

### 4.2. Creating Forecast with Setup

**Proposed Flow**:
1. User creates forecast version in Section 1
2. `dataManager.saveForecastVersions(data)` → returns new version ID
3. User adds transactions in Section 2
4. Each setup item auto-tagged with `versionId`
5. `dataManager.saveForecastSetup(data, versionId)`
6. User generates forecast
7. Results auto-tagged with `versionId`
8. `dataManager.saveForecastResults(data, versionId)`
9. All linked via `versionId`

---

## 5. Benefits

1. **Single Responsibility**: Data operations in one place
2. **Consistency**: Same logic for all entity linking
3. **Validation**: Centralized integrity checks
4. **Maintainability**: Change schema defaults in one location
5. **Error Handling**: Consistent error reporting
6. **Testability**: Easy to unit test data operations
7. **Future-Proof**: Easy to add new entity types

---

## 6. Implementation Steps

### Step 1: Add Missing Data Structure
- [ ] Add `forecastSetup: []` to app-data.json

### Step 2: Add Version Linking Fields
- [ ] Add `versionId` to forecast-setup-grid.json
- [ ] Add `versionId` to forecast-snapshot-grid.json

### Step 3: Test DataManager Module
- [ ] Import dataManager in one controller
- [ ] Test basic save/load operations
- [ ] Verify auto-linking works

### Step 4: Migrate Controllers
- [ ] Refactor accounts.js onSave
- [ ] Refactor transactions.js onSave
- [ ] Refactor forecast.js all save methods

### Step 5: Add Validation
- [ ] Run validateData() on app startup
- [ ] Log any integrity issues
- [ ] Add repair options

### Step 6: Documentation
- [ ] Update TECHNICAL_DOCUMENTATION.md with data-manager details
- [ ] Document linking patterns
- [ ] Add examples

---

## 7. Open Questions

1. **Forecast Version Selection**: Should forecast setup show which version it belongs to?
2. **Cascade Deletes**: What happens when deleting a forecast version with setup/results?
3. **History**: Should we keep deleted items or hard delete?
4. **Validation UI**: How to show validation errors to users?
5. **Auto-Save**: Should saves happen on every cell edit or batched?

---

## 8. Next Actions

**Immediate**:
1. Review this analysis with user
2. Decide on implementation approach
3. Add missing `forecastSetup` to app-data.json

**Short-term**:
1. Add `versionId` linking fields
2. Refactor one controller to use dataManager (test)
3. Migrate remaining controllers

**Long-term**:
1. Add data validation UI
2. Implement cascade delete logic
3. Add data export/import utilities
