# Technical Overview & Index

**Start Here.** This document serves as the entry point for AI Agents and Developers understanding the `ftrack` codebase.

## 1.0 Project Scope
`ftrack` is a specialized financial tracking application running on Electron. It focuses on Scenario-based transactions (e.g., separating "Actuals" from "Forecasts") to allow for financial modeling.

## 2.0 Core Tech Stack
- **Runtime**: Electron
- **Language**: JavaScript (ES6 Modules)
- **UI Component Library**: Tabulator 6.3 (strictly used for all data grids)
- **Data persistence**: Local JSON files (No SQL/Cloud).

## 3.0 Documentation Map
The technical documentation is modularized. Read the specific section required for your task:

### [1. Architecture >](TECH_ARCHITECTURE.md)
**Read this if:** You are refactoring, adding new managers, or need to understand the data flow between UI and Disk.
*Covers: Layered pattern, Manager classes, Directory structure.*

### [2. Data Model >](TECH_DATA_MODEL.md)
**Read this if:** You are modifying database schemas, dealing with `app-data.json`, or changing lookups (Currencies/Types).
*Covers: JSON Schemas, Entity Relationships, `DataStore` API.*

### [3. UI & Workflow >](TECH_UI_LAYER.md)
**Read this if:** You are changing the Grid visualizations, editing `forecast.js`, or working on the frontend logic.
*Covers: Tabulator implementation, GridFactory, Event Handling.*

### [4. Goal-Based Planning >](TECH_GOAL_PLANNING.md)
**Read this if:** You are adding or refining the goal-based scenario type and calculations.
*Covers: Parameters, calculation modes, and formulas.*

## 4.0 Data Migration Strategy
FTrack uses versioned data migrations to evolve the schema while preserving user data. The migration system automatically detects and applies necessary updates when the application starts.

**Migration File**: [js/data-migration.js](../js/data-migration.js)

**Current Migration Version**: 3

**Migration Workflow**:
1. On application startup, `needsMigration()` checks if `migrationVersion < 3`
2. If needed, `migrateAllScenarios()` applies all sequential migrations
3. Migration version is updated in `app-data.json`

**Applied Migrations**:
- **v1**: Unified transactions (converted `plannedTransactions`/`actualTransactions` to single `transactions` array)
- **v2**: Added `budgets` array to scenarios
- **v3**: Migrated account `balance` field and recurrence structure format

**Adding New Migrations**:
1. Create migration function in `data-migration.js`
2. Add to `migrateAllScenarios()` sequence
3. Increment target migration version
4. Test with old data format to ensure backward compatibility

## 5.0 Quick Start Reference
- **Entry Point**: `main.js` (Electron Main Process).
- **Frontend Entry**: `pages/forecast.html` -> `js/global-app.js`.
- **Primary Logic**: `js/forecast.js`.
- **Key Asset**: `assets/lookup-data.json` (Static definitions).

## 6.0 Development Rules
1. **No External Databases**: Keep `DataStore` logic.
2. **Tabulator Only**: Do not introduce new UI libraries for tables.
3. **Manager Pattern**: Do not write file I/O code in UI files. Use a Manager.

## 7.0 Styling System
- **Single Source**: All UI theming lives in `styles/app.css`; inline styles are forbidden.
- **Layout Tokens**: Use `control-layout*`, `grouping-control`, and `period-filter` classes for filter bars and toolbars.
- **Modals**: Reuse `modal-overlay` + `modal-content` with size helpers (`modal-text-input`, `modal-periodic`, `modal-recurrence`, `modal-shortcuts`). Buttons use the `modal-periodic-*` and `shortcuts-*` utility classes.
- **Tables & Grids**: Recurrence badges and Tabulator overrides rely on `.recurrence-cell` and Tabulator theme variables—do not embed style attributes in formatters.
- **Buttons**: Prefer semantic button variants (`btn`, `btn-primary`, `btn-ghost`) instead of per-element padding or colors.
