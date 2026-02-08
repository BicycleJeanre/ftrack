# Repo Analysis Report - 2026-02-08

## 4.2 Executive Summary (max 5 bullets)
- Docs navigation is currently inconsistent: Home links point to removed hash-sections, so users won’t deep-link into docs as intended.
- Technical docs have broken links (missing files) and stale migration/version details.
- Data migration versioning is drifted across code/docs (v3 vs v4), which raises persisted-data correctness risk.
- Forecast refactor is a net maintainability win (modularized grids), but a few integration/version mismatches remain.
- Electron security/runtime settings are permissive and inconsistent with the presence of a preload bridge.

## 4.3 Scope and Diff Context (max 5 bullets)
- Branch: `refactor/cleanup-code`
- Compare targets used: `main..HEAD` (also checked `dev..HEAD` summary; dev exists)
- Key areas touched: docs system (manifest-driven), forecast modularization, data migration + lookup updates
- Persisted data risk: **Yes** (migration version + account field migrations)

## 4.4 Findings

### 4.4.1 Documentation
- [H] pages/home.html: Home “Get Started” + doc cards link to `documentation.html#<section>` which no longer exists in pages/documentation.html -> update links to `documentation.html#repo-docs/<docId>` (e.g. `user_getting_started`, `concepts_accounts`) and remove/replace the FAQ card since no FAQ doc is in the manifest.
- [H] Documentation/TECH_OVERVIEW.md: Links to missing `TECH_DATA_MODEL.md` and `TECH_GOAL_PLANNING.md` -> either restore those docs or update the index to point to existing equivalents (and ensure the docs-manifest includes them).
- [M] Documentation/other_shortcuts.md: Documented shortcuts (Cmd+Shift+A, settings, etc.) don’t match implemented shortcuts in js/keyboard-shortcuts.js -> update shortcut docs to match actual bindings (ctrl+n, ctrl+s, ?, etc.).

### 4.4.2 Codebase Cleanup
- [H] js/data-manager.js: `migrationVersion: 3` sample data conflicts with migration logic targeting v4 in js/data-migration.js and the tech doc’s v3 claim in Documentation/TECH_OVERVIEW.md -> define a single source-of-truth migration version and update all three.
- [M] main.js: `nodeIntegration: true`, `contextIsolation: false`, `webSecurity: false` despite having a preload bridge in preload.js -> either commit to the preload model (tighten these flags) or remove the unused bridge pattern to reduce confusion/risk.
- [L] scripts/generate-docs-manifest.mjs: Manifest includes `generatedAt`, making regeneration always produce diffs -> consider optional “stable mode” (omit timestamp) to reduce churn.

### 4.4.3 Logic and Design Reuse
- [L] scripts/generate-docs-manifest.mjs: Notebook-to-markdown conversion logic is duplicated with js/doc-repo-manifest.js -> extract shared behavior spec (or accept duplication explicitly since Node vs browser environments differ).

### 4.4.4 Logic and Design Implementation
- [M] pages/forecast.html: Tabulator is loaded from CDN at `6.2.0` while package.json declares `tabulator-tables ^6.3.1` -> align the runtime-loaded version to avoid subtle grid behavior mismatches.
- [M] js/forecast.js: Migrations run on Forecast page load (not app startup) -> confirm this is intended, or move migration trigger earlier so all pages see a consistent schema.

### 4.4.5 Design Standards
None.

### 4.4.6 Application Design and User Features
- Feature inventory (max 5 bullets)
  - Scenario CRUD and scenario-type selection (Budget/General/Funds/Debt Repayment/Goal-Based) via grid UI.
  - Accounts, transactions, budgets, projections rendered with Tabulator grids on Forecast.
  - Projections generation/clearing + totals toolbars.
  - Export/Import + theme toggle in navbar.
  - Manifest-driven in-app documentation viewer (Markdown rendered client-side).
- Regressions/removals (must be explicitly flagged)
  - [REGRESSION] pages/home.html: Home doc deep-links target removed doc-panel sections -> users land on docs page but not the intended document -> update to new `#repo-docs/<docId>` scheme or restore section-based panels.

## 4.5 Recommended Actions (Top 5, prioritized)
- pages/home.html: Update all documentation links to `documentation.html#repo-docs/<docId>` and remove/replace the FAQ card if no FAQ doc is shipped.
- Documentation/TECH_OVERVIEW.md: Fix broken technical index links (restore missing docs or update to existing docs), and update migration version text.
- js/data-manager.js + js/data-migration.js: Unify migration versioning (single constant) and update sample/schema expectations accordingly.
- Documentation/other_shortcuts.md: Update shortcut documentation to match js/keyboard-shortcuts.js.
- pages/forecast.html: Align Tabulator runtime version with declared dependency (or document why CDN pin differs).

## 4.6 Items Already Optimal (max 5 bullets)
- Forecast refactor into js/forecast modules reduces the single-file hotspot and makes grid responsibilities clearer.
- Docs are now centralized under Documentation and surfaced via a generated manifest in assets/docs-manifest.json, which is a clean in-app docs approach.
- Repo prompt workflows in .github/prompts are well-scoped and consistent.
