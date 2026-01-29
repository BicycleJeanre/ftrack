# FTrack Web Conversion POC

**Version**: 1.0  
**Date**: January 29, 2026  
**Status**: Planning Phase  
**Target**: Static HTML on GitHub Pages

---

## 1.0 Overview

1.1 **Goal**: Convert FTrack to a client-side web application while maintaining single shared codebase with Electron desktop app

1.2 **Deployment**: GitHub Pages (static HTML/CSS/JS)

1.3 **Architecture**: Client-side only - no backend server required

1.4 **Data Persistence**: Browser localStorage instead of file system

---

## 2.0 Key Constraints & Principles

2.1 **Single Shared Codebase**
- `js/` folder code remains identical between web and Electron versions
- No branching of business logic
- Update once, deploy everywhere

2.2 **Frontend-Only Application**
- All processing happens in user's browser
- No server-side computation
- Enables offline-first operation

2.3 **Data Storage Changes Only**
- Data access layer abstraction needed
- Electron uses: file system (`userData/assets/app-data.json`)
- Web uses: browser localStorage (with indexed-db as fallback for size limits)
- Export/import functionality works in both environments

---

## 3.0 Current State Analysis

### 3.1 Electron Architecture
```
main.js (Electron main process)
  ↓
preload.js (IPC bridge)
  ↓
HTML pages (forecast.html, home.html)
  ↓
js/ (shared business logic)
  ├─ data-manager.js (file system reads/writes)
  ├─ forecast.js
  ├─ grid-factory.js
  └─ ... (all other logic)
  ↓
userData/assets/app-data.json (persistent storage)
```

### 3.2 Current Data Layer
- **data-manager.js**: Reads/writes via `window.require('fs')`
- **app-paths.js**: Path resolution for `userData` directory
- **global-app.js**: Global state management

### 3.3 Storage Dependency
```
DataStore (core/data-store.js)
  ↓
  └─→ Reads from app-data.json via file system (Electron only)
```

---

## 4.0 Web Conversion Strategy

### 4.1 Centralized Data Storage in data-manager.js

Modify `js/data-manager.js` to detect platform and handle storage accordingly:

**Approach: Single source of truth**
```javascript
// At top of data-manager.js
const isElectron = typeof window !== 'undefined' && window.require !== undefined;

// data-manager.js methods now:
async readAppData() {
  if (isElectron) {
    // Electron: use file system
    const fs = window.require('fs').promises;
    const data = await fs.readFile(path, 'utf8');
    return JSON.parse(data);
  } else {
    // Web: use localStorage
    const data = localStorage.getItem('ftrack:app-data');
    return data ? JSON.parse(data) : null;
  }
}

async saveAppData(data) {
  if (isElectron) {
    // Electron: write to file system
    const fs = window.require('fs').promises;
    await fs.writeFile(path, JSON.stringify(data, null, 2));
  } else {
    // Web: write to localStorage
    localStorage.setItem('ftrack:app-data', JSON.stringify(data));
  }
}
```

**Why this approach:**
- Single file to maintain storage logic
- No abstraction layer overhead
- Easy to debug and test
- Works for all existing code that calls data-manager methods

### 4.2 File Structure

```
ftrack/
├── index.html (NEW - web entry, redirects to pages/forecast.html)
├── js/
│   ├── data-manager.js (MODIFIED - add platform detection)
│   ├── data-export-import.js (NEW - export/import for both platforms)
│   └── ... (all other files UNCHANGED)
├── pages/
│   ├── forecast.html (shared - main app interface)
│   └── home.html (shared - Electron only)
├── styles/
│   └── app.css (shared)
├── assets/
│   └── ... (shared)
├── main.js (Electron - UNCHANGED)
├── preload.js (Electron - UNCHANGED)
└── Documentation/
    └── WEB_CONVERSION_POC.md (this file)
```

### 4.3 Initialization Flow

**Electron (Desktop)**
```
main.js → loads preload.js → BrowserWindow loads home.html
         → user navigates → forecast.html
         → forecast.js init() → data-manager (Electron mode)
         → reads userData/app-data.json
```

**Web (Browser)**
```
index.html → redirects to pages/forecast.html
           → forecast.html loads → forecast.js init()
           → data-manager (Web mode) → reads localStorage
```

---

## 5.0 Implementation Phases

### Phase 1: Modify data-manager.js ✅ COMPLETE
- [x] Add platform detection (`isElectron`)
- [x] Update `readAppData()` with conditional logic
- [x] Update `writeAppData()` with conditional logic
- [x] Update app-paths.js for web compatibility
- [x] Create data-export-import.js for file operations

### Phase 2: Web Entry Point ✅ COMPLETE
- [x] Create `index.html` redirecting to pages/forecast.html
- [x] Update POC documentation

### Phase 3: Export/Import UI ✅ COMPLETE
- [x] Add export/import buttons to navbar
- [x] Wire up buttons to data-export-import.js functions
- [x] Implement file download/upload in web browser
- [x] Add Electron dialog handling with fallbacks

### Phase 4: Testing & Polish
- [ ] Test data persistence across sessions (web)
- [ ] Test export/import workflow (both platforms)
- [ ] Test Electron still works unchanged
- [ ] Test offline functionality
- [ ] Size limit handling

### Phase 5: GitHub Pages Deploy
- [ ] Create GitHub Actions workflow
- [ ] Deploy to `gh-pages` branch
- [ ] Document access URL

---

## 6.0 Data Storage Considerations

### 6.1 localStorage vs IndexedDB
| Feature | localStorage | IndexedDB |
|---------|-------------|-----------|
| Limit | 5-10 MB | 50+ MB (quota) |
| Structure | String only | Objects, arrays |
| Speed | Sync | Async |
| Use Case | Small data | Large data |

**Strategy**: Use localStorage for app data, fall back to IndexedDB if > 5MB

### 6.2 Storage Keys
```javascript
{
  'ftrack:app-data': { scenarios, accounts, transactions, ... },
  'ftrack:migration-version': 3,
  'ftrack:last-backup': '2026-01-29T...',
  'ftrack:export-templates': { ... }
}
```

### 6.3 Backup Strategy
- Auto-save on data change (debounced)
- Weekly auto-backup in localStorage
- Manual export-to-file (for safekeeping)
- Import from file (recovery)

---

## 7.0 Export/Import Functionality

### 7.1 Export Workflow
```
User clicks "Export Data" 
  → Serialize app state to JSON
  → Create download blob
  → Browser triggers download
  → File: ftrack-backup-YYYY-MM-DD.json
```

### 7.2 Import Workflow
```
User clicks "Import Data"
  → File picker dialog
  → Read file as text
  → Parse JSON
  → Validate schema (same as migration.js)
  → Merge or replace (user choice)
  → Save to storage
  → Reload UI
```

### 7.3 Validation
```javascript
// Reuse existing migration validation logic
importData(jsonFile) {
  const data = JSON.parse(jsonFile);
  
  // Validate schema
  if (!data.scenarios || !Array.isArray(data.scenarios)) {
    throw new Error('Invalid app data format');
  }
  
  // Run migrations if needed
  if (needsMigration(data)) {
    data = applyMigrations(data);
  }
  
  // Save to storage
  saveData(data);
}
```

---

## 8.0 Platform Detection

### 8.1 How to Detect Platform
```javascript
// In js/global-app.js or initialization
const platform = {
  isElectron: () => typeof window !== 'undefined' 
    && window.require !== undefined,
  isWeb: () => !this.isElectron(),
  getAdapter: () => this.isElectron() 
    ? new ElectronStorageAdapter() 
    : new WebStorageAdapter()
};
```

### 8.2 Conditional Initialization
```javascript
// forecast.js init()
async function init() {
  const adapter = platform.getAdapter();
  
  // All subsequent code is identical
  const data = await adapter.readData();
  // ... rest of initialization
}
```

---

## 9.0 Shared Code That Needs No Changes

These files remain 100% identical:
- ✅ `js/forecast.js` - all UI logic
- ✅ `js/grid-factory.js` - grid creation
- ✅ `js/calculation-utils.js` - financial calculations
- ✅ `js/date-utils.js` - date handling
- ✅ `js/keyboard-shortcuts.js` - hotkeys
- ✅ `pages/forecast.html` - markup
- ✅ `styles/app.css` - styling
- ✅ All managers (`scenario-manager.js`, etc.)

---

## 10.0 Files Requiring Changes

### 10.1 Modified Files
| File | Changes |
|------|---------|
| `js/data-manager.js` | Add platform detection, conditional read/write logic |
| `js/app-paths.js` | Return web-compatible paths for web platform |

### 10.2 New Files
| File | Purpose |
|------|---------|
| `index.html` | Web entry point, redirects to pages/forecast.html |
| `js/data-export-import.js` | Export/import functionality for both platforms |

---

## 11.0 GitHub Pages Deployment

### 11.1 Workflow
```yaml
# .github/workflows/deploy-web.yml
on:
  push:
    branches: [ web-conversion, main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./
          include_files: |
            index.html
            pages/
            js/
            styles/
            assets/
            web/
```

### 11.2 Access URL
```
https://bicyclejeanre.github.io/ftrack/
```

---

## 12.0 Testing Strategy

### 12.1 Unit Tests
- [ ] StorageAdapter implementations
- [ ] Export/import JSON validation
- [ ] Data migration (reuse existing tests)

### 12.2 Integration Tests
- [ ] Create scenario → export → import (web)
- [ ] Create transaction → export → import (web)
- [ ] Generate projections → export → import (web)
- [ ] Cross-platform import (Electron export → Web import)

### 12.3 Manual Testing
- [ ] localStorage persistence across page reloads
- [ ] Large dataset handling (approach 5MB limit)
- [ ] Export file format compatibility
- [ ] Offline functionality

---

## 13.0 Rollback Plan

If issues arise during web conversion:
1. Keep `web-conversion` branch isolated
2. Merge to `main` only after full testing
3. Electron app remains unaffected (uses `dev` branch)
4. Both branches use identical `js/` code

---

## 14.0 Success Criteria

- ✅ Web version runs 100% in browser (no server needed)
- ✅ All UI/UX identical to Electron app
- ✅ Data persists across sessions (localStorage)
- ✅ Export/import fully functional
- ✅ Shared `js/` code requires zero changes
- ✅ Deployable to GitHub Pages
- ✅ Works offline

---

## 15.0 Open Questions

15.1 Should web version support auto-sync between tabs/windows?
15.2 Should we add cloud backup option (e.g., GitHub Gist)?
15.3 What's the maximum dataset size we should support?
15.4 Should web version support different themes (light/dark)?

---

## 16.0 Next Steps

1. **Approve this POC** - Is the strategy sound?
2. **Create StorageAdapter abstraction** - Start Phase 1
3. **Build web entry point** - Start Phase 2
4. **Test & iterate** - Validate approach
5. **Deploy to GitHub Pages** - Go live

