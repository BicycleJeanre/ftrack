# Data Schema

## 1.0 Purpose

This document formally defines the data structures used in FTrack. All application code, QC tests, and user data must conform to these structures. This is the **authoritative reference** for field names, types, and relationships.

## 1.1 Root Data Object

FTrack persists a single root object. Export and import operations read and write this object as-is.

### 1.1.1 Structure

```typescript
type AppData = {
  schemaVersion: number,
  scenarios: Scenario[],
  uiState: UiState,
  migrationReport?: MigrationReport | null
}

type UiState = {
  lastWorkflowId: string,                 // Persist last selected workflow across reload/import (defaults to "general")
  lastScenarioId: number | null,           // Persist last selected scenario across reload/import
  lastScenarioVersion: number | null,      // Redundant safety for versioned scenarios
  viewPeriodTypeIds: {                     // Period views are per-card, not derived from projections
    transactions: number,                  // Period ID (1=Day|2=Week|3=Month|4=Quarter|5=Year)
    planActuals: number,                   // Period ID for the Plan & Actuals period view
    projections: number                    // Period ID (1=Day|2=Week|3=Month|4=Quarter|5=Year)
  }
}
```

1.1.2 Schema Versioning

- `schemaVersion` is incremented for breaking storage changes.
- The unified rule/occurrence workflow uses `schemaVersion = 44`.
- Schema 44 migration reports are stored at the app-data root so automatic and
  imported migrations remain inspectable and recoverable.

1.1.3 Period Views Are Not Projections

- UI period grouping for transactions and Plan & Actuals is a view concern.
- Projections period type is an engine concern.
- These must be stored independently (see `UiState.viewPeriodTypeIds`).

### 1.1.4 MigrationReport

```typescript
type MigrationReport = {
  fromSchemaVersion: number | null,
  toSchemaVersion: 44,
  migratedAt: string,
  summary: {
    scenarioCount: number,
    rulesRetained: number,
    legacyBudgetRows: number,
    occurrencesCreated: number,
    actualTransactionsConverted: number,
    projectionRowsCleared: number,
    warningCount: number,
    recoveryRecordCount: number
  },
  scenarios: Array<{
    scenarioId: number | null,
    scenarioIndex: number,
    summary: object,
    issues: Array<{
      severity: "warning",
      code: string,
      message: string,
      sourceCollection: "transactions" | "budgets",
      sourceIndex: number,
      sourceId: number | string | null,
      action: string,
      recoveryRecord?: object
    }>
  }>
}
```

The report is part of app data so startup migration and file import have the
same durable recovery contract. Invalid rows that cannot become valid
occurrences, duplicate losers, ambiguous links, and orphaned source records are
never silently discarded; their raw source record is retained in the relevant
issue as `recoveryRecord`.

### 1.1.5 In-App Upgrade Preflight

Uploaded JSON and the raw `ftrack:data` browser-storage value use the same
read-only preflight before import:

1. Parse the selected JSON source.
2. Reject non-object data, a missing `scenarios` array, malformed JSON, and
   future schema versions.
3. Migrate older schemas or sanitize schema 44 data in memory.
4. Validate the exact prepared object with the application validation service.
5. Deep-compare source and prepared data, classifying each path as added,
   changed, or removed and attaching a human-readable reason.
6. Return the prepared data and a downloadable report containing source and
   target schema versions, counts, full changes, migration warnings, recovery
   flags, and validation results.

The preflight service does not write storage. The review modal enables apply
only when validation passes. Startup intercepts legacy browser data before the
normal data-store read so the original value remains intact until approval.

---

## 2.0 Scenario

A scenario is a named version of user content containing accounts, transaction
rules, and dated transaction occurrences. UI workflows are NOT stored on
scenarios.

### 2.1 Structure

```typescript
{
  id: number,
  version: number,                          // Starts at 1; increments on duplication
  name: string,
  description: string | null,
  lineage?: ScenarioLineage | null,
  accounts: Account[],
  accountGroups?: AccountGroup[],
  transactions?: Transaction[],
  transactionOccurrences: TransactionOccurrence[],
  baselinePeriods: BaselinePeriod[],
  projection?: ProjectionBundle | null,      // Projection config + last generated output
  planning?: ScenarioPlanning | null         // Planning windows for goal tooling (Generate Plan / Solver)
}
```

### 2.2 Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | number | Yes | Unique within profile |
| `version` | number | Yes | Starts at 1; increments on duplication |
| `name` | string | Yes | Display name |
| `description` | string \| null | No | Free-form user notes |
| `lineage` | ScenarioLineage \| null | No | Tracks duplication source and ancestor IDs |
| `accounts` | Account[] | Yes | Must have at least 1 account |
| `accountGroups` | AccountGroup[] | No | Optional non-postable hierarchy for rollups/group filtering |
| `transactions` | Transaction[] | No | Can be empty |
| `transactionOccurrences` | TransactionOccurrence[] | Yes | Stored overrides, actuals, skips, manual items, and frozen baselines |
| `baselinePeriods` | BaselinePeriod[] | Yes | Periods whose occurrence baselines have been frozen |
| `projection` | ProjectionBundle \| null | No | Stored projection config and last generated results |
| `planning` | ScenarioPlanning \| null | No | Planning windows used by goal tooling; independent of projection config |

### 2.3 ScenarioLineage

Scenario lineage is a lightweight history for duplication only. No merge semantics are defined.

```typescript
type ScenarioLineage = {
  duplicatedFromScenarioId: number | null,
  ancestorScenarioIds: number[]             // Ordered oldest → newest
}
```

### 2.3.1 AccountGroup

Account groups are non-postable containers used for rollups and filtering.

```typescript
type AccountGroup = {
  id: number,
  name: string,
  parentGroupId?: number | null,
  accountIds?: number[],
  sortOrder?: number
}
```

### 2.4 ProjectionBundle

Projection settings are stored under `scenario.projection.config` (not on the scenario root).

```typescript
type ProjectionBundle = {
  config: ProjectionConfig,
  rows: ProjectionPoint[],
  generatedAt: string | null,               // ISO datetime string
  stale: boolean,
  staleAt: string | null,
  staleReason: string | null
}

type ProjectionConfig = {
  startDate: string,
  endDate: string,
  periodTypeId: number,                    // Period ID (1=Day|2=Week|3=Month|4=Quarter|5=Year)
  asOfDate?: string,                       // Optional overdue-commitment date (YYYY-MM-DD)
  openCommitmentStartDate?: string         // Optional history boundary (YYYY-MM-DD)
}
```

2.4.1 Projection Source Semantics

- Projection calculation always uses `resolveScenarioOccurrences()`.
- `transactions` supply recurring and one-time rules.
- `transactionOccurrences` supply dated overrides, actuals, skips, frozen
  baselines, and manual occurrences.
- Actuals replace their matching planned occurrence and use the actual amount/date.
- Skipped occurrences are excluded.
- Manual occurrences are included.
- There is one resolved-plan projection source. `projection.config.source` is
  not valid in schemaVersion 44.
- When `asOfDate` is supplied, unresolved items before that date are flagged overdue and forecast at the as-of date.
- `openCommitmentStartDate` can explicitly widen rule expansion before the projection start so older unresolved commitments are carried into the current window.

---

## 2.4.2 Projection Freshness

- Any rule, occurrence, account, or projection-policy edit sets `stale = true`,
  records `staleAt`, and records a machine-readable `staleReason`.
- Successful projection generation replaces `rows`, records `generatedAt`, and
  clears `stale`, `staleAt`, and `staleReason`.
- Schema migration clears legacy rows because their provenance cannot be
  guaranteed, sets `generatedAt = null`, and marks the projection stale with
  reason `schema-migration`.
- Stored stale rows must never be presented as current results.

## 2.4.3 BaselinePeriod

```typescript
type BaselinePeriod = {
  periodTypeId: 1 | 2 | 3 | 4 | 5,
  startDate: string,
  endDate: string,
  frozenAt: string
}
```

Each unique period may be frozen once. The metadata records the period boundary
and freeze time; frozen monetary values live on the corresponding transaction
occurrences as `baselineAmount`.

## 2.5 ScenarioPlanning

Goal tooling uses explicit planning windows that can differ from the projection window.

2.5.1 Rules

- Planning windows default to the projection window (`scenario.projection.config.startDate/endDate`) when missing.
- Goal Workshop Simple mode uses `scenario.planning.generatePlan` as the planning horizon.
- Goal Workshop Advanced mode uses `scenario.planning.advancedGoalSolver` as the solver horizon.
- `scenario.planning.goalWorkshopMode` stores the active mode (`'simple'` or `'advanced'`); defaults to auto-detect if absent.
- Projections always use `scenario.projection.config` (planning windows do not change engine behavior).

```typescript
type ScenarioPlanning = {
  generatePlan: PlanningWindow,
  advancedGoalSolver: PlanningWindow,
  goalWorkshopMode?: 'simple' | 'advanced'
}

type PlanningWindow = {
  startDate: string,
  endDate: string
}
```

---

## 3.0 Account

An account represents a place where money lives or is owed.

### 3.1 Structure

```typescript
{
  id: number,
  name: string,
  type: number,                              // Account type ID (1=Asset, 2=Liability, 3=Income, 4=Expense, 5=Debt)
  currency: number,                          // Currency ID (1=USD, 2=ZAR, 3=GBP, 4=EUR, etc.)
  startingBalance: number,
  openDate: string,
  periodicChange?: PeriodicChange | null,
  periodicChangeSchedule?: PeriodicChangeScheduleEntry[] | null,
  interestAccountId?: number | null,
  interestPostingDirection?: string | null,
  goalAmount?: number | null,
  goalDate?: string | null,
  tags?: string[]                            // User-defined tags for categorization
}
```

### 3.2 Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | number | Yes | Unique within scenario |
| `name` | string | Yes | Display name (e.g., "Checking Account") |
| `type` | number | Yes | Account type ID: 1=Asset, 2=Liability, 3=Equity, 4=Income, 5=Expense |
| `currency` | number | Yes | Currency ID (1=ZAR, 2=USD, 3=EUR, 4=GBP) |
| `startingBalance` | number | Yes | Opening balance in currency units |
| `openDate` | string | Yes | Date account opened |
| `periodicChange` | PeriodicChange \| null | No | Growth/decay applied to account balance (interest, inflation) |
| `periodicChangeSchedule` | PeriodicChangeScheduleEntry[] \| null | No | Optional date-bounded overrides for `periodicChange` (variable rates) |
| `interestAccountId` | number \| null | No | Optional target account for derived periodic-change interest postings in projections |
| `interestPostingDirection` | string \| null | No | Optional posting direction override (`income`/`expense`/`auto`) for derived interest postings |
| `goalAmount` | number \| null | No | Target balance (for goal-based scenarios) |
| `goalDate` | string \| null | No | Date when goal should be reached |
| `tags` | string[] | No | User-defined tags for categorization and filtering |

### 3.3 Periodic Change Schedule

`periodicChangeSchedule` is an optional array of date-bounded overrides for an account's `periodicChange`.

3.3.1 Rules

- Entries are evaluated by date; at most one entry may apply to any given date (no overlaps).
- If no schedule entry applies on a date, the engine falls back to the account's `periodicChange`.
- If an entry has `endDate = null`, it is open-ended and should typically be the last entry.

3.3.2 Structure

```typescript
type PeriodicChangeScheduleEntry = {
  startDate: string,
  endDate: string | null,
  periodicChange: PeriodicChange | null
}
```

3.3.3 Example

```json
{
  "id": 12,
  "name": "Mortgage",
  "startingBalance": -250000,
  "periodicChange": { "value": 7.5, "changeMode": 1, "changeType": 2 },
  "periodicChangeSchedule": [
    {
      "startDate": "2026-06-01",
      "endDate": "2026-12-31",
      "periodicChange": { "value": 8.25, "changeMode": 1, "changeType": 2 }
    },
    {
      "startDate": "2027-01-01",
      "endDate": null,
      "periodicChange": { "value": 7.9, "changeMode": 1, "changeType": 2 }
    }
  ]
}
```

---

## 4.0 Transaction Rule

A transaction rule defines planned one-time or recurring money movement. Actual
state never lives on a rule.

### 4.1 Structure

```typescript
{
  id: number,
  seriesRootId?: number | null,
  supersedesTransactionId?: number | null,
  promotedFromOccurrenceKey?: string | null,
  primaryAccountId: number,                 // Source/destination account
  secondaryAccountId: number | null,        // Counterparty account
  transactionTypeId: number,                // Type ID: 1=Income, 2=Expense
  amount: number,
  description: string,
  recurrence: Recurrence,
  periodicChange: PeriodicChange | null,
  transactionGroupId?: string | number | null,
  transactionGroupRole?: string | null,
  transactionGroupAccountGroupId?: number | null,
  effectiveDate: string | null,
  activeFrom?: string | null,
  activeTo?: string | null,
  capitalAmount?: number | null,
  interestAmount?: number | null,
  tags: string[],
  createdAt?: string | null,
  updatedAt?: string | null
}
```

### 4.2 Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | number | Yes | Unique within scenario |
| `seriesRootId` | number \| null | No | Root rule ID shared by revision segments |
| `supersedesTransactionId` | number \| null | No | Previous rule segment replaced by this one |
| `promotedFromOccurrenceKey` | string \| null | No | Manual occurrence that created this future rule |
| `primaryAccountId` | number | Yes | ID of source or destination account (depends on transaction type) |
| `secondaryAccountId` | number \| null | No | Optional counterparty account |
| `transactionTypeId` | number | Yes | Type classification (see 4.3) |
| `amount` | number | Yes | Transaction amount (positive, direction determined by type) |
| `description` | string | Yes | Display name (e.g., "Monthly Rent", "Paycheck") |
| `recurrence` | Recurrence | Yes | When/how often transaction occurs (see section 5.0) |
| `periodicChange` | PeriodicChange \| null | No | Growth adjustment to transaction amount over time |
| `transactionGroupId` | string \| number \| null | No | Optional compound/split grouping identifier shared by component transactions |
| `transactionGroupRole` | string \| null | No | Optional component role (for example `principal`, `interest`, `fee`) |
| `transactionGroupAccountGroupId` | number \| null | No | Optional account-group link for a split component |
| `effectiveDate` | string \| null | No | One-time date or compatibility anchor for the rule |
| `activeFrom` | string \| null | No | Inclusive rule-segment boundary |
| `activeTo` | string \| null | No | Inclusive rule-segment boundary |
| `capitalAmount` | number \| null | No | Optional capital split metadata |
| `interestAmount` | number \| null | No | Optional interest split metadata |
| `tags` | string[] | No | User-defined categories |

4.2.1 Rule Revisions

- “This and future” creates a new rule segment, links it with
  `seriesRootId`/`supersedesTransactionId`, and closes the previous segment.
- Promoting a manual occurrence to repeat going forward records its key in
  `promotedFromOccurrenceKey`.
- SchemaVersion 44 rules do not contain `status`, `actualAmount`, or
  `actualDate`; legacy actual transactions migrate to
  `transactionOccurrences`.

### 4.3 Transaction Types

| ID | Name | Meaning |
|----|------|---------|
| 1 | Income | Money flowing in |
| 2 | Expense | Money flowing out |

---

### 4.4 Variable Interest Rates

FTrack supports variable interest rates on accounts by using `Account.periodicChangeSchedule` (see 3.3). Transactions remain the correct model for payments, fees, and other cashflow events.


## 4.5 TransactionOccurrence

A transaction occurrence is persisted only when dated state must survive rule
expansion: an override, actual, skip, manual entry, or frozen baseline. Generated
future occurrences remain derivable from transaction rules.

### 4.5.1 Structure

```typescript
type TransactionOccurrence = {
  id: number,
  sourceTransactionId: number | null,
  occurrenceKey: string,
  scheduledDate: string,
  plannedDate: string | null,
  actualDate: string | null,
  baselineAmount: number | null,
  baselinePrimaryAccountId: number | null,
  baselineSecondaryAccountId: number | null,
  baselineTransactionTypeId: 1 | 2 | null,
  baselineSnapshotVersion: 1 | null,
  plannedAmount: number | null,
  actualAmount: number | null,
  status: "planned" | "actual" | "skipped",
  origin: "generated" | "manual" | "migrated",
  actualSnapshotVersion: 1 | null,
  isOverride: boolean | null,
  primaryAccountId: number | null,
  secondaryAccountId: number | null,
  transactionTypeId: 1 | 2 | null,
  description: string | null,
  tags: string[] | null,
  transactionGroupId?: string | number | null,
  transactionGroupRole?: string | null,
  transactionGroupAccountGroupId?: number | null,
  capitalAmount?: number | null,
  interestAmount?: number | null,
  recurrence?: Recurrence | null,
  recurrenceDescription?: string | null,
  periodicChange?: PeriodicChange | null,
  createdAt?: string | null,
  updatedAt?: string | null
}
```

### 4.5.2 Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | number | Yes | Unique within `transactionOccurrences` |
| `sourceTransactionId` | number \| null | No | If derived from a transaction, stores the source transaction ID |
| `occurrenceKey` | string | Yes | Stable source/date/role key, or `occurrence:<id>` for a manual row |
| `scheduledDate` | string | Yes | Immutable matching date |
| `plannedDate` | string \| null | No | Occurrence-only reschedule |
| `actualDate` | string \| null | Required for actual | Realized date |
| `baselineAmount` | number \| null | No | Frozen comparison value; null means derive until frozen |
| `baselinePrimaryAccountId` | number \| null | No | Frozen primary-account perspective for the baseline |
| `baselineSecondaryAccountId` | number \| null | No | Frozen secondary-account perspective for the baseline |
| `baselineTransactionTypeId` | number \| null | No | Frozen Money In/Money Out type for the baseline |
| `baselineSnapshotVersion` | 1 \| null | No | `1` means the baseline movement fields are authoritative snapshots |
| `plannedAmount` | number \| null | Required for manual plan | Current-plan override; null inherits the generated rule amount |
| `actualAmount` | number \| null | Required for actual | Realized amount |
| `status` | string | Yes | `planned`, `actual`, or `skipped` |
| `origin` | string | Yes | `generated`, `manual`, or `migrated` |
| `actualSnapshotVersion` | 1 \| null | No | `1` means the occurrence's ordinary movement/metadata fields are the authoritative actual snapshot |
| `isOverride` | boolean \| null | No | Explicitly records whether stored rule fields override generated values |
| `primaryAccountId` | number \| null | No | Account ID (nullable for partially-specified entries) |
| `secondaryAccountId` | number \| null | No | Counterparty account ID (nullable for partially-specified entries) |
| `transactionTypeId` | number \| null | No | Type classification (1=Income, 2=Expense) |
| `description` | string \| null | No | Null inherits from a linked rule |
| `recurrence` | Recurrence \| null | No | Preserved source metadata used by resolved views |
| `recurrenceDescription` | string \| null | No | Human-readable repeat metadata |
| `periodicChange` | PeriodicChange \| null | No | Preserved source escalation metadata |
| `transactionGroupId` | string \| number \| null | No | Optional compound/split grouping identifier inherited from source transaction |
| `transactionGroupRole` | string \| null | No | Optional component role inherited from source transaction |
| `transactionGroupAccountGroupId` | number \| null | No | Optional account-group link for a split component |
| `capitalAmount` | number \| null | No | Optional capital component |
| `interestAmount` | number \| null | No | Optional interest component |
| `tags` | string[] \| null | No | Null inherits from a linked rule |

### 4.5.3 Status And Locking

- `status = "actual"` indicates the occurrence is complete and locked.
- `status = "skipped"` preserves the occurrence for history but excludes it from forecasts.
- `actualAmount` and `actualDate` are required for an actual and null otherwise.
- A linked actual uses the stable scheduled occurrence key, so changing the actual date does not create a second planned movement.
- When `actualSnapshotVersion = 1`, the occurrence's `primaryAccountId`,
  `secondaryAccountId`, `transactionTypeId`, `description`, `tags`, grouping,
  split, recurrence, and periodic-change fields are frozen actual metadata.
  The resolver must not fall through to later rule values.
- When `baselineSnapshotVersion = 1`, baseline comparisons use the stored
  baseline account IDs and transaction type. Later changes to rule direction or
  accounts affect Current plan without rewriting the frozen baseline
  perspective.


---

## 5.0 Recurrence

Defines when and how often a transaction occurs.

### 5.1 Structure

```typescript
{
  recurrenceType: number,                   // Recurrence type ID (1=OneTime, 2=Daily, 3=Weekly, 4=MonthDay, 5=MonthWeek, 6=Quarterly, 7=Yearly, 8=Custom)
  startDate: string,
  endDate: string | null,
  interval: number | null,
  dayOfWeek: number | null,                 // 0=Sunday...6=Saturday
  dayOfMonth: number | null,                // 1-31 or -1 for last day
  weekOfMonth: number | null,               // Week ID (1=1st, 2=2nd, 3=3rd, 4=4th, 5=Last)
  dayOfWeekInMonth: number | null,          // Day ID (1=Monday, 2=Tuesday, ..., 7=Sunday)
  dayOfQuarter: number | null,              // 1-92
  month: number | null,                    // Month ID (1=January...12=December)
  dayOfYear: number | null,                 // 1-366
  customDates: string | null,               // Custom date list as string
  id: null                                  // Reserved for future use
}
```

### 5.2 Recurrence Types

From `assets/lookup-data.json` periodicChangeTypes:

| ID | Name |
|----|------|
| 1 | One Time |
| 2 | Daily |
| 3 | Weekly |
| 4 | Monthly - Day of Month |
| 5 | Monthly - Week of Month |
| 6 | Quarterly |
| 7 | Yearly |
| 8 | Custom Dates |

### 5.3 Field Usage by Recurrence Type

| Type | Required Fields | Optional Fields |
|------|-----------------|-----------------|
| One Time | startDate | - |
| Daily | startDate, interval | endDate |
| Weekly | startDate, dayOfWeek, interval | endDate |
| Monthly - Day of Month | startDate, dayOfMonth | endDate, interval |
| Monthly - Week of Month | startDate, weekOfMonth, dayOfWeekInMonth | endDate, interval |
| Quarterly | startDate, dayOfQuarter | endDate |
| Yearly | startDate, month, dayOfYear | endDate |
| Custom Dates | customDates | - |

---

## 6.0 Periodic Change

Defines automatic adjustments to transaction amounts or account balances over time.

### 6.1 Structure

```typescript
{
  value: number,                            // Percentage (if changeMode=1) or fixed amount (if changeMode=2)
  changeMode: number,                       // Type ID: 1=PercentageRate, 2=FixedAmount
  changeType: number,                       // Change type ID (1–7, required for percentage mode)
  period?: number,                          // Period ID for fixed amounts: 1=Daily, 2=Weekly, 3=Monthly, 4=Quarterly, 5=Yearly
  ratePeriod?: number,                      // Rate period ID: 1=Annual, 2=Monthly, 3=Quarterly, 4=Daily
  customCompounding?: {
    period: number,                         // Period ID (1=Annual, 2=Monthly, 3=Quarterly, 4=Daily)
    frequency: number                       // Compounding frequency per period
  }
}
```

### 6.2 Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `value` | number | Yes | Percentage (e.g., 5 for 5%) or absolute amount |
| `changeMode` | number | Yes | Change mode ID: 1=PercentageRate, 2=FixedAmount |
| `changeType` | number | Yes (for percentage) | Change type ID (1–7) |
| `period` | number | No (required if Fixed Amount) | Period ID (1–5): 1=Daily, 2=Weekly, 3=Monthly, 4=Quarterly, 5=Yearly |
| `ratePeriod` | number | No | Rate period ID: 1=Annual, 2=Monthly, 3=Quarterly, 4=Daily |
| `customCompounding` | Object | No (for Custom type only) | Period ID and compounding frequency |

### 6.3 Change Types Reference

From `assets/lookup-data.json` periodicChangeTypes:

| ID | Name | Example |
|----|------|---------|
| 1 | Nominal Annual (No Compounding) | Simple interest at 6% annually |
| 2 | Nominal Annual, Compounded Monthly | 6% compounded monthly |
| 3 | Nominal Annual, Compounded Daily | 6% compounded daily |
| 4 | Nominal Annual, Compounded Quarterly | 6% compounded quarterly |
| 5 | Nominal Annual, Compounded Annually | 6% compounded annually |
| 6 | Nominal Annual, Continuous Compounding | Continuous compounding |
| 7 | Custom | Custom period + frequency |

### 6.4 Change Modes Reference

From `assets/lookup-data.json` changeModes:

| ID | Name | Value Field | Period Field |
|----|------|-------------|--------------|
| 1 | Percentage Rate | 6 (6%) | Not used |
| 2 | Fixed Amount | 100 (add $100) | Period ID (1=Daily, 2=Weekly, 3=Monthly, 4=Quarterly, 5=Yearly) |

### 6.5 Frequency/Period Reference

From `assets/lookup-data.json` frequencies:

| ID | Name |
|----|------|
| 1 | Daily |
| 2 | Weekly |
| 3 | Monthly |
| 4 | Quarterly |
| 5 | Yearly |

### 6.6 Usage Examples

**Percentage Rate (Annual Compound Monthly)**
```json
{
  "value": 6,
  "changeMode": 1,
  "changeType": 2
}
```

**Fixed Amount (Monthly)**
```json
{
  "value": 100,
  "changeMode": 2,
  "period": 3
}
```

**Custom Compounding**
```json
{
  "value": 6,
  "changeMode": 1,
  "changeType": 7,
  "customCompounding": {
    "period": 3,
    "frequency": 12
  }
}
```

---

## 7.0 LookupReference

All references to lookup values must be stored as numeric IDs only. Never store full objects or names.

### 7.1 Correct Format (ID Only)

```typescript
{
  changeMode: 1,              // ID only
  changeType: 2,              // ID only
  accountType: 1,             // ID only
  recurrenceType: 3,          // ID only
  period: 3                   // ID only
}
```

### 7.2 Incorrect Formats (NOT Allowed)

❌ Do NOT use objects:
```typescript
{
  changeMode: { "id": 1, "name": "Percentage Rate" }     // WRONG
}
```

❌ Do NOT use names:
```typescript
{
  changeMode: "Percentage Rate"                           // WRONG
}
```

### 7.3 Validation

All numeric IDs must reference valid entries in `assets/lookup-data.json`. Code validation should map IDs to display names for UI rendering.

---

## 8.0 Projection

System-generated forecast of account balances. NOT user-provided.

### 8.1 Structure

```typescript
type ProjectionPoint = {
  accountId: number,
  date: string,
  balance: number,
  income: number,
  expenses: number,
  netChange: number,
  interest?: number,
  capitalIn?: number,
  capitalOut?: number,
  interestIn?: number,
  interestOut?: number,
  period?: number                           // 1-based index within generated periods
}
```

---

## 9.0 Consistency Rules

### 9.1 Reference Integrity

- All `*Id` fields must reference valid entities in the same scenario
- `primaryAccountId` and `secondaryAccountId` must exist in `accounts[]`
- `transactionTypeId` must be 1–2
- A non-null `sourceTransactionId` must reference `transactions[]`.
- Linked keys use
  `tx:<sourceTransactionId>|date:<scheduledDate>|role:<role-or-none>`.
- Source-less keys use `occurrence:<id>`.

### 9.2 Date Ranges

- `scenario.projection.config.startDate` must be ≤ `scenario.projection.config.endDate`
- `openCommitmentStartDate`, when present, must be on or before the projection start.
- The resolver normally expands rules from the projection start. An explicit `openCommitmentStartDate` may widen expansion so unresolved earlier commitments can forecast at `asOfDate`.
- If `recurrence.startDate` is after the projection window end, the transaction generates no occurrences for that projection run.
- `recurrence.endDate` (if present) must be ≥ `recurrence.startDate`

### 9.3 Numeric Constraints

- `startingBalance` can be any number (positive, negative, or zero)
- `amount` in transactions must be positive (sign determined by transactionTypeId)
- `value` in periodicChange must be non-zero; negative values represent a
  decrease.

### 9.4 Enum Validation

- `type` in accounts must match a valid accountTypes entry
- `changeMode` must be 1 or 2
- `changeType` must be 1–7
- All lookup references must exist in `assets/lookup-data.json`

---

## 10.0 Comparison Table: Required vs Optional

| Entity | Field | Required | Can Be Null | Can Be Empty |
|--------|-------|----------|-------------|--------------|
| Scenario | id | ✓ | ✗ | ✗ |
| Scenario | accounts | ✓ | ✗ | ✗ |
| Scenario | transactions | ✓ | ✗ | ✓ |
| Scenario | transactionOccurrences | ✓ | ✗ | ✓ |
| Scenario | baselinePeriods | ✓ | ✗ | ✓ |
| Account | periodicChange | ✗ | ✓ | ✗ |
| Transaction | periodicChange | ✗ | ✓ | ✗ |
| TransactionOccurrence | actualAmount | Actual only | ✓ | ✗ |
| Recurrence | endDate | ✗ | ✓ | ✗ |
| PeriodicChange | customCompounding | ✗ | ✓ | ✗ |

---

## 11.0 Version History

| Date | Version | Changes |
|------|---------|----------|
| 2026-08-02 | 3.0 | Introduced schemaVersion 44 transaction occurrences, baseline-period metadata, durable migration reports, and projection stale/current provenance; removed stored budgets, budget windows, rule actual status, and projection source selection |
| 2026-08-02 | 2.1 | Added the schemaVersion 43 resolved-occurrence compatibility contract, stable occurrence identity, baseline/current/actual fields, generated-snapshot override intent, and persisted as-of/open-commitment projection settings; projection source is now compatibility-only |
| 2026-02-22 | 2.0 | Proposed workflow-based schema targeting `schemaVersion = 43`: scenarios simplified; added scenario `version` and `lineage`; projection config moved under `scenario.projection.config`; added `uiState` with workflow + per-card period view settings; added projection source semantics (`transactions` vs `budget`) |
| 2026-02-12 | 1.1 | All LookupReferences must be numeric IDs only (no objects, no names) |
| 2026-02-12 | 1.0 | Initial formal schema definition |
