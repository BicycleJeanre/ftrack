# AI-Driven QC Method

**Version**: 1.1.4  
**Last Updated**: February 12, 2026  
**Purpose**: Framework for functionality-driven QC using AI verification with minimal manual testing

---

## 1.0 Overview

This QC method shifts from exhaustive manual testing to a **functionality-driven, AI-verified approach** where:
- **AI verifies** internal logic, calculations, and data integrity
- **Users test** critical user workflows and acceptance criteria only
- **QC data** uses a single representative dataset for verification
- Focus is on **what features do**, not exhaustive use case permutations

---

## 2.0 Core Principles

2.1 **Functionality-First**: Test behavior, not use cases. Each feature has specific things it does.

2.2 **AI as Primary Verifier**: AI handles deterministic checks (calculations, data structure integrity, formula accuracy).

2.3 **Human as Acceptance Validator**: Users verify features work as intended in realistic workflows.

2.4 **Data-Driven**: QC data is generated systematically, not randomly, to ensure coverage.

2.5 **Risk-Based**: Higher criticality features get more rigorous testing.

---

## 3.0 QC Data & Test Script Strategy

### 3.1 Test Data Management
Maintain a single representative QC dataset:
- **File**: `/QC/ftrack-qc-data.json` (current location)
- **Contains**: Multiple scenarios, account types, transactions, projections
- **Usage**: Primary dataset for all verification testing
- **Updates**: Add to this file when testing new scenario types

### 3.2 Test Execution Script

Create a lightweight Node.js script (`QC/verify.js`) when you are ready to automate QC:
1. **Loads test data** from QC/ftrack-qc-data.json
2. **Loads configuration** from assets/lookup-data.json
3. **Runs deterministic checks** (data structure, calculations, config)
4. **Generates readable reports** (console output + JSON archive)

**Script Structure**:
```
QC/verify.js          (Main runner - loads data, executes checks, outputs reports)
└── Can be expanded with helper modules later:
    ├── verify-schemas.js (data structure validation)
    ├── verify-calculations.js (calculation verification)
    ├── verify-config.js (configuration validation)
    └── utils/ (report generators, loaders, etc.)
```

**Suggested npm Scripts** (add to package.json when ready):
```json
{
  "scripts": {
    "qc:verify": "node QC/verify.js --scenario=General",
    "qc:verify:all": "node QC/verify.js --all",
    "qc:verify:verbose": "node QC/verify.js --scenario=General --verbose"
  }
}
```

### 3.3 Test Execution Flow

```
User: node QC/verify.js (or npm run qc:verify after adding scripts)
  ↓
Script loads:
  - /QC/ftrack-qc-data.json (test data)
  - /assets/lookup-data.json (configuration)
  ↓
Script runs checks:
  - Data structure validation
  - Configuration verification
  - (Optional) Calculation verification
  ↓
Script outputs:
  - Console report (human readable)
  - JSON report saved to /QC/reports/ (create if needed; machine readable + archival)
  ↓
AI analyzes outputs:
  - Compares JSON report to expected outputs
  - Flags failures, likely causes, and impacted features
  - Generates user-facing QC report
```

---

## 4.0 AI-Run Verification Workflow

4.1 **Automated Execution**: Run deterministic checks (data structure, config, calculations) and produce machine-readable output (JSON report + diff summaries).

4.2 **AI Analysis**: Read script outputs, compare to expected values, identify failures and likely causes, then generate a concise report with pass/fail status and next actions.

4.3 **Instructions File**: Define QC command entry points, expected report locations, and require analysis and summary of failures and next actions.

4.4 **User Flow**:
1. User asks the AI to run QC.
2. AI executes QC scripts, analyzes outputs, and generates the report.
3. User reviews the report and addresses any failures.

4.5 **Sample AI Report Format**

```
QC Report
Run: 2026-02-12T18:42:10Z
Dataset: QC/ftrack-qc-data.json
Seed: 893214

Overall Status: FAIL (2 of 24 checks failed)

Failures
- projection-engine: monthly interest accrual mismatch
  Expected: 124.50  Actual: 124.49  Tolerance: 0.01
- recurrence-utils: 3rd Friday rule returned 2026-03-13 instead of 2026-03-20

Likely Causes
- Rounding step occurs before interest aggregation
- Date rule uses weekday offset from month start

Next Actions
- Review interest rounding in projection engine
- Verify nth-weekday calculation in recurrence utils
```

---

## 5.0 AI-Generated QC Artifacts Method

This method uses AI to create deterministic QC data, expected results, and executable checks so functionality can be validated without manual recomputation.

### 5.1 Artifact Set
AI generates three aligned artifacts per feature area:
1. **QC Data**: Deterministic, seeded data that exercises the feature.
2. **Expected Results**: Golden outputs derived from spec + formulas.
3. **Executable Checks**: Code that loads inputs, runs the app logic, and compares outputs.

### 5.2 Deterministic Data Rules
5.2.1 Use a fixed seed for any pseudo-random generation.

5.2.2 Encode the seed in test metadata so reruns are identical.

5.2.3 Use bounded ranges and edge values (zero, negatives, max/min) in every dataset.

### 5.3 Golden Output Rules
5.3.1 Store expected outputs in JSON next to the input dataset.

5.3.2 Keep expected outputs minimal: only fields needed to assert behavior.

5.3.3 Use stable sorting for any list outputs before comparison.

### 5.4 Comparison Rules
5.4.1 Prefer deep equality checks for deterministic structures.

5.4.2 For numeric outputs, allow explicit tolerances per field.

5.4.3 Fail fast with a clear diff summary for the first mismatch.

---

## 6.0 Test Execution Options

This section lists the only supported execution options for QC.

### 6.1 Option A: Plain Node.js Script (Lightest)
- **How it works**: `node QC/verify.js` loads QC data and expected outputs, calls logic modules, and asserts results.
- **Pros**: No dependencies, fastest setup, deterministic.
- **Cons**: No watch mode, fewer test utilities.
- **Use when**: Validating calculation logic or data transforms only.

### 6.2 Option B: Node Built-In Test Runner
- **How it works**: Use `node:test` and `assert` to structure checks without extra dependencies.
- **Pros**: Simple, structured reporting, still lightweight.
- **Cons**: Smaller ecosystem than full-featured test runners.
- **Use when**: You want organized suites but still prefer minimal tooling.

---

## 7.0 Recommended Starting Point

7.1 Use Option A for the lightest possible checks.

7.2 Use Option B when you want organized suites and structured reporting.

7.3 Keep QC artifacts small, seeded, and versioned for reproducibility.

---

