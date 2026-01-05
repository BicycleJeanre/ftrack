# Alpha Architecture Redesign - Scenario-Centric Model

**Version**: 1.0.0  
**Status**: Implemented  
**Date**: January 5, 2026

---

## Overview

This document describes the comprehensive architecture redesign that transitions FTrack from a master accounts/transactions array model to a **scenario-centric model** with unified schemas and conditional visibility.

### Key Changes

1. **Scenario-Centric Data Model**: All accounts, transactions, and projections are nested within scenarios
2. **Unified Schema System**: 4 unified grid schemas with `visibleWhen` conditional visibility
3. **Simplified Recurrence**: User-friendly recurrence model with 8 types
4. **Periodic Change**: Unified object for interest/growth (accounts) and amount changes (transactions)
5. **Schema-Driven UI**: Conditional field visibility based on scenario type and user selections

---

## 1. Data Structure

### Before (Old Architecture)
```json
{
  "profile": "User",
  "accounts": [...],
  "transactions": [...]
}
```

### After (Scenario-Centric Architecture)
```json
{
  "profile": "User",
  "scenarios": [
    {
      "id": 1,
      "name": "Budget 2026",
      "type": { "id": 1, "name": "Budget" },
      "startDate": "2026-01-01",
      "endDate": "2026-12-31",
      "accounts": [...],
      "plannedTransactions": [...],
      "actualTransactions": [...],
      "projections": []
    }
  ]
}
```

---

## 2. Scenario Types

### Scenario Type Configuration (`/assets/scenario-types.json`)

Three scenario types are supported:

1. **Budget** - Budget tracking with actual vs planned comparison
   - Shows: Accounts, Planned Transactions, Actual Transactions
   - Hides: Projections, Interest/Growth columns
   
2. **General** - General financial planning with projections
   - Shows: Accounts, Planned Transactions, Projections
   - Includes: Interest rates, periodic changes, recurrence patterns
   
3. **Funds** - Investment funds tracking
   - Shows: Accounts, Planned Transactions, Projections
   - Includes: Interest rates, periodic changes, growth calculations

---

## 3. Recurrence System

### 8 Recurrence Types

1. **One Time** - Single occurrence on start date
2. **Daily** - Every N days (configurable interval)
3. **Weekly** - Specific day of week, every N weeks
4. **Monthly - Day of Month** - Specific day (1-31 or -1 for last day)
5. **Monthly - Week of Month** - Nth weekday of month (e.g., 2nd Monday)
6. **Quarterly** - Specific day of quarter (1-92)
7. **Yearly** - Specific month and day
8. **Custom Dates** - Array of specific dates

### Recurrence Data Structure
```json
{
  "recurrenceType": "Monthly - Day of Month",
  "startDate": "2026-01-01",
  "endDate": "2026-12-31",
  "dayOfMonth": 1
}
```

---

## 4. Periodic Change System

### 7 Change Types

1. **Nominal Annual** - Simple interest (FV = PV × (1 + r × t))
2. **Monthly Compounded** - APY compounded monthly
3. **Daily Compounded** - APY compounded daily (365 periods)
4. **Quarterly Compounded** - APY compounded quarterly
5. **Annual Compounded** - APY compounded yearly
6. **Continuous** - Continuous compounding (FV = PV × e^(r×t))
7. **Custom** - User-defined frequency and rate type

### Periodic Change Data Structure
```json
{
  "changeType": "Monthly Compounded",
  "rate": 5.0,
  "frequency": { "id": 3, "name": "Monthly" }
}
```

---

## 5. Conditional Visibility

### visibleWhen Expression Syntax

Columns can have a `visibleWhen` property that uses simple expression syntax:

- `scenario.type.name == 'Budget'` - Equals comparison
- `scenario.type.name != 'General'` - Not equals
- `scenario.type.name IN ['General', 'Funds']` - IN list
- `recurrence.recurrenceType == 'Weekly'` - Field-specific visibility

### Examples

```json
{
  "field": "interestRate",
  "visibleWhen": "scenario.type.name IN ['General', 'Funds']"
}
```

---

## 6. File Structure

### New Files Created

- `/assets/scenario-types.json` - Scenario type configuration
- `/assets/accounts-grid-unified.json` - Unified account schema
- `/assets/planned-transactions-grid.json` - Planned transaction schema
- `/assets/actual-transactions-grid.json` - Actual transaction schema
- `/assets/projections-grid.json` - Projection schema
- `/js/data-manager.js` - Scenario-centric CRUD operations
- `/js/calculation-utils.js` - Recurrence and periodic change calculations
- `/js/projection-engine.js` - Projection generation engine
- `/js/forecast.js` - Forecast page controller
- `/pages/forecast.html` - Forecast page

### Modified Files

- `/js/editable-grid.js` - Added conditional visibility support
- `/js/navbar.js` - Updated navigation links
- `/assets/app-data.json` - Migrated to scenario-centric structure

### Removed Files

- `/js/accounts.js` - Replaced by forecast.js
- `/js/transactions.js` - Replaced by forecast.js
- `/pages/accounts.html` - Replaced by forecast.html
- `/pages/transactions.html` - Replaced by forecast.html

---

## 7. Core Modules

### Data Manager (`/js/data-manager.js`)

Centralized data operations for scenario-scoped CRUD:

**Scenario Operations**:
- `getScenarios()` - Get all scenarios
- `getScenario(id)` - Get specific scenario
- `createScenario(data)` - Create new scenario
- `updateScenario(id, updates)` - Update scenario
- `deleteScenario(id)` - Delete scenario
- `duplicateScenario(id, name)` - Duplicate scenario

**Account Operations** (scenario-scoped):
- `getAccounts(scenarioId)`
- `createAccount(scenarioId, data)`
- `updateAccount(scenarioId, accountId, updates)`
- `deleteAccount(scenarioId, accountId)`
- `saveAccounts(scenarioId, accounts)`

**Transaction Operations** (scenario-scoped):
- `getPlannedTransactions(scenarioId)`
- `savePlannedTransactions(scenarioId, transactions)`
- `getActualTransactions(scenarioId)`
- `saveActualTransactions(scenarioId, transactions)`

**Projection Operations** (scenario-scoped):
- `getProjections(scenarioId)`
- `saveProjections(scenarioId, projections)`
- `clearProjections(scenarioId)`

### Calculation Utils (`/js/calculation-utils.js`)

Core calculation functions:

- `generateRecurrenceDates(recurrence, start, end)` - Generate all occurrence dates
- `calculatePeriodicChange(principal, change, periods)` - Apply interest/growth
- `getNthWeekdayOfMonth(date, weekday, n)` - Helper for monthly week recurrence
- `getQuartersBetween(start, end)` - Helper for quarterly calculations
- `getPeriodsBetween(start, end, frequency)` - Generic period calculator

### Projection Engine (`/js/projection-engine.js`)

Generates financial projections:

- `generateProjections(scenarioId, options)` - Main projection generation
- `clearProjections(scenarioId)` - Clear projections
- Supports multiple periodicities: daily, weekly, monthly, quarterly, yearly

### Editable Grid (`/js/editable-grid.js`)

Enhanced with conditional visibility:

- `evaluateVisibleWhen(expression, rowData)` - Evaluate visibility conditions
- `isColumnVisible(col, rowData)` - Check column visibility
- `getNestedValue(obj, path)` - Access nested object properties
- `setNestedValue(obj, path, value)` - Set nested object properties
- Constructor accepts `scenarioContext` option

---

## 8. Business Rules

### Scenario Isolation
- No cross-scenario references allowed
- Each scenario maintains independent data

### Account References
- Transactions must reference accounts within the same scenario
- Account dropdowns filtered by current scenario

### Projection Lifecycle
- Projections generated on demand (not automatic)
- Manual regeneration via "Generate Projections" button
- Cleared when scenario data changes significantly

### ID Generation
- New records use Max ID + 1 within their scope
- IDs are unique within scenario, not globally

---

## 9. Usage Guide

### Creating a New Scenario

1. Navigate to Forecast page
2. Use Data Manager to create scenario:
   ```javascript
   import { createScenario } from './data-manager.js';
   
   await createScenario({
     name: "My Budget 2027",
     type: { id: 1, name: "Budget" },
     startDate: "2027-01-01",
     endDate: "2027-12-31"
   });
   ```

### Adding Accounts

Accounts are added through the UI grid with conditional fields based on scenario type.

### Setting Up Recurring Transactions

1. Add a planned transaction
2. Click the Recurrence modal icon
3. Configure recurrence type and parameters
4. For General/Funds scenarios, also configure amount change

### Generating Projections

1. Select a General or Funds scenario
2. Add accounts with periodic changes (optional)
3. Add planned transactions with recurrence
4. Click "Generate Projections"
5. View results in Projections grid

---

## 10. Testing Results

All calculation utilities have been tested and verified:

✓ One Time Recurrence  
✓ Daily Recurrence  
✓ Weekly Recurrence  
✓ Monthly - Day of Month  
✓ Monthly - Week of Month  
✓ Quarterly Recurrence  
✓ Yearly Recurrence  
✓ Custom Dates  
✓ Nominal Annual Interest  
✓ Monthly Compounded Interest  
✓ Daily Compounded Interest  
✓ Quarterly Compounded Interest  
✓ Annual Compounded Interest  
✓ Continuous Compounding  
✓ Custom Periodic Change  

---

## 11. Migration

Existing data is migrated using `/migrate-to-scenarios.js`:

- Old `accounts[]` → `scenarios[0].accounts[]`
- Old `transactions[]` → `scenarios[0].plannedTransactions[]`
- Creates default "Budget 2026" and "General Forecast 2026" scenarios
- Preserves all existing data

---

## 12. Future Enhancements

Potential improvements:

1. **Scenario Comparison** - Side-by-side scenario analysis
2. **Goal Tracking** - Define and track financial goals
3. **What-If Analysis** - Quick scenario variations
4. **Data Import/Export** - CSV/Excel integration
5. **Reporting** - Generate PDF/HTML reports
6. **Multi-Currency** - Exchange rate handling
7. **Tags & Categories** - Enhanced transaction categorization
8. **Visualization** - Charts and graphs for projections

---

## 13. Technical Notes

### Performance Considerations

- Projections cached until regenerated
- Large date ranges may take time to process
- Consider pagination for >1000 projection records

### Browser Compatibility

- Requires ES6+ module support
- Tested with Electron 37.2.1
- Uses modern JavaScript features (async/await, etc.)

### Security

- All data stored locally in JSON files
- No external API calls
- Node.js integration enabled for file system access

---

## 14. Support & Troubleshooting

### Common Issues

**Issue**: Conditional fields not showing  
**Solution**: Verify scenario type configuration and visibleWhen expressions

**Issue**: Projections not generating  
**Solution**: Check console for errors, verify accounts and transactions exist

**Issue**: Recurrence dates incorrect  
**Solution**: Verify recurrence configuration, especially start/end dates

### Debug Mode

Enable console logging in browser DevTools to see detailed operation logs:
- `[DataManager]` - Data operations
- `[ProjectionEngine]` - Projection generation
- `[EditableGrid]` - Grid rendering and visibility
- `[Forecast]` - Page controller operations

---

**End of Document**
