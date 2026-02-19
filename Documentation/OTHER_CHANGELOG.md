# Changelog

All notable changes to FTrack will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Advanced Goal Solver scenario type with a multi-goal Generate Plan flow

- Documentation coverage for goal planning and debt repayment
  - Goal Planning user guide
  - Debt Repayment user guide
  - Goal Planning and Debt Repayment concept references

- Debt Repayment scenario type with Summary Cards component
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

### Changed
- Projection engine now tracks interest separately in dedicated field
- Summary cards load after projections for accurate data
- Interest earned displays in green, interest paid in red (negative)
- First scenario auto-selects on app load
- Projection expenses now show as negative values in red
- Forecast grids preserve Group By selection (and scroll or sort where supported) across reloads
- Documentation file naming normalized to consistent category prefixes
- Home page documentation links use the docs viewer deep links

### Fixed
- Interest calculation accuracy in summary cards
- Projection interest tracking as income/expense
- Summary cards display timing on initial load
- Scenario selection on first load
- Documentation navigation defaults updated to match renamed document IDs

## [0.8.5-beta] - 2026-02-19

### Added

- Refresh buttons added to remaining forecast accordions
  - Generate Plan
  - Summary

### Changed

- Budget and Projections period navigation now filters in-place (no full grid reload)

### Fixed

- Account selectors no longer include an "All Accounts" option and now default to the first account
- Scenario-specific Secondary Account dropdown lists in Transactions and Budget
- Goal-based planner accepts and persists goalAmount as 0 when goal amount is not touched
- Summary accordions refresh reloads scenario data from disk

## [0.8.4-beta] - 2026-02-17

### Added

- User documentation for Budget workflow, Funds scenarios, and Import and Export
- Overview guidance for choosing scenario types and goal planning modes

### Changed

- Documentation navigation and deep links standardized to `#repo-docs/<docId>`

## [0.8.3-beta] - 2026-02-17

### Fixed

- Scenario setup reliability and grid refresh after scenario type and period type changes
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
