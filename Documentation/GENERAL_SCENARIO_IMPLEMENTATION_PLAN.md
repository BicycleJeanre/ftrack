# General Scenario - Minimal Implementation Plan

**Version**: 1.0.0  
**Date**: February 8, 2026  
**Status**: PLAN READY FOR EXECUTION  
**Complexity**: Low  

---

## 1.0 Overview

General scenarios already support Accounts, Planned Transactions, and Projections.

This plan adds a minimal “total summary at the top” by reusing the existing Summary Cards pattern (Debt Repayment) and the existing totals calculation utilities.

---

## 2.0 Core Requirements

2.1 General scenario displays a compact summary section at the top of the forecast view.
2.2 Summary is read-only and derived from existing scenario data.
2.3 Summary shows at least:
2.3.1 Money in
2.3.2 Money out
2.3.3 Net
2.4 Summary refreshes after relevant actions.

---

## 3.0 Minimal Approach

3.1 Use existing Summary Cards infrastructure
3.1.1 Prefer enabling a single overall Summary Card rather than creating a new page or new grids.

3.2 Reuse existing totals logic
3.2.1 Use the same Money In, Money Out, Net conventions already used in the transactions totals.

---

## 4.0 Implementation Tasks

4.1 Enable Summary Cards for General
4.1.1 File: [assets/lookup-data.json](../assets/lookup-data.json)
4.1.2 Action: set `showSummaryCards: true` for the existing General scenario type.

4.2 Reuse the existing Summary Cards section
4.2.1 File: [js/forecast.js](../js/forecast.js)
4.2.2 Action: General should participate in the same `typeConfig.showSummaryCards` gating already used by Debt Repayment.

4.3 Add a General summary renderer
4.3.1 File: [js/forecast.js](../js/forecast.js)
4.3.2 Action: add `loadGeneralSummaryCards(container)`.
4.3.3 Rendering: one “Overall Total” card only.
4.3.4 Values: Money in, Money out, Net.
4.3.5 Optional extension: add Current net worth and Projected end net worth if the necessary values are already easily available.

4.4 Hook refresh events
4.4.1 File: [js/forecast.js](../js/forecast.js)
4.4.2 Action: refresh summary after:
4.4.2.1 Scenario load
4.4.2.2 Transactions edits
4.4.2.3 Projection generation

---

## 5.0 Acceptance Checklist

5.1 General scenarios show a summary at the top.
5.2 Summary values match transaction totals conventions.
5.3 Summary updates after changes and projection regeneration.
5.4 Other scenario types are unaffected.
