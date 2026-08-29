# Changelog

All notable changes to FTrack will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Added an in-app Data Upgrade Review for uploaded JSON and raw browser data.
  - Upgrades are prepared and validated in memory before stored data changes.
  - Every added, changed, and removed field is grouped with its reason.
  - Complete change reports and upgraded JSON can be downloaded before apply.
  - Validation failures and future schema versions cannot be applied.
  - Legacy browser data is intercepted at startup and remains unchanged until
    the user approves the reviewed upgrade.
  - Validation failures caused by lossless legacy numeric strings or
    deterministically recoverable required fields now offer a Preview Safe
    Repairs action, with exact changes shown before apply.
  - Legacy imports can reconstruct missing currency from one unambiguous app
    currency, empty descriptions from transaction account names, and Yearly
    month/day fields from the saved recurrence start date.
  - Historical migration notes are separated from active validation failures,
    while the complete recovery audit remains available in the change report.
  - Valid browser data can now deterministically relink migrated manual
    occurrences to proven recurring rules and scheduled dates. Notes that cannot
    be resolved without guessing remain visible and retained.
  - Added paged review for retained converted-to-manual transactions. Each can
    be confirmed as manual, removed, or explicitly linked to a recurring rule
    and generated date, with validation and a change preview before apply.
  - Applied recovery decisions close the active note, retain a durable
    resolution history, and mark projections stale when financial plan content
    changes.
- Completed the schemaVersion 44 unified **Plan & Actuals** workflow.
  - Budget is now a live Period view over resolved plan occurrences rather
    than a separately generated dataset.
  - Recurring Plan Rules and dated planned/actual occurrences share one
    component in Budget, General, Funds, Debt Repayment, and Goal Workshop.
  - Projections always consume actuals plus the latest remaining resolved plan;
    the transaction-versus-budget source choice and Budget generation step are
    removed.
  - Plan Rules (Detail) and Plan & Actuals (Detail) now render genuine,
    lifecycle-managed tables rather than reusing summary cards.
  - Baseline, current plan, actual, forecast contribution, and variance remain
    directly comparable, including unplanned actuals and history-safe series
    changes.
  - Cross-workflow refreshes are coalesced and serialized with scenario and
    workflow navigation.
- Introduced the schemaVersion 43 resolved-plan compatibility layer for the unified Budget, Transactions, Actuals, and Projections workflow.
  - Projections now combine actuals, latest planned occurrences, manual occurrences, recurring rules, and skips through one canonical occurrence resolver.
  - The legacy projection source setting remains readable but no longer changes calculation results.
  - Newly generated Budget snapshots distinguish untouched generated rows from true occurrence overrides, so resolved projections are not pinned by stale copies.
  - Legacy actual transactions replace matching planned occurrences; regeneration preserves explicit overrides and skipped entries.
  - Projection date-policy values are calendar-validated before storage or migration.
  - Funds contribution, redemption, and ownership calculations now use the same resolved occurrences as projections.
  - Optional as-of and open-commitment history boundaries persist with projection configuration.
  - Capital and interest buckets reconcile to edited occurrence amounts.
  - QC now surfaces resolver diagnostics and includes the Advanced Goal Solver projection workflow.
- Consolidated Goal-Based and Advanced Goal Solver into a single **Goal Workshop** workflow with Simple and Advanced mode toggle.
  - Mode is persisted per scenario via `scenario.planning.goalWorkshopMode`; auto-detected from existing AGS goals for migrated scenarios.
  - Existing scenario data is fully backward-compatible; no migration script required.

## [0.8.5-beta] - 2026-02-28

### Added

- Advanced Goal Solver workflow with a multi-goal Generate Plan flow
- Documentation coverage for goal planning and debt repayment
  - Goal Planning user guide
  - Debt Repayment user guide
  - Goal Planning and Debt Repayment concept references
- Debt Repayment workflow with Summary Cards component
  - Per-account summary cards showing starting balance, projected end, interest earned/paid
  - Zero crossing date tracking (when debt balance reaches $0)
  - Account type filtering (All/Liability/Asset)
  - Overall total card when multiple accounts exist
- Projections toolbar with period filters and account filtering
- Interest field added to projection records for accurate tracking
- Theme switching system (dark/light) with persistent user preference
  - Navbar toggle button for easy theme switching
  - Automatic theme detection based on system color scheme preference
  - CSS custom properties enable theme-agnostic styling across all components
  - Light theme color palette optimized for readability and visual hierarchy
- Theme preference persisted to localStorage (`ftrack:theme`)
- Budget regeneration from projections preserves completed (actual) entries
- Budget toolbar totals renamed with descriptive sublabels
  - Realized Net, Planned Income, Planned Expenses, Planned Net Income, Open Commitments, Forecast Position, Unbudgeted Actuals
- Date handling convention documented in technical architecture reference

### Changed
- Projection engine now tracks interest separately in dedicated field
- Summary cards load after projections for accurate data
- Interest earned displays in green, interest paid in red (negative)
- First scenario auto-selects on app load
- Projection expenses now show as negative values in red
- Forecast grids preserve Group By selection (and scroll or sort where supported) across reloads
- Documentation file naming normalized to consistent category prefixes
- Home page documentation links use the docs viewer deep links
- Budget regeneration now uses same transaction expansion logic as projection engine, correctly handling recurring and non-recurring transactions

### Fixed
- Interest calculation accuracy in summary cards
- Projection interest tracking as income/expense
- Summary cards display timing on initial load
- Scenario selection on first load
- Documentation navigation defaults updated to match renamed document IDs
- Budget regeneration producing empty planned entries due to ID assignment bypass
- First period boundary shift caused by `new Date(str)` UTC parsing; replaced with `parseDateOnly` throughout

## [0.8.4-beta] - 2026-02-17

### Added

- User documentation for Budget workflow, Funds workflow, and Import and Export
- Overview guidance for choosing workflows and goal planning modes

### Changed

- Documentation navigation and deep links standardized to `#repo-docs/<docId>`

## [0.8.3-beta] - 2026-02-17

### Fixed

- Scenario setup reliability and grid refresh after workflow and period type changes
- Safer bootstrap when storage is empty or corrupt
- GitHub Pages asset loading when hosted under a repo subpath

## [0.8.2-beta] - 2026-02-17

### Added

- Variable-rate debt modeling using an account rate schedule

### Changed

- Forecast UI stability improvements for scenario-based modeling

## [0.7.0-beta] - 2026-02-01

### Added
- Periodic change functionality for accounts and transactions
  - Percentage rate mode with multiple compounding options
  - Fixed amount mode with scheduling (daily, weekly, monthly, quarterly, yearly)
  - Custom compounding frequency and period settings
  - Day of month and day of week scheduling for fixed amounts
- Periodic change utilities for display and calculations
- Enhanced projection engine to apply periodic changes correctly
- Comprehensive QC checklist (v2.0.0) with all application features
- Periodic change quick guide documentation
- Goal planning documentation
- Budget subtotal for planned net balance (Actual Net minus Planned Outstanding)

### Changed
- Refactored forecast page for improved periodic change integration
- Enhanced financial utilities with better periodic change calculations
- Improved modal styling for periodic change dialogs
- Updated example data to include periodic change samples
- Updated technical overview documentation

### Fixed
- Double-click import dialog issue in navbar
- Transaction saving and data flipping logic
- Accordion state (now closed on start)
- Budget occurrence type selector now persists Money In/Out changes correctly

## [0.6.2] - (Previous release)

### Note
- Prior version history to be documented from git history

---

## Version History

- **0.7.0-beta**: Periodic change feature, refactoring, ready for QC
- **0.6.2**: Previous stable release
- **0.6.1**: Previous release
- **0.6.0**: Previous release
- **0.5.0**: Previous release
- **0.4.0**: Previous release
- **0.3.0-alpha**: Early alpha release
