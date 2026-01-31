# Transaction Flow Refactor - Complete Fix

## Canonical Storage Model (Immutable)
```
{
  id: unique ID
  primaryAccountId: the account making the decision (as displayed)
  secondaryAccountId: the other account
  transactionTypeId: 1 (Money In to primary) or 2 (Money Out from primary)
  amount: ALWAYS POSITIVE (unsigned)
  description, recurrence, etc...
}
```

## Internal Display Rows (Generated, Never Saved)

### Primary Perspective Row
```
{
  id: {originalId},           // No suffix
  perspectiveAccountId: primaryAccountId,
  transactionTypeId: stored value,
  primaryAccountId: stored value,
  secondaryAccountId: stored value,
  amount: signed for display based on type,
  transactionType: { id: type, name: ... }
}
```

### Flipped Perspective Row
```
{
  id: ${originalId}_flipped,   // Marked as flipped
  perspectiveAccountId: secondaryAccountId,
  transactionTypeId: stored === 1 ? 2 : 1,  // Inverted type
  primaryAccountId: stored.secondaryAccountId,  // SWAPPED
  secondaryAccountId: stored.primaryAccountId,  // SWAPPED
  amount: -(signed value) for display,
  transactionType: { inverted }
}
```

## When User Edits

### From Primary Row
1. Get field and newValue from event
2. Save as-is to storage
3. Update display with new value

### From Flipped Row (isFlipped = true)
1. Get field and newValue from event
2. **Map flipped back to canonical:**
   ```
   if (field === 'primaryAccountId') → save to secondaryAccountId
   if (field === 'secondaryAccountId') → save to primaryAccountId
   if (field === 'transactionType') → flip the type before saving
   if (field === 'amount') → store unsigned value as-is
   ```
3. Save canonical form
4. Regenerate both rows from canonical data

## Amount Display (Frontend Only)
```
function displayAmount(transactionTypeId, unsignedAmount) {
  if (transactionTypeId === 1) {  // Money In
    return +unsignedAmount;      // Positive display
  } else {                         // Money Out
    return -unsignedAmount;       // Negative display
  }
}
```

## Problems in Current Code

### 1. Signed Amounts Stored
**Location:** Lines 1385-1400 in forecast.js
**Problem:** Amount stored with sign: `-8500` for expenses
**Fix:** Store as `8500`, let display layer handle sign based on type

### 2. Inverted TypeId Stored in Row
**Location:** Lines 1449-1452, flipped row creation
**Problem:** `transactionTypeId` inverted in row data for display
**Fix:** Keep in row for display, but map back to canonical on edit

### 3. Double Inversion on Edit
**Location:** Lines 1789-1806 in cellEdited handler
**Problem:** Inverting type to store, then inverting again for display
**Fix:** Invert once, use result for both storage and flipped display

### 4. Account IDs Not Swapped in Flipped Row
**Location:** Lines 1448-1451, flipped row creation
**Problem:** Flipped row uses stored primary/secondary, not inverted
**Fix:** Swap them in flipped row: `primaryAccountId: storedSecondaryId`

### 5. Amount Update Logic Broken
**Location:** Lines 1760-1778
**Problem:** Trying to normalize sign based on type, conflicting logic
**Fix:** Store unsigned, calculate display sign on-the-fly

## Implementation Order

1. **Change storage format:** Store unsigned amounts only
2. **Fix flipped row creation:** Swap account IDs in flipped row
3. **Simplify cellEdited:** Detect flip, map fields, store canonical
4. **Fix display calculation:** Use type to determine sign for display
5. **Regenerate on save:** Recreate both perspective rows after save

