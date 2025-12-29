# GitHub Copilot Instructions for FTrack

**Version**: 2.3.0  
**Last Updated**: December 29, 2025  
**Purpose**: AI behavior rules and coding guidelines for GitHub Copilot

**Project Context**: Electron-based financial tracking app using vanilla JavaScript, schema-driven architecture, JSON file storage.  
**Technical Reference**: See `/Documentation/TECHNICAL_DOCUMENTATION.md` for all project-specific technical details, component APIs, data structures, and architecture patterns.

---

## 1. Technology Constraints

1.1. Use Electron with vanilla JavaScript (ES6+ modules) - NO frameworks
1.2. Use custom CSS only - NO CSS frameworks
1.3. Use JSON files for data storage - NO databases
1.4. Offline-first application - NO backend APIs or servers

## 2. NEVER Use

2.1. UI frameworks (React, Vue, Angular, Svelte, Solid)
2.2. CSS frameworks (Bootstrap, Tailwind, Material UI, Bulma)
2.3. Utility libraries (jQuery, Lodash, Underscore)
2.4. TypeScript or type systems
2.5. State management libraries (Redux, Zustand, MobX)
2.6. Backend APIs, databases, or servers

## 3. Component Reuse Rules

3.1. ALWAYS reuse existing components before creating new ones
3.2. ALWAYS check if existing grid, modal, or helper utilities can be used
3.3. Check `/Documentation/TECHNICAL_DOCUMENTATION.md` for available components and their APIs
3.4. NEVER duplicate functionality that already exists

## 4. Design Pattern Rules

4.1. NEVER change existing design patterns without explicit user request
4.2. Follow established architectural patterns documented in technical documentation
4.3. Use async/await for asynchronous operations
4.4. Use try-catch blocks for error handling
4.5. Follow file-based persistence pattern: Read → Parse → Modify → Write

## 5. Code Quality Rules

5.1. Provide complete, runnable code - not pseudo-code
5.2. Include imports at the top
5.3. Use actual file paths in references
5.4. Add inline comments for complex logic only
5.5. Use proper indentation and style
5.6. Keep responses concise - no long explanations when code example is sufficient
5.7. Reference actual paths: "Update line 45 in [file.js](file.js)" not "Update the file"
5.8. When applying instructions from this file, list the instruction numbers at the end of the response

## 6. Keyboard Shortcuts Rules

6.1. NEVER hardcode keyboard shortcuts in components
6.2. ALWAYS define shortcuts in `/assets/shortcuts.json`
6.3. ALWAYS use config module for shortcut handling
6.4. See technical documentation for shortcut API and format specifications

## 7. Documentation Rules

7.1. NEVER create documentation for individual modules or changes
7.2. ALWAYS update `/Documentation/TECHNICAL_DOCUMENTATION.md` when
&nbsp;&nbsp;&nbsp;&nbsp;7.2.1. Adding new components or modules
&nbsp;&nbsp;&nbsp;&nbsp;7.2.2. Changing architecture patterns
&nbsp;&nbsp;&nbsp;&nbsp;7.2.3. Modifying data structures
&nbsp;&nbsp;&nbsp;&nbsp;7.2.4. Adding new column types or features
&nbsp;&nbsp;&nbsp;&nbsp;7.2.5. Changing the design system
7.3. ALWAYS update this file when
&nbsp;&nbsp;&nbsp;&nbsp;7.3.1. New coding patterns are established
&nbsp;&nbsp;&nbsp;&nbsp;7.3.2. New rules are confirmed by user
&nbsp;&nbsp;&nbsp;&nbsp;7.3.3. Project constraints change
7.4. Keep documentation simple and concise - avoid duplication
7.5. Reference, don't repeat - link to technical docs rather than duplicating
7.6. Use legal numbering (decimal outline format) for all documentation
7.7. Use non-breaking spaces (`&nbsp;`) for proper indentation in Markdown files

## 8. File Organization

8.1. JavaScript modules → `/js/[name].js`
8.2. HTML pages → `/pages/[name].html`
8.3. Schemas → `/assets/[name]-grid.json`
8.4. Data → `/assets/app-data.json`
8.5. Styles → `/styles/app.css`
8.6. Icons → `/styles/icons.js`
8.7. Documentation → `/Documentation/TECHNICAL_DOCUMENTATION.md`

## 9. Self-Update Rules

9.1. Suggest updates to these instructions when patterns emerge or user requests changes
9.2. ALWAYS get user confirmation before updating this file
9.3. When suggesting updates: Explain what rule should be added, why it's beneficial, show example
9.4. When updating: Increment version (PATCH for clarifications, MINOR for new rules, MAJOR for breaking changes), update "Last Updated" date

## 10. Standard Workflows

10.1. **Git Commit**
&nbsp;&nbsp;&nbsp;&nbsp;10.1.1. Analyze all changes using `get_changed_files`
&nbsp;&nbsp;&nbsp;&nbsp;10.1.2. Create detailed commit message based on changes
&nbsp;&nbsp;&nbsp;&nbsp;10.1.3. Stage all changes with `git add .`
&nbsp;&nbsp;&nbsp;&nbsp;10.1.4. Commit with `git commit -m "message"`

10.2. **Adding New Features**
&nbsp;&nbsp;&nbsp;&nbsp;10.2.1. Read relevant code files
&nbsp;&nbsp;&nbsp;&nbsp;10.2.2. Check schema definitions and data structures
&nbsp;&nbsp;&nbsp;&nbsp;10.2.3. Verify design system compliance
&nbsp;&nbsp;&nbsp;&nbsp;10.2.4. Check for reusable components
&nbsp;&nbsp;&nbsp;&nbsp;10.2.5. Implement using established patterns
&nbsp;&nbsp;&nbsp;&nbsp;10.2.6. Test functionality
&nbsp;&nbsp;&nbsp;&nbsp;10.2.7. Update documentation if needed

---

**For all project-specific technical details**, see: `/Documentation/TECHNICAL_DOCUMENTATION.md`
