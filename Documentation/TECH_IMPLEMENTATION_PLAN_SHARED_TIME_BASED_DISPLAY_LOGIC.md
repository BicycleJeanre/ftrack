# Shared Time-Based Display Logic Refactor

Date: 2026-06-11
Status: Implementation plan, first slice in progress

## Objectives

- Move time-based transaction display decisions out of grid components.
- Make Transactions, Budget, Projections, and Funds consume the same period, occurrence, perspective-row, split-set, and totals semantics where applicable.
- Keep UI modules focused on rendering and interaction.
- Make future changes to recurring transaction display, account-scoped views, split-set visibility, and totals happen in one place.

## Current Problem

The app has useful low-level helpers, but it lacks a shared query/view-model layer.

- `expandTransactions` expands recurring planned transactions and actual dated transactions.
- `transformTransactionToRows` maps one canonical financial entry to account-perspective rows.
- `data-aggregators` computes totals from rows.

The missing layer is: given a scenario, date range, account scope, split filters, and display mode, return the rows that the UI should display.

Because that layer is missing, grid files rebuild the same logic:

- Transactions summary and detail both construct perspective rows, hide or show split interest rows, enrich split totals, apply split filters, and group rows.
- Budget summary repeats the transaction perspective-row pattern after normalizing budget entries.
- Projection generation owns private split-set normalization and period window generation.
- Fund utilities expand and transform transactions independently.

## Target Architecture

### 1. Period Window Utilities

Create shared period helpers that own:

- period id normalization
- selected period lookup
- selected period index lookup
- date range extraction from a selected period
- date-range filtering by a row date field
- period boundary generation, eventually shared with projection generation

### 2. Transaction Occurrence Query

Create a scenario-level query that owns:

- planned vs actual date selection
- recurring expansion
- split-set source normalization before expansion
- transaction-like source selection from transactions or budgets
- consistent sorting by effective date

This should be usable by UI, projections, and fund calculations.

### 3. Financial Entry Display Rows

Create a reusable display-row builder that owns:

- canonical entry normalization
- account-perspective row generation
- account-scoped filtering
- default unscoped duplicate suppression
- split-set display rules:
  - hide interest rows in default views
  - hide interest leg from paying-account scoped views
  - show combined split total on the principal row
  - preserve interest rows when viewing the interest account
- split-set filter application
- optional grouping sort
- account-group label enrichment

### 4. Totals From Display Rows

Totals should consume the same display rows rendered by cards or tables.

This prevents mismatches where visible rows and totals are produced by similar but separate logic.

## Migration Plan

1. Extract shared period helpers.
2. Extract shared financial display-row helpers.
3. Migrate Transactions summary to the shared display-row helper.
4. Migrate Transactions detail to the same helper.
5. Migrate Budget summary totals and list row selection.
6. Migrate Budget detail filtering and row selection where applicable.
7. Extract projection split-source normalization from `projection-engine.js`.
8. Reuse the occurrence query in Funds utilities.
9. Add unit tests around the shared helpers before broadening each consumer.

## First Implementation Slice

This pass intentionally avoids changing persistence or projection math.

Deliverables:

- `js/shared/period-window-utils.js`
- `js/ui/queries/financial-entry-display-rows.js`
- Transactions summary/detail row selection migrated to the shared query.
- Budget summary row selection/totals migrated to the shared query.
- Focused unit tests for:
  - period id lookup
  - account-scoped perspective rows
  - split-set default visibility
  - split-set paying-account visibility
  - budget-like entry normalization through the shared query

## Follow-Up Slices

- Move projection period generation into the shared period module.
- Move projection split-set source normalization into a reusable domain query.
- Move Funds transaction expansion to the occurrence query.
- Move header/filter controls into shared UI components.
- Replace remaining direct callers that locally combine expansion, perspective rows, filters, and totals.

## Non-Goals For First Slice

- No schema changes.
- No accounting semantic changes.
- No projection engine behavior changes.
- No broad UI redesign.
- No deletion of legacy helpers until all current consumers are migrated.
