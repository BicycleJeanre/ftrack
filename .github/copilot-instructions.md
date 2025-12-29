# GitHub Copilot Instructions for FTrack

**Version**: 2.2.0  
**Last Updated**: December 29, 2025  
**Purpose**: Rule-based guidelines for GitHub Copilot when working on FTrack

**Project Context**: Electron-based financial tracking app using vanilla JavaScript, schema-driven architecture, JSON file storage.

---

## 1. Core Technology Rules

1.1. Use Electron 37.2.1 with `nodeIntegration: true` and `contextIsolation: false`
1.2. Use vanilla JavaScript (ES6+ modules) - no frameworks
1.3. Use custom CSS only - no CSS frameworks
1.4. Use JSON files for data storage at `/assets/app-data.json`
1.5. Use schema files in `/assets/` to configure grid behavior

## 2. NEVER Use

2.1. UI frameworks (React, Vue, Angular, Svelte, Solid)
2.2. CSS frameworks (Bootstrap, Tailwind, Material UI, Bulma)
2.3. Utility libraries (jQuery, Lodash, Underscore)
2.4. Build tools (Webpack, Vite, Rollup) unless explicitly needed
2.5. TypeScript or type systems
2.6. State management libraries (Redux, Zustand, MobX)
2.7. Backend APIs, databases, or servers (offline-first app)

## 3. ALWAYS Use

3.1. `EditableGrid` component for all tabular data (in `/js/editable-grid.js`)
3.2. `Modal` component for popup dialogs (in `/js/modal.js`)
3.3. Existing CSS classes from design system (`.bg-main`, `.text-main`, `.bordered`, `.rounded`, `.shadow-lg`, `.shadow-md`, `.pointer`, `.flex-between`, `.btn`)
3.4. Global helpers: `window.getEl(id)`, `window.add(parent, child)`, `window.toggleAccordion(id)` from `/js/global-app.js`
3.5. `async/await` for asynchronous operations
3.6. `try-catch` blocks for error handling
3.7. `process.cwd()` for file paths
3.8. `loadGlobals()` at the start of each page module
3.9. Shortcuts config module: `loadConfig()`, `getShortcut(module, action)`, `matchShortcut(event, shortcut)` from `/js/config.js`
3.10. Keyboard shortcuts from `/assets/shortcuts.json` - NEVER hardcode key bindings

## 4. Design Pattern Rules

4.1. NEVER change existing design patterns without explicit user request
4.2. ALWAYS reuse existing components before creating new ones
4.3. ALWAYS check if `EditableGrid`, `Modal`, or global helpers can be used
4.4. Follow the page controller pattern for all new pages (5-step structure)
4.5. Follow the file-based persistence pattern: Read entire file → Parse JSON → Modify in memory → Write entire file

## 5. Design System Rules

5.1. NEVER introduce new colors without updating the copilot instructions
5.2. Use only approved colors: Background `#181a1b - #232a23`, Text `#ededed`, Accent `#b6ff00`, Border `#232a23`, Surface `#202223`
5.3. Use typography scale: Base 18px, Headers 1.22em, Modal headers 1.18em, Inputs 1.08em, Navigation 1.04em
5.4. Use font stack: `'Inter', 'Segoe UI', Arial, sans-serif`
5.5. Use spacing standards: Table cells `6px 8px`, Inputs `12px 14px`, Accordion `18px 20px`, Modal `4vw 2vw`
5.6. Use border radius standards: Default 12px, Inputs 6px, Buttons 8px, Tags 16px
5.7. Use shadow standards: `.shadow-lg` for `0 8px 40px rgba(0,0,0,0.18)`, `.shadow-md` for `0 4px 16px rgba(0,0,0,0.12)`

## 6. File Organization Rules

6.1. JavaScript modules go in `/js/[name].js`
6.2. HTML pages go in `/pages/[name].html`
6.3. Grid schemas go in `/assets/[name]-grid.json`
6.4. All data goes in `/assets/app-data.json`
6.5. CSS goes in `/styles/app.css`
6.6. SVG icons go in `/styles/icons.js`
6.7. Technical documentation goes in `/Documentation/TECHNICAL_DOCUMENTATION.md`

## 7. EditableGrid Component Rules

7.1. Use `EditableGrid` for all tables/grids
7.2. Supported column types: `text`, `number`, `select`, `addSelect`, `modal`, `tags`, `checkbox`, `exclusive`, `date`
7.3. When adding new column types
&nbsp;&nbsp;&nbsp;&nbsp;7.3.1. Add case to `createTableRows()`
&nbsp;&nbsp;&nbsp;&nbsp;7.3.2. Add case to `handleSave()`
&nbsp;&nbsp;&nbsp;&nbsp;7.3.3. Add CSS styling if needed
7.4. Constructor requires: `targetElement`, `tableHeader`, `schema`, `data`, `onSave`
7.5. Optional params: `onDelete`, `parentRowId`, `parentField` (for nested grids)
7.6. Excel-like navigation enabled by default: Arrow keys, Tab/Shift+Tab, Enter, F2, Escape
7.7. Cell selection highlights current cell with `.cell-selected` CSS class

## 8. Keyboard Shortcuts Rules

8.1. NEVER hardcode keyboard shortcuts in components
8.2. ALWAYS define shortcuts in `/assets/shortcuts.json`
8.3. Load shortcuts with `await loadConfig()` before first use
8.4. Check shortcuts with `matchShortcut(event, getShortcut('Module', 'action'))`
8.5. Group shortcuts by module name (e.g., `EditableGrid`, `Global`)
8.6. Use modifier format: `Meta+Shift+A`, `Control+S`, `Alt+Enter`
8.7. Arrow keys: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`
8.8. Special keys: `Enter`, `Escape`, `Tab`, `Delete`, `F2`

## 9. Data Persistence Rules

9.1. Read files using `fs.readFile(process.cwd() + '/path', 'utf8')`
9.2. Write files using `fs.writeFile(path, JSON.stringify(data, null, 2), 'utf8')`
9.3. ALWAYS wrap file operations in try-catch blocks
9.4. ALWAYS read entire `app-data.json`, modify in memory, then write back
9.5. Log success with `console.log('[Save] Success')`
9.6. Log errors with `console.error('[Save] Failed:', err)`

## 10. Page Controller Pattern Rules

10.1. Follow this 5-step structure for all pages
&nbsp;&nbsp;&nbsp;&nbsp;10.1.1. Build UI container with `buildGridContainer()` - create accordion header, content area, table container
&nbsp;&nbsp;&nbsp;&nbsp;10.1.2. Define `onSave()` callback for persistence
&nbsp;&nbsp;&nbsp;&nbsp;10.1.3. Load schema and data with `createGridSchema()` - read schema file, read data file, return config object
&nbsp;&nbsp;&nbsp;&nbsp;10.1.4. Render grid with `loadTable()` - instantiate `EditableGrid`, call `render()`
&nbsp;&nbsp;&nbsp;&nbsp;10.1.5. Execute: `loadGlobals()` → build container → create schema → load table

## 11. Code Quality Rules

11.1. Provide complete, runnable code - not pseudo-code
11.2. Include imports at the top
11.3. Use actual file paths in references
11.4. Add inline comments for complex logic
11.5. Use proper indentation and style
11.6. Keep responses concise - no long explanations when code example is sufficient
11.7. Reference actual paths: "Update line 45 in /js/editable-grid.js" not "Update the grid file"
11.8. When applying instructions from this file, list the instruction numbers at the end of the response

## 12. Documentation Update Rules

12.1. NEVER create documentation for individual modules or changes
12.2. ALWAYS update `/Documentation/TECHNICAL_DOCUMENTATION.md` when
&nbsp;&nbsp;&nbsp;&nbsp;12.2.1. Adding new components or modules
&nbsp;&nbsp;&nbsp;&nbsp;12.2.2. Changing architecture patterns
&nbsp;&nbsp;&nbsp;&nbsp;12.2.3. Modifying data structures
&nbsp;&nbsp;&nbsp;&nbsp;12.2.4. Adding new column types
&nbsp;&nbsp;&nbsp;&nbsp;12.2.5. Changing the design system
12.3. ALWAYS update `.github/copilot-instructions.md` when
&nbsp;&nbsp;&nbsp;&nbsp;12.3.1. New coding patterns are established
&nbsp;&nbsp;&nbsp;&nbsp;12.3.2. New rules are confirmed by user
&nbsp;&nbsp;&nbsp;&nbsp;12.3.3. Project constraints change
12.4. Keep documentation simple and concise - avoid duplication
12.5. Reference, don't repeat - link to detailed docs rather than duplicating
12.6. Use legal numbering (decimal outline format) for all documentation
12.7. Use non-breaking spaces (`&nbsp;`) for proper indentation in Markdown files

## 13. Self-Update Rules

13.1. Suggest updates to these instructions when patterns emerge or user requests changes
13.2. ALWAYS get user confirmation before updating this file
13.3. When suggesting updates: Explain what rule should be added, why it's beneficial, show example, ask for confirmation
13.4. When updating: Increment version (PATCH for clarifications, MINOR for new rules, MAJOR for breaking changes), update "Last Updated" date, summarize changes

## 14. Standard Workflows

14.1. Git Commit & Push
&nbsp;&nbsp;&nbsp;&nbsp;14.1.1. Analyze all changes (staged and unstaged) using `get_changed_files`
&nbsp;&nbsp;&nbsp;&nbsp;14.1.2. Create detailed commit message based on changes
&nbsp;&nbsp;&nbsp;&nbsp;14.1.3. Stage all changes with `git add .`
&nbsp;&nbsp;&nbsp;&nbsp;14.1.4. Commit with message using `git commit -m "message"`

## 15. Adding New Pages Checklist

15.1. Create HTML in `/pages/[name].html` with proper structure
15.2. Create module in `/js/[name].js` using page controller pattern
15.3. Create schema in `/assets/[name]-grid.json`
15.4. Add data array to `/assets/app-data.json`
15.5. Add navigation link in `/js/navbar.js`
15.6. Test CRUD operations

## 16. Modifying Features Checklist

16.1. Before changes
&nbsp;&nbsp;&nbsp;&nbsp;16.1.1. Read relevant code files
&nbsp;&nbsp;&nbsp;&nbsp;16.1.2. Check schema definitions
&nbsp;&nbsp;&nbsp;&nbsp;16.1.3. Review data structure in `/assets/app-data.json`
&nbsp;&nbsp;&nbsp;&nbsp;16.1.4. Verify design system compliance
&nbsp;&nbsp;&nbsp;&nbsp;16.1.5. Check for reusable components
16.2. After changes
&nbsp;&nbsp;&nbsp;&nbsp;16.2.1. Test in Electron app
&nbsp;&nbsp;&nbsp;&nbsp;16.2.2. Verify data persists correctly
&nbsp;&nbsp;&nbsp;&nbsp;16.2.3. Check console for errors
&nbsp;&nbsp;&nbsp;&nbsp;16.2.4. Update `/Documentation/TECHNICAL_DOCUMENTATION.md` if needed
&nbsp;&nbsp;&nbsp;&nbsp;16.2.5. Update this file if new patterns emerged

## 17. Current Feature Status

17.1. Completed: home, accounts, transactions, forecast pages; EditableGrid (9+ column types with Excel-like navigation); Modal; schema-driven rendering; file-based persistence; keyboard shortcuts system
17.2. Not Implemented: forecast generation, interest calculations, recurrence processing, data validation, export/import

---

**For comprehensive technical details**, see: `/Documentation/TECHNICAL_DOCUMENTATION.md`
