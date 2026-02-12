# QC System

This folder contains the Quality Control (QC) system for FTrack following the AI-Driven QC Method.

## Quick Start

```bash
# Run QC verification for General scenario
npm run qc:verify

# Run QC verification for all scenarios
npm run qc:verify:all

# Run function tests
npm run qc:test

# Run full QC pipeline (verification + tests)
npm run qc:full
```

## Files

- `qc-method.md` - Complete QC methodology documentation
- `verify.js` - Data structure and config validation script
- `qc-tests.js` - Function-level tests using node:test
- `ftrack-qc-data.json` - Test dataset with representative scenarios
- `expected-outputs.json` - Golden expected outputs for validation
- `reports/` - Timestamped JSON reports (auto-created)

## AI Workflow

When you request a QC run, the AI follows `.github/prompts/qc-run.prompt.md`:

1. Runs verification script (`npm run qc:verify`)
2. Runs function tests (`npm run qc:test`)
3. Reads JSON reports and test output
4. Generates a concise QC report with:
   - Pass/fail status
   - Failures, likely causes, and next actions
   - Report file location

## Adding New Tests

### Data Validation
Add expected outputs to `expected-outputs.json` for new scenarios.

### Function Tests
Add test cases to `qc-tests.js` under the appropriate `describe` block.

## Reports

Reports are saved to `QC/reports/` with timestamped filenames:
- `qc-report-<timestamp>.json` - Machine-readable verification results

Exit codes:
- `0` = all checks passed
- `1` = one or more checks failed
