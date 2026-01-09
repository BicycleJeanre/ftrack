# Assets Directory

## Data Files

### app-data.sample.json
Sample financial data bundled with the application. This file is used to initialize new user data on first run.

**Note**: `app-data.json` is gitignored and not included in the repository. It will be created automatically from the sample file when the app first runs.

## Schema Files
Grid configuration schemas that define the structure and behavior of the application's data grids:
- `accounts-grid-unified.json` - Account management grid
- `actual-transactions-grid.json` - Actual transaction tracking grid
- `planned-transactions-grid.json` - Planned transaction grid
- `projections-grid.json` - Projections display grid
- `scenario-grid.json` - Scenario management grid
- `scenario-types.json` - Scenario type definitions
- `shortcuts.json` - Keyboard shortcut configurations

These files are read-only and bundled in the application's ASAR package.
