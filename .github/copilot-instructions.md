# GitHub Copilot Instructions

**Version**: 3.0.0  
**Last Updated**: January 7, 2026  
**Purpose**: General coding guidelines and workflow standards

---

## 1.0 Core Principles

1.1 Provide complete, runnable code - not pseudo-code
1.2 Include imports at the top
1.3 Use actual file paths in references
1.4 Add inline comments for complex logic
1.5 Use proper indentation and consistent style
1.6 Keep responses concise - code examples over lengthy explanations

## 2.0 Code Quality Standards

2.1 Use `async/await` for asynchronous operations
2.2 ALWAYS wrap file/async operations in try-catch blocks
2.3 Follow existing naming conventions and code patterns in the project
2.4 NEVER change existing design patterns without explicit user request
2.5 ALWAYS reuse existing components before creating new ones
2.6 Keep all existing comments and formatting when editing

## 3.0 Error Handling

3.1 Include error handling in all functions that interact with external resources
3.2 Log errors with descriptive context
3.3 Provide fallback behavior when possible
3.4 Use try-catch for file operations, network requests, and database queries

## 4.0 Git Workflow

### 4.1 Commit Standards

When user requests git workflow:

4.1.1 Analyze all changes (staged and unstaged)
4.1.2 Stage all changes with `git add .`
4.1.3 Create detailed commit message based on changes
4.1.4 Commit using this format:

```bash
git commit -m "Short summary

Changed files:
- path/to/file1: what changed
- path/to/file2: what changed"
```

4.1.5 Do NOT push to origin unless explicitly requested

### 4.2 Merging

4.2.1 Check what the base branch is for the current branch before merging
4.2.2 Merge into the base branch (typically `main` or `develop`)
4.2.3 Provide one-liner commands for merge operations
4.2.4 Suggest deleting feature branches after successful merge

## 5.0 Documentation Standards

5.1 After code changes, update relevant documentation files
5.2 If structure, navigation, or data flow changes, update overview documentation
5.3 Keep format consistent across all documentation
5.4 Only update affected documentation - add new files for new features
5.5 Use Mermaid diagrams for visual representations when helpful
5.6 In Mermaid diagrams, do not use brackets "()" in names/descriptions - use brackets ONLY for circular nodes
5.7 ALL documentation files MUST use legal numbering format (1.0, 1.1, 1.1.1, etc.)

## 6.0 Code Editing Guidelines

6.1 Only edit what was explicitly requested
6.2 Reference actual paths: "Update line 45 in /path/to/file.js" not "Update the file"
6.3 When modifying existing code:
  - 6.3.1 Read relevant files first
  - 6.3.2 Check related schema/config definitions
  - 6.3.3 Verify design system compliance
  - 6.3.4 Check for reusable components/patterns
6.4 After changes:
  - 6.4.1 Verify functionality
  - 6.4.2 Check for errors
  - 6.4.3 Update documentation if architectural changes were made

## 7.0 Response Format

7.1 At the end of each response, include which instruction rules were applied
7.2 Format: **Applied Rules**: [list of rule numbers, e.g., 1.0, 2.0, 4.1]
7.3 Only list rules that were directly relevant to the response

## 8.0 Self-Update Rules

8.1 Suggest updates to these instructions when patterns emerge or user requests changes
8.2 ALWAYS get user confirmation before updating this file
8.3 When suggesting updates: Explain what rule should be added, why it's beneficial, show example
8.4 When updating: Increment version (PATCH for clarifications, MINOR for new rules, MAJOR for breaking changes), update "Last Updated" date

---

**For project-specific technical details**, see: `/Documentation/TECHNICAL_DOCUMENTATION.md`
