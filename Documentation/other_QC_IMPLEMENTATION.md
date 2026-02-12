# QC Implementation Plan

**Version**: 1.0.0  
**Last Updated**: February 12, 2026  
**Purpose**: Simple plan to implement the AI-driven QC method

---

## 1.0 Scope

1.1 Implement QC automation using only Option A and Option B from the QC method.

1.2 Keep the first rollout minimal and deterministic.

---

## 2.0 Deliverables

2.1 A runnable QC script at `QC/verify.js`.

2.2 Optional node:test suites for structured checks.

2.3 A consistent report format written to `QC/reports/`.

2.4 npm scripts to run QC consistently.

---

## 3.0 Step-by-Step Implementation

### 3.1 Define Inputs

3.1.1 Confirm QC dataset location: `QC/Archive/ftrack-qc-data.json`.

3.1.2 Confirm config input: `assets/lookup-data.json`.

3.1.3 Define a small expected outputs file per scenario.

### 3.2 Create `QC/verify.js`

3.2.1 Load inputs and validate required fields.

3.2.2 Run deterministic checks (data structure, config, core calculations).

3.2.3 Emit a concise console report and a JSON report.

### 3.3 Add Report Output

3.3.1 Create `QC/reports/` on first run if missing.

3.3.2 Save reports using a timestamped filename.

### 3.4 Add npm Scripts

3.4.1 Add `qc:verify`, `qc:verify:all`, and `qc:verify:verbose` to package.json.

3.4.2 Keep script flags aligned with the QC method.

### 3.5 Optional Node Test Runner

3.5.1 Add focused node:test suites for reuse and structure.

3.5.2 Keep tests aligned to the same deterministic datasets.

---

## 4.0 AI Workflow Integration

4.1 Use the QC method instructions to run `qc:verify` or `node QC/verify.js`.

4.2 AI reads the JSON report and summarizes failures, causes, and next actions.

4.3 Store QC reports for comparison across runs.

---

## 5.0 First Milestone Checklist

5.1 `QC/verify.js` runs with the current QC dataset.

5.2 JSON report output is stable and readable.

5.3 npm scripts are in place and documented.

5.4 A sample AI report matches the QC method format.
