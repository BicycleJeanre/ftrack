# Technical Overview & Index

**Start Here.** This document serves as the entry point for AI Agents and Developers understanding the `ftrack` codebase.

## 1.0 Project Scope

FTrack is a web-based financial tracking and forecasting application. It focuses on scenario-based planning, allowing users to model multiple financial futures ("What if I save $500/month?") without affecting their baseline data.

**Core Features**:
- Multi-scenario financial modeling
- Transaction planning (planned vs. actual)
- Automated projections with periodic changes
- Goal-based scenario planning
- Budget tracking
- Data export/import

## 2.0 Core Tech Stack

**Runtime**: Modern web browser (Chrome, Firefox, Safari, Edge)  
**Language**: JavaScript (ES6 Modules)  
**UI Framework**: Tabulator 6.3 (data grids)  
**Storage**: Browser localStorage  
**Dependencies**: Minimal (2 libraries)

**No External Dependencies For**:
- Financial calculations (pure JavaScript)
- Date manipulation (native Date API)
- State management (in-memory objects)
- Persistence (localStorage API)

## 3.0 User Documentation
The application includes comprehensive user-facing documentation accessible from the navbar and home page. The documentation uses a single-page panel system for smooth navigation.

**Location**: [pages/documentation.html](../pages/documentation.html)  
**Panel Manager**: [js/doc-panel.js](../js/doc-panel.js)

**Architecture**: 
- Single HTML page with all documentation sections embedded as `.doc-panel` divs
- Left sidebar with `.doc-panel-link` navigation (following navbar pattern)
- Center panel area (`.doc-panel-content`) showing active section
- JavaScript controller handles panel switching without page navigation

**Documentation Sections**:
1. **Getting Started** → Setup first budget and scenarios
2. **Accounts** → Account types, balances, and management
3. **Transactions** → Planned and actual transactions
4. **Projections** → Understanding financial forecasts
5. **Recurrence** → Setting up repeating transactions
6. **Periodic Changes** → Automatic adjustments (raises, inflation)
7. **Scenarios** → Multi-scenario planning
8. **Keyboard Shortcuts** → Quick keyboard reference
9. **Glossary** → Financial and app terminology
10. **FAQ** → Common questions and troubleshooting

**Key Design Pattern**:
- Sidebar navigation with `.active` state highlighting (matches navbar pattern with left border and accent color)
- Content panels stored as hidden divs until activated
- Smooth fade-in animation (`fadeIn` keyframe) when switching panels
- Responsive: Sidebar converts to grid buttons on mobile
- Sticky sidebar on desktop, static on mobile

**Navigation Flow**:
- Home page displays documentation cards as entry points
- Clicking a card or navbar Documentation link opens `documentation.html`
- Sidebar links trigger panel switching via `doc-panel.js`
- No full page reloads after initial page load

## 3.1 Documentation Navigation Pattern

## 4.0 Documentation Index (Technical)
The technical documentation is modularized. Read the specific section required for your task:

### [1. Architecture >](TECH_ARCHITECTURE.md)
**Read this if:** You are refactoring, adding new managers, or need to understand the data flow between UI and Disk.
*Covers: Layered pattern, Manager classes, Directory structure.*

### [2. Data Schema >](TECH_DATA_SCHEMA.md)
**Read this if:** You are modifying scenario/account/transaction structures or lookup-backed fields.
*Covers: JSON schema fields, required vs optional properties, lookup references.*

### [3. UI & Workflow >](TECH_UI_LAYER.md)
**Read this if:** You are changing the Grid visualizations, editing the Forecast controller, or working on the frontend logic.
*Covers: Tabulator implementation, GridFactory, Event Handling.*

### [4. Advanced Goal Solver >](USER_ADVANCED_GOAL_SOLVER.md)
**Read this if:** You are working on multi-goal planning, constraints, or solver outputs.
*Covers: Definitions and guided use cases for solver configuration.*

## 5.0 Data Migration Strategy

FTrack uses a versioned storage schema (`schemaVersion`). This build targets **schemaVersion 43** and **does not perform runtime migrations**.

### 5.1 Runtime rule

- Runtime code requires `schemaVersion === 43`.
- If older data is present (legacy export or legacy local storage), the app will fail fast rather than attempting in-app migration.

### 5.2 Standalone migration (QC-only)

Legacy exports can be converted using the standalone migration utility:

- `QC/migrate-app-data-to-schema43.js`

Example usage:

```bash
node QC/migrate-app-data-to-schema43.js --input legacy.json --output schema43.json
```

The runtime application must not import or depend on QC migration code.

## 6.0 Quick Start Reference

**Entry Point**: `index.html` → redirects to `pages/forecast.html`  
**Main Controller**: `js/ui/controllers/forecast-controller.js`  
**Calculation Engine**: `js/domain/calculations/calculation-engine.js`  
**Storage**: `js/app/services/storage-service.js`  
**Configuration**: `assets/lookup-data.json`

### 6.1 Hosting Notes

1. **GitHub Pages**: When hosted under a repository subpath, asset URLs must be resolved relative to the current page to avoid dropping the base path.
2. **Empty or corrupt storage**: On startup, storage reads should fall back to an empty scenarios list so the UI can render and allow creating the first scenario.

**Development Server**:
```bash
npm start                    # Start development server on port 3000
npm run qc:full             # Run full QC verification and tests
```

## 7.0 Development Rules

**Architecture**:
1. Follow clean layered architecture (see [TECH_ARCHITECTURE.md](TECH_ARCHITECTURE.md))
2. All calculations must go through the Calculation Engine
3. UI code never contains business logic
4. Use managers for business operations

**Code Organization**:
1. **No calculations in UI layer** - use `domain/calculations/`
2. **Tabulator only** - do not introduce alternative grid libraries
3. **Pure functions** - domain calculations must be pure (no side effects)
4. **Single responsibility** - each module has one clear purpose

**Data**:
1. **Browser localStorage only** - no external databases
2. **localStorage quota** - monitor and manage storage limits
3. **Atomic writes** - all data updates are complete or rolled back

## 8.0 Styling System
- **Single Source**: All UI theming lives in `styles/app.css`; inline styles are forbidden.
- **Layout Tokens**: Use `control-layout*`, `grouping-control`, and `period-filter` classes for filter bars and toolbars.
- **Modals**: Reuse `modal-overlay` + `modal-content` with size helpers (`modal-text-input`, `modal-periodic`, `modal-recurrence`, `modal-shortcuts`). Buttons use the `modal-periodic-*` and `shortcuts-*` utility classes.
- **Tables & Grids**: Recurrence badges and Tabulator overrides rely on `.recurrence-cell` and Tabulator theme variables—do not embed style attributes in formatters.
- **Buttons**: Prefer semantic button variants (`btn`, `btn-primary`, `btn-ghost`) instead of per-element padding or colors.
