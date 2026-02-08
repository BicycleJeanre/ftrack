# Documentation Strategy: Unified, Minimal Approach

**Version**: 1.1.0  
**Last Updated**: February 8, 2026  
**Principle**: One embedded master doc + minimal supporting files. Separate AI workflows maintained independently.

---

## 1.0 Master Documentation (Source of Truth)

**File**: `pages/documentation.html`

**Contains**:
- **User Guides** - Everything users need (Getting Started, Accounts, Transactions, etc.)
- **Technical Foundation** - Architecture, data models, patterns (embedded as collapsible sections)
- **Glossary & FAQ**

**Why Here**: Single reference point. App links to each section. No duplication.

### 1.1 Repository Docs Panel (Web-Hosted)

**Goal**: Make repo documentation readable from the hosted documentation page without duplicating content.

**UI Location**: `pages/documentation.html` → **Repository Docs** panel

**Navigation Design**:
- Sidebar shows **main sections only** (categories)
- Clicking a main section **expands/collapses** its list of subsections (documents)
- Selecting a subsection loads the document in the content area

**Static Hosting Constraint**:
- The hosted page cannot enumerate folders at runtime
- Add/remove/rename docs requires updating a manifest file (see 1.2)
- Editing an existing doc is reflected by runtime fetch

### 1.2 Repository Docs Manifest (Build Step)

**Files**:
- `assets/docs-manifest.json` (generated)
- `scripts/generate-docs-manifest.mjs` (generator)

**Purpose**:
- Defines the list of repository docs and their categories
- Enables deterministic navigation for static hosting

**Update Rules**:
- When docs are added/removed/renamed in `Documentation/`, run `npm run docs:manifest`
- The `assets/docs-manifest.json` output is committed so hosting stays in sync

### 1.3 Repository Docs Rendering (Runtime)

**File**: `js/doc-repo-manifest.js`

**Behavior**:
- Loads `assets/docs-manifest.json`
- Fetches doc content at runtime and renders Markdown → HTML
- Uses safe link handling (blocks `javascript:` links)

**Design Requirement**:
- Repo-doc content should reuse existing `documentation.html` visual patterns
- Main vs subsection hierarchy must match the established typography and spacing

---

## 2.0 Supporting Files (Minimal)

| File | Purpose | Update Frequency |
|------|---------|------------------|
| `CHANGELOG.md` | Release notes (summarized from git log) | Every release |
| `package.json` | Version only | Every release |
| `pages/home.html` | "What's New" (link to CHANGELOG, last 3 releases) | Every release |
| `.github/copilot-instructions.md` | Core rules only (code reuse, patterns, brevity) | Rarely |

**Total**: 4 files. Everything lives in the application or version control.

**Note**: Repository docs in `Documentation/` may exist for development and are surfaced in-app via the Repository Docs panel; the UI remains the user-facing entry point.

---

## 3.0 AI Workflows (Separate Files)

**Goal**: Most operational process lives as reusable Copilot prompt files.

**Location**: `.github/prompts/`

**File Type**: `*.prompt.md` (one workflow per file)

**Naming**: short, verb-based, kebab-case (e.g., `update-documentation.prompt.md`)

**Independence**:
- Each prompt file is fully standalone (no references required).
- Do not use `.github/workflows/` for this; that folder is GitHub Actions.

### 3.1 Required Workflows
- `update-documentation.prompt.md`
- `code-review.prompt.md`
- `data-model-check.prompt.md`
- `release.prompt.md`

### 3.2 Required Prompt Structure
Each `*.prompt.md` must include:
- **Purpose**: what “done” means
- **Inputs**: what context is required (branch, files, version target, etc.)
- **Steps**: ordered checklist the AI should execute
- **Outputs**: exact response format (bullets, file list, commands)
- **Validation**: how to verify success (what to check / what must be true)

### 3.3 Update Rules
- Update prompt files when the workflow changes (not when code changes).
- Keep prompt files short and executable (prefer checklists over prose).

---

## 4.0 Copilot Instructions (Lightweight Core Rules)

**File**: `.github/copilot-instructions.md`

**Content** (short sections):
- **Reuse Existing Code**: Before writing new functions, check if similar logic exists
- **Follow Patterns**: Match existing naming, structure, error handling
- **Keep Documentation Synced**: When editing code, mention corresponding documentation sections
- **Minimal Response Style**: Brief, factual, link-based
- **Git Standards**: Descriptive commits, clear merge strategy

**NO**: Detailed workflow instructions, automation steps, or checklists. Those live in separate workflow files.

---

## 5.0 Feature Development Cycle (Simplified)

**1. Code**: Create feature, update `pages/documentation.html` in same commit  
**2. Commit**: Describe changes, list files  
**3. Review**: AI runs appropriate workflow (Code Review, Data Model Check)  
**4. Merge**: dev → main  
**5. Release**: Run Release workflow (or user invokes it manually)  

---

## 6.0 File Structure

```
.github/
├── copilot-instructions.md          (lightweight, core rules only)
└── prompts/
    ├── update-documentation.prompt.md
    ├── code-review.prompt.md
    ├── data-model-check.prompt.md
    └── release.prompt.md

pages/
├── documentation.html               (master source of truth)
└── home.html                        (What's New section only)

CHANGELOG.md                          (release summaries)
package.json                          (version field)
```

---

## 7.0 Governance

| Role | Responsibility |
|------|-----------------|
| Developer | Code feature. Update documentation.html. Commit. |
| AI | Execute workflows when requested. Validate consistency. |
| Maintainer | Approve releases. Merge branches. |

**Sync Points**:
- Per commit: Developer updates documentation
- Per release: Run Release workflow
- Quarterly: Run Data Model Check workflow
