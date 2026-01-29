# Web Conversion POC - AI Implementation Prompt

Convert this Electron desktop application to a browser-based web application using localStorage for data persistence. This is a proof-of-concept conversion.

## Required Changes

### 1. Replace File System Operations with localStorage

**File: `js/core/data-store.js`**
- Remove: `const fs = window.require('fs').promises;` and `const path = window.require('path');`
- Replace `readAppData()` function to use `localStorage.getItem('ftrack-app-data')` and `JSON.parse()`
- Replace `writeAppData()` function to use `localStorage.setItem('ftrack-app-data', JSON.stringify(data))`
- Handle initial data load: if localStorage is empty, load from `assets/app-data.sample.json` via fetch()

**File: `js/data-manager.js`**
- Remove: `const fs = window.require('fs').promises;`
- Remove: `const dataPath = getAppDataPath();`
- Update `readAppData()` to use localStorage instead of fs.readFile
- Update `writeAppData()` to use localStorage instead of fs.writeFile

**File: `js/forecast.js`**
- Remove all `window.require('fs')` calls
- Replace file reads of lookup-data.json with fetch() calls to `assets/lookup-data.json`

**File: `js/data-migration.js`**
- Remove all fs/path operations or disable migration functionality for web version

### 2. Replace Node.js Module Loading

**File: `js/financial-utils.js`**
- Remove: `const Finance = window.require('financejs');`
- Add CDN script tag in HTML files: `<script src="https://cdn.jsdelivr.net/npm/financejs@4.1.0/finance.min.js"></script>`
- Reference as `window.Finance` or global `Finance`

**File: `js/logger.js`**
- Remove all ipcRenderer code
- Replace with console-only logging (console.log, console.warn, console.error)
- Or implement simple in-memory log buffer

### 3. Remove/Stub Electron-Specific Files

**File: `js/app-paths.js`**
- Replace entire file with stub functions that return empty strings or null
- Or delete file and remove all imports

**Delete these files:**
- `main.js`
- `preload.js`

### 4. Create Web Entry Point

**Create: `index.html`**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0; url=pages/home.html">
  <title>FTrack - Redirecting...</title>
</head>
<body>
  <p>Loading FTrack...</p>
</body>
</html>
```

### 5. Update HTML Files for Web Compatibility

**Files: `pages/home.html`, `pages/forecast.html`**
- Add financejs CDN script tag before other scripts
- Ensure all script tags use relative paths (no Electron-specific paths)
- Remove any Electron security directives

### 6. Update package.json

**File: `package.json`**
- Add web development script: `"serve": "npx http-server -p 8080 -c-1"`
- Keep existing build scripts for Electron (optional)
- Document that web version uses localStorage only

### 7. Initialize Sample Data

**Create: `js/web-init.js`** (optional)
- On first load, check if localStorage has data
- If not, fetch `assets/app-data.sample.json` and save to localStorage
- Include this script in index.html

### 8. Nginx Configuration (deployment)

**Create: `nginx.conf.example`**
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/ftrack;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## Implementation Order

1. Start with data-store.js and data-manager.js (core data layer)
2. Update financial-utils.js and add CDN scripts
3. Fix forecast.js file reading
4. Stub/remove app-paths.js
5. Update logger.js
6. Create index.html
7. Test in browser with `npx http-server`
8. Configure nginx for production

## Testing Checklist

- [ ] App loads in browser without errors
- [ ] Can create/edit scenarios
- [ ] Can create/edit transactions
- [ ] Can view forecast page
- [ ] Data persists after page reload
- [ ] Sample data loads on first visit
- [ ] All calculations work correctly

## Known Limitations

- Data stored in browser localStorage only (not shared across devices)
- No multi-user support
- No authentication
- Data lost if browser cache cleared
- ~5-10MB localStorage limit (should be sufficient for financial data)
