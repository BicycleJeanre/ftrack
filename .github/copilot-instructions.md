# GitHub Copilot Instructions for FTrack

**Version**: 2.0.0  
**Last Updated**: December 22, 2025  
**Purpose**: Rule-based guidelines for GitHub Copilot when working on FTrack

**Project Context**: Electron-based financial tracking app using vanilla JavaScript, schema-driven architecture, JSON file storage.

---

## Core Technology Rules

- Use Electron 37.2.1 with `nodeIntegration: true` and `contextIsolation: false`
- Use vanilla JavaScript (ES6+ modules) - no frameworks
- Use custom CSS only - no CSS frameworks
- Use JSON files for data storage at `/assets/app-data.json`
- Use schema files in `/assets/` to configure grid behavior

## NEVER Use

- UI frameworks (React, Vue, Angular, Svelte, Solid)
- CSS frameworks (Bootstrap, Tailwind, Material UI, Bulma)
- Utility libraries (jQuery, Lodash, Underscore)
- Build tools (Webpack, Vite, Rollup) unless explicitly needed
- TypeScript or type systems
- State management libraries (Redux, Zustand, MobX)
- Backend APIs, databases, or servers (offline-first app)

## ALWAYS Use

- `EditableGrid` component for all tabular data (in `/js/editable-grid.js`)
- `Modal` component for popup dialogs (in `/js/modal.js`)
- Existing CSS classes from design system (`.bg-main`, `.text-main`, `.bordered`, `.rounded`, `.shadow-lg`, `.shadow-md`, `.pointer`, `.flex-between`, `.btn`)
- Global helpers: `window.getEl(id)`, `window.add(parent, child)`, `window.toggleAccordion(id)` from `/js/global-app.js`
- `async/await` for asynchronous operations
- `try-catch` blocks for error handling
- `process.cwd()` for file paths
- `loadGlobals()` at the start of each page module

## Design Pattern Rules

- NEVER change existing design patterns without explicit user request
- ALWAYS reuse existing components before creating new ones
- ALWAYS check if `EditableGrid`, `Modal`, or global helpers can be used
- Follow the page controller pattern for all new pages (5-step structure)
- Follow the file-based persistence pattern: Read entire file → Parse JSON → Modify in memory → Write entire file

## Design System Rules

- NEVER introduce new colors without updating the copilot instructions
- Use only approved colors: Background `#181a1b - #232a23`, Text `#ededed`, Accent `#b6ff00`, Border `#232a23`, Surface `#202223`
- Use typography scale: Base 18px, Headers 1.22em, Modal headers 1.18em, Inputs 1.08em, Navigation 1.04em
- Use font stack: `'Inter', 'Segoe UI', Arial, sans-serif`
- Use spacing standards: Table cells `6px 8px`, Inputs `12px 14px`, Accordion `18px 20px`, Modal `4vw 2vw`
- Use border radius standards: Default 12px, Inputs 6px, Buttons 8px, Tags 16px
- Use shadow standards: `.shadow-lg` for `0 8px 40px rgba(0,0,0,0.18)`, `.shadow-md` for `0 4px 16px rgba(0,0,0,0.12)`

## File Organization Rules

- JavaScript modules go in `/js/[name].js`
- HTML pages go in `/pages/[name].html`
- Grid schemas go in `/assets/[name]-grid.json`
- All data goes in `/assets/app-data.json`
- CSS goes in `/styles/app.css`
- SVG icons go in `/styles/icons.js`
- Technical documentation goes in `/Documentation/TECHNICAL_DOCUMENTATION.md`

## EditableGrid Component Rules

- Use `EditableGrid` for all tables/grids
- Supported column types: `text`, `number`, `select`, `addSelect`, `modal`, `tags`, `checkbox`, `exclusive`, `date`
- When adding new column types: Add case to `createTableRows()`, add case to `handleSave()`, add CSS styling if needed
- Constructor requires: `targetElement`, `tableHeader`, `schema`, `data`, `onSave`
- Optional params: `onDelete`, `parentRowId`, `parentField` (for nested grids)

## Data Persistence Rules

- Read files using `fs.readFile(process.cwd() + '/path', 'utf8')`
- Write files using `fs.writeFile(path, JSON.stringify(data, null, 2), 'utf8')`
- ALWAYS wrap file operations in try-catch blocks
- ALWAYS read entire `app-data.json`, modify in memory, then write back
- Log success with `console.log('[Save] Success')`
- Log errors with `console.error('[Save] Failed:', err)`

## Page Controller Pattern Rules

Follow this 5-step structure for all pages:

1. Build UI container with `buildGridContainer()` - create accordion header, content area, table container
2. Define `onSave()` callback for persistence
3. Load schema and data with `createGridSchema()` - read schema file, read data file, return config object
4. Render grid with `loadTable()` - instantiate `EditableGrid`, call `render()`
5. Execute: `loadGlobals()` → build container → create schema → load table

## Code Quality Rules

- Provide complete, runnable code - not pseudo-code
- Include imports at the top
- Use actual file paths in references
- Add inline comments for complex logic
- Use proper indentation and style
- Keep responses concise - no long explanations when code example is sufficient
- Reference actual paths: "Update line 45 in /js/editable-grid.js" not "Update the grid file"

## Documentation Update Rules

- ALWAYS update `/Documentation/TECHNICAL_DOCUMENTATION.md` when:
  - Adding new components or modules
  - Changing architecture patterns
  - Modifying data structures
  - Adding new column types
  - Changing the design system
- ALWAYS update `.github/copilot-instructions.md` when:
  - New coding patterns are established
  - New rules are confirmed by user
  - Project constraints change
- Keep documentation simple and concise - avoid duplication
- Reference, don't repeat - link to detailed docs rather than duplicating

## Self-Update Rules

- Suggest updates to these instructions when patterns emerge or user requests changes
- ALWAYS get user confirmation before updating this file
- When suggesting updates: Explain what rule should be added, why it's beneficial, show example, ask for confirmation
- When updating: Increment version (PATCH for clarifications, MINOR for new rules, MAJOR for breaking changes), update "Last Updated" date, summarize changes

## Standard Workflows

### Git Commit & Push

When user requests `git` workflow:

1. Analyze all changes (staged and unstaged) using `get_changed_files`
2. Create detailed commit message based on changes
3. Stage all changes with `git add .`
4. Commit with message using `git commit -m "message"`

## Adding New Pages Checklist

1. Create HTML in `/pages/[name].html` with proper structure
2. Create module in `/js/[name].js` using page controller pattern
3. Create schema in `/assets/[name]-grid.json`
4. Add data array to `/assets/app-data.json`
5. Add navigation link in `/js/navbar.js`
6. Test CRUD operations

## Modifying Features Checklist

**Before changes**:
- Read relevant code files
- Check schema definitions
- Review data structure in `/assets/app-data.json`
- Verify design system compliance
- Check for reusable components

**After changes**:
- Test in Electron app
- Verify data persists correctly
- Check console for errors
- Update `/Documentation/TECHNICAL_DOCUMENTATION.md` if needed
- Update this file if new patterns emerged

## Current Feature Status

**Completed**: home, accounts, transactions pages; EditableGrid (9+ column types); Modal; schema-driven rendering; file-based persistence

**Not Implemented**: budget builder controller, forecast generation, interest calculations, recurrence processing, keyboard shortcuts, data validation, export/import

---

**For comprehensive technical details**, see: `/Documentation/TECHNICAL_DOCUMENTATION.md`
