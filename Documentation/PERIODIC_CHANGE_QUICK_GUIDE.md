# Periodic Change - Quick Summary

## What Is It?
Periodic change = interest/growth on accounts (3% annually) or escalation on transactions (salary raises).

## Data Model (Core Structure)

Every account and transaction has:
```javascript
periodicChange: {
  value: 3.5,      // numeric: % or $
  changeMode: 1,   // ID only (1=Percentage Rate, 2=Fixed Amount)
  changeType: 2,   // ID only (1-7, see types below)
  frequency: 3,    // Optional: For Fixed Amount - when to apply (1=Daily, 2=Weekly, 3=Monthly, 4=Quarterly, 5=Yearly)
  dayOfMonth: 15,  // Optional: For Fixed Amount with Monthly frequency - which day (1-31)
  dayOfWeek: 1,    // Optional: For Fixed Amount with Weekly frequency - which day (1=Mon, 7=Sun)
  weekOfMonth: 1,  // Optional: For Fixed Amount - which week (1-4, or -1 for last)
  customCompounding: {  // Optional: For Custom change type only
    frequency: 12,  // How many times to compound
    period: 1       // Per what? (1=Annual, 2=Monthly, 3=Quarterly, 4=Daily)
  }
}
```

**Store IDs only** (no names/objects) to prevent data anomalies if lookup values change.

**Valid Change Mode IDs** (from lookup-data.json):
- `1: "Percentage Rate"` → value is a percentage (3.5 = 3.5%)
- `2: "Fixed Amount"` → value is a dollar amount (50 = $50)

**Valid Change Type IDs** (7 types):
1. Simple Interest
2. Nominal Annual, Compounded Monthly
3. Nominal Annual, Compounded Daily
4. Nominal Annual, Compounded Quarterly
5. Nominal Annual, Compounded Annually
6. Effective Annual Rate
7. **Custom** - Allows custom compounding frequency

**Valid Frequency IDs** (for Fixed Amount mode):
1. Daily
2. Weekly
3. Monthly
4. Quarterly
5. Yearly

## Status
**80% Built**: Modal, calculations, data persistence all exist.  
**20% Missing**: Just need UI columns + formatter.

## What's Already There
- `js/modal-periodic-change.js` → Modal UI (ready to use)
- `js/financial-utils.js` → Calculations (ready to use)
- Data schemas in accounts & transactions (ready to use)
- Configuration options in lookup-data.json (ready to use)

## What You Need to Add (2 hours max)

### 1. Create `js/periodic-change-utils.js`
```javascript
import { loadLookupData } from './config.js';

export function getPeriodicChangeDescription(pc) {
  if (!pc?.value) return '';
  
  const lookupData = loadLookupData();
  const mode = lookupData.changeModes.find(m => m.id === pc.changeMode);
  const type = lookupData.periodicChangeTypes.find(t => t.id === pc.changeType);
  
  const value = pc.value;
  const modeName = mode?.name;
  const typeName = type?.name;
  
  if (modeName === 'Fixed Amount') {
    return `$${value.toFixed(2)} fixed`;
  }
  
  if (typeName?.includes('Monthly')) {
    return `${value}% annual, compounded monthly`;
  }
  if (typeName?.includes('Daily')) {
    return `${value}% annual, compounded daily`;
  }
  if (typeName?.includes('Quarterly')) {
    return `${value}% annual, compounded quarterly`;
  }
  if (typeName?.includes('Continuous')) {
    return `${value}% continuous`;
  }
  if (typeName?.includes('Effective')) {
    return `${value}% effective annual`;
  }
  
  return `${value}% annual`;
}

export function expandPeriodicChangeForCalculation(pc, lookupData) {
  if (!pc?.value) return null;
  
  const mode = lookupData.changeModes.find(m => m.id === pc.changeMode);
  const type = lookupData.periodicChangeTypes.find(t => t.id === pc.changeType);
  
  return {
    value: pc.value,
    changeMode: mode,
    changeType: type
  };
}
```

### 2. Add Column to Account Grid (forecast.js)
Copy the recurrence column pattern (lines 1566-1593) but use:
- Field: `periodicChange`
- Formatter: `getPeriodicChangeDescription()`
- Click: Opens `openPeriodicChangeModal()`
- Save: Call `AccountManager.saveAll()`

### 3. Add Column to Transaction Grid (forecast.js)
Same pattern as accounts column.

### 4. Update `js/projection-engine.js`

When applying periodic change to accounts/transactions, first resolve IDs to full objects:

```javascript
import { expandPeriodicChangeForCalculation } from './periodic-change-utils.js';

// Before calling applyPeriodicChange(), expand the ID references:
if (account.periodicChange) {
  const expandedPC = expandPeriodicChangeForCalculation(account.periodicChange, lookupData);
  currentBalance = applyPeriodicChange(currentBalance, expandedPC, yearsDiffToStart);
}

// Same for transactions:
if (txn.periodicChange) {
  const expandedPC = expandPeriodicChangeForCalculation(txn.periodicChange, lookupData);
  amount = applyPeriodicChange(txn.amount, expandedPC, yearsDiff);
}
```

**Key Change**: Projection engine must now:
1. Load `lookupData` at the top
2. Call `expandPeriodicChangeForCalculation()` before passing to calculation functions
3. This ensures calculation functions still receive the full object structure they expect

### 5. Add to `styles/app.css`
```css
.periodic-change-cell { display: flex; align-items: center; gap: 8px; }
```

### 6. Update Sample Data
Add examples to `app-data.json.example`:
```json
// Account with percentage rate (compounded monthly)
"periodicChange": {
  "value": 2.5,
  "changeMode": 1,
  "changeType": 2
}

// Transaction with fixed amount (applied monthly on 15th)
"periodicChange": {
  "value": 50,
  "changeMode": 2,
  "changeType": 1,
  "frequency": 3,
  "dayOfMonth": 15
}

// Transaction with fixed amount (every Monday)
"periodicChange": {
  "value": 75,
  "changeMode": 2,
  "changeType": 1,
  "frequency": 2,
  "dayOfWeek": 1
}

// Account with custom compounding (12 times per year)
"periodicChange": {
  "value": 3.5,
  "changeMode": 1,
  "changeType": 7,
  "customCompounding": {
    "frequency": 12,
    "period": 1
  }
}

// Account with custom compounding (30 times per month)
"periodicChange": {
  "value": 3.5,
  "changeMode": 1,
  "changeType": 7,
  "customCompounding": {
    "frequency": 30,
    "period": 2
  }
}
```

## Files to Touch
- CREATE: `js/periodic-change-utils.js` (includes lookup + display + expansion functions)
- EDIT: `js/forecast.js` (add 2 columns, ~80 lines total)
- EDIT: `js/projection-engine.js` (add ID resolution before calculation calls)
- EDIT: `styles/app.css` (add 3 lines)
- EDIT: `userData/assets/app-data.json.example` (add 5 lines)

## That's It
Users can now see, click, and edit periodic changes. Values persist.

**Effort**: 2 hours  
**Risk**: Low (just UI wiring, no logic changes)  
**Next**: Later, integrate into projections if needed
