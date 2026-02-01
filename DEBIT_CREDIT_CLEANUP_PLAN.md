# Debit/Credit Cleanup Plan

**Version**: 1.0.0  
**Date**: February 1, 2026  
**Objective**: Remove all debit/credit account handling from active application code, consolidating legacy data handling exclusively in the migration layer.

---

## 1.0 Current State Analysis

### 1.1 Active Application Code (TO BE CLEANED)
Files that currently handle debit/credit but should NOT:

| File | Lines | Current Usage | Action Required |
|------|-------|---------------|-----------------|
| `assets/lookup-data.json` | 12, 23, 34 | Column definitions include `debitAccount`, `creditAccount` | **REMOVE** - Replace with `primaryAccount`, `secondaryAccount` |
| `js/managers/transaction-manager.js` | 38-66 | Conversion logic from old format | **REMOVE** - Migration should handle this before data reaches manager |
| `js/managers/budget-manager.js` | 108-109 | Delete statements for `debitAccount`, `creditAccount` | **KEEP** - Defensive cleanup is fine |
| `userData/assets/app-data.json.example` | 15 | Example data with old column format | **UPDATE** - Use new format |

### 1.2 Migration Layer (TO BE ENHANCED)
Files that SHOULD handle debit/credit:

| File | Current State | Enhancement Needed |
|------|---------------|-------------------|
| `js/data-migration.js` | Has `migrateToUnifiedAccountModel()` | ✅ Good - Expand to handle all legacy formats |

### 1.3 Documentation References
| File | Context | Action |
|------|---------|--------|
| `Documentation/USAGE_GUIDE.md` | Line 223 - "Type: Credit (money IN) or Debit (money OUT)" | **UPDATE** - Use "Money In / Money Out" terminology |

---

## 2.0 Cleanup Strategy

### 2.1 Phase 1: Migration Layer Enhancement
**Goal**: Ensure migration can handle ANY legacy debit/credit data format

**Tasks**:
1. ✅ **Already exists**: `migrateToUnifiedAccountModel()` in data-migration.js
2. **Add**: Comprehensive test coverage for edge cases:
   - Transactions with only debitAccount (no creditAccount)
   - Transactions with only creditAccount (no debitAccount)
   - Mixed format scenarios (some transactions old, some new)
   - Null/undefined account references
3. **Add**: Migration version tracking to prevent re-migration
4. **Add**: Migration logging to track what was converted

**Implementation Notes**:
```javascript
// Enhanced migration should:
// 1. Detect old format: presence of debitAccount or creditAccount fields
// 2. Convert to new format: primaryAccountId, secondaryAccountId, transactionTypeId
// 3. Remove old fields completely from data structure
// 4. Mark data as migrated (add migrationVersion field to scenario)
```

### 2.2 Phase 2: Application Code Cleanup
**Goal**: Remove all debit/credit handling from active code

#### 2.2.1 Remove Conversion Logic
**File**: `js/managers/transaction-manager.js`

**Current Code** (Lines 38-66):
```javascript
// Convert from debitAccount/creditAccount format
if (transactionTypeName === 'Money In') {
    transactionTypeId = 1;
    primaryAccountId = txn.creditAccount?.id || null;
    secondaryAccountId = txn.debitAccount?.id || null;
} else {
    transactionTypeId = 2;
    primaryAccountId = txn.debitAccount?.id || null;
    secondaryAccountId = txn.creditAccount?.id || null;
}
```

**Action**: **DELETE THIS BLOCK**  
**Rationale**: If migration has run, this code path should never execute. Data should always be in new format.

**Add Assertion Instead**:
```javascript
// Assert data is in new format (migration should have handled conversion)
if (txn.debitAccount !== undefined || txn.creditAccount !== undefined) {
    throw new Error('Legacy debit/credit format detected. Migration required.');
}
```

#### 2.2.2 Update Lookup Data
**File**: `assets/lookup-data.json`

**Current**:
```json
"transactionColumns": ["debitAccount", "creditAccount", "amount", "description", "tags"]
```

**New**:
```json
"transactionColumns": ["primaryAccount", "secondaryAccount", "transactionType", "amount", "description", "tags"]
```

**Impact Analysis**:
- Grid column definitions will change
- UI must already support new format (it does via transaction-row-transformer.js)
- No breaking change if migration runs first

#### 2.2.3 Update Sample Data
**File**: `userData/assets/app-data.json.example`

**Action**: Remove any debitAccount/creditAccount references and use only new format
**Benefit**: New users never see old format

#### 2.2.4 Keep Defensive Cleanup
**File**: `js/managers/budget-manager.js` (Lines 108-109)

**Current**:
```javascript
delete normalized.debitAccount;
delete normalized.creditAccount;
```

**Action**: **KEEP**  
**Rationale**: Defensive programming - ensures UI objects never leak into storage

---

## 3.0 Migration Execution Flow

### 3.1 Application Startup Sequence
```
1. DataStore.read() loads app-data.json
2. DataMigration.migrateAll(data) runs automatically
   ├─ Detects old format scenarios
   ├─ Runs migrateToUnifiedAccountModel()
   └─ Marks scenarios as migrated
3. Application code receives ONLY new format data
4. No debit/credit handling needed in UI/Managers
```

### 3.2 Migration Detection Logic
```javascript
function needsMigration(scenario) {
    // Check if any transaction uses old format
    return scenario.transactions?.some(tx => 
        tx.debitAccount !== undefined || 
        tx.creditAccount !== undefined
    );
}

function migrateScenario(scenario) {
    if (!needsMigration(scenario)) {
        return scenario; // Already migrated
    }
    
    // Run migration
    const migrated = migrateToUnifiedAccountModel(scenario);
    migrated.migrationVersion = 2; // Track migration version
    
    return migrated;
}
```

---

## 4.0 Testing Strategy

### 4.1 Pre-Cleanup Tests
Before cleanup, create test data files with:
1. Pure old format (all debitAccount/creditAccount)
2. Pure new format (all primaryAccountId/secondaryAccountId)
3. Mixed format (some old, some new)
4. Edge cases (null accounts, missing fields)

### 4.2 Post-Cleanup Validation
After cleanup:
1. ✅ All test files load successfully
2. ✅ All transactions display correctly in UI
3. ✅ All transactions save in new format only
4. ✅ No debitAccount/creditAccount in saved data
5. ✅ Old format data triggers migration, not runtime conversion

---

## 5.0 Rollout Plan

### 5.1 Step-by-Step Execution

| Step | Task | Validation | Rollback Plan |
|------|------|------------|---------------|
| 1 | Enhance data-migration.js with better detection | Migration tests pass | Revert migration.js |
| 2 | Remove conversion logic from transaction-manager.js | App loads without errors | Restore conversion code |
| 3 | Update lookup-data.json columns | Grids render correctly | Restore old column defs |
| 4 | Update example files | Sample data loads | Restore old examples |
| 5 | Update documentation | Docs accurate | Restore old docs |
| 6 | Delete debitAccount/creditAccount comments/refs | Code cleaner | N/A (cosmetic) |

### 5.2 Safety Measures
1. **Migration Idempotency**: Running migration twice should not break data
2. **Backup Recommendation**: Add warning to backup app-data.json before upgrade
3. **Version Flag**: Add `appVersion` to data files to track format version
4. **Graceful Degradation**: If migration fails, app should not corrupt data

---

## 6.0 Benefits

### 6.1 Code Quality
- ✅ Single source of truth: Migration layer handles legacy
- ✅ Cleaner manager code: No dual-format handling
- ✅ Reduced complexity: Less conditional logic
- ✅ Better maintainability: Clear separation of concerns

### 6.2 User Experience
- ✅ Consistent terminology: "Money In/Out" vs "Debit/Credit"
- ✅ Simpler mental model: No accounting background needed
- ✅ Transparent migration: Happens automatically on load

### 6.3 Future-Proofing
- ✅ Easier to add features: No legacy baggage
- ✅ Clearer data model: New developers understand faster
- ✅ Migration pattern: Template for future format changes

---

## 7.0 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data loss during migration | Low | Critical | Thorough testing + backup prompts |
| Missing edge case in migration | Medium | High | Comprehensive test suite |
| User confusion from terminology change | Low | Low | Update documentation |
| Breaking existing workflows | Low | Medium | Maintain UI compatibility |

---

## 8.0 File-by-File Cleanup Checklist

### 8.1 Files to Modify

- [ ] `assets/lookup-data.json` - Update all transactionColumns arrays
- [ ] `js/managers/transaction-manager.js` - Remove lines 38-66 (conversion logic)
- [ ] `js/managers/transaction-manager.js` - Add assertion for legacy format detection
- [ ] `userData/assets/app-data.json.example` - Update to new format
- [ ] `Documentation/USAGE_GUIDE.md` - Replace "Credit/Debit" with "Money In/Out"
- [ ] `js/data-migration.js` - Add migration version tracking
- [ ] `js/data-migration.js` - Add migration logging
- [ ] `js/data-migration.js` - Enhance edge case handling

### 8.2 Files to Keep As-Is

- ✅ `js/managers/budget-manager.js` - Defensive delete statements are fine
- ✅ `js/transaction-row-transformer.js` - No debit/credit references (already clean)
- ✅ `js/projection-engine.js` - Uses new format only

### 8.3 Files to Create

- [ ] Test data files for migration validation
- [ ] Migration test suite (optional but recommended)

---

## 9.0 Documentation Updates Required

### 9.1 Technical Documentation
- [ ] Update TECH_ARCHITECTURE.md - Remove any debit/credit references
- [ ] Update TECHNICAL_OVERVIEW.md - Clarify migration strategy
- [ ] Create MIGRATION_GUIDE.md - Document format changes for users

### 9.2 User Documentation
- [ ] USAGE_GUIDE.md - Replace accounting terminology with user-friendly terms
- [ ] Add note about automatic migration on first load after upgrade

---

## 10.0 Success Criteria

The cleanup is successful when:

1. ✅ **Zero debit/credit in active code**: Only migration layer handles legacy format
2. ✅ **All tests pass**: Old data loads correctly via migration
3. ✅ **New data clean**: No legacy fields in newly created transactions
4. ✅ **Documentation consistent**: All docs use "Money In/Out" terminology
5. ✅ **Users unaffected**: Existing data works seamlessly after migration
6. ✅ **Code maintainable**: Future developers don't encounter dual-format confusion

---

## 11.0 Timeline Estimate

| Phase | Estimated Time | Dependencies |
|-------|----------------|--------------|
| Migration enhancement | 2-3 hours | None |
| Application code cleanup | 1-2 hours | Migration complete |
| Testing & validation | 2-3 hours | Cleanup complete |
| Documentation updates | 1 hour | Testing complete |
| **Total** | **6-9 hours** | Sequential |

---

## 12.0 Next Steps

When ready to implement:
1. Review this plan for completeness
2. Create test data files with various legacy formats
3. Start with Phase 1 (Migration enhancement)
4. Proceed to Phase 2 only after migration is bulletproof
5. Update documentation last

---

**End of Cleanup Plan**
