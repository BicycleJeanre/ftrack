# Fund Scenario - Minimal Implementation Plan

**Version**: 1.0.0  
**Date**: February 8, 2026  
**Status**: PLAN READY FOR EXECUTION  
**Complexity**: Low-Medium  

---

## 1.0 Overview

This document describes a minimal implementation plan for the existing **Funds** scenario type, extending it to support:

1. A Debt Repayment-style **Summary Cards** section
2. An **account type scope selector** (All, Asset, Liability, Equity, Income, Expense)
3. Fund ownership reporting using **shares** as a reporting layer
4. A **Locked shares** default with user-driven manual share values
5. Optional switch to **Automatic shares** from a chosen effective date

The plan prioritizes reuse of existing patterns in `forecast.js`, existing grids via `grid-factory.js`, and existing totals logic.

---

## 2.0 Design Constraints

2.1 Reuse existing scenario model where possible (additive only if required).
2.2 Reuse the existing projection engine for point-in-time balances.
2.3 Reuse the Debt Repayment **Summary Cards** UI pattern.
2.4 Keep UI minimal: one summary section with a scope selector.
2.5 No multi-currency support; display scenario currency as-is.

---

## 3.0 Core Requirements

3.1 Funds scenario has a Summary Cards section.
3.2 Summary Cards supports scope selector by account type.
3.3 Totals shown in the cards:
3.3.1 NAV
3.3.2 Total shares
3.3.3 Share price
3.3.4 Money in, money out, net (reuse existing conventions)
3.4 Detail view under the cards changes by scope:
3.4.1 Equity scope shows investor breakdown (shares, ownership percent, implied value).
3.4.2 Other scopes show a simple per-account overview.
3.5 Share policy:
3.5.1 Default: Locked shares with manual values.
3.5.2 Optional: Automatic shares enabled from a chosen effective date.
3.6 Reports support:
3.6.1 Report-time computation (latest state).
3.6.2 Point-in-time computation (as-of date) with refresh/regenerate.

---

## 4.0 Data Model Changes (Minimal and Additive)

4.1 Add optional `scenario.fundSettings` to persist Funds-only share settings.
4.2 Keep it additive and scenario-scoped (no shares stored on accounts).

---

## 5.0 Implementation Tasks

5.1 Enable Summary Cards for Funds
5.1.1 File: [assets/lookup-data.json](../assets/lookup-data.json)
5.1.2 Action: set `showSummaryCards: true` on the existing Funds scenario type.

5.2 Reuse Summary Cards Section Infrastructure
5.2.1 File: [js/forecast.js](../js/forecast.js)
5.2.2 Action: reuse existing `summaryCardsSection` DOM + visibility gating used by Debt Repayment.

5.3 Add Account Type Scope Selector
5.3.1 File: [js/forecast.js](../js/forecast.js)
5.3.2 Action: selector options All, Asset, Liability, Equity, Income, Expense.

5.4 Add Fund Summary Calculator
5.4.1 File: [js/fund-utils.js](../js/fund-utils.js) (new)
5.4.2 Action: compute NAV, total shares, share price, and Equity investor breakdown for a scope and as-of date.

5.5 Render Funds Summary Cards + Detail Grid
5.5.1 File: [js/forecast.js](../js/forecast.js)
5.5.2 Action: add `loadFundsSummaryCards()` similar to `loadDebtSummaryCards()`.
5.5.3 Action: render a small detail grid under cards using [js/grid-factory.js](../js/grid-factory.js).

5.6 Implement Locked Shares Default + Manual Entry
5.6.1 Files: [js/forecast.js](../js/forecast.js), [js/managers/scenario-manager.js](../js/managers/scenario-manager.js)
5.6.2 Action: initialize `scenario.fundSettings.shareMode` to Locked and persist `lockedSharesByAccountId`.

5.7 Implement Automatic Shares Switch
5.7.1 Files: [js/forecast.js](../js/forecast.js), [js/fund-utils.js](../js/fund-utils.js)
5.7.2 Action: switch to Automatic shares from a chosen effective date only.

5.8 Implement Report-Time and Point-in-Time Refresh
5.8.1 File: [js/forecast.js](../js/forecast.js)
5.8.2 Action: “As of date” + Refresh to regenerate summary + detail grid.

---

## 6.0 Integration Hooks

6.1 Refresh Funds summary after scenario load, grid edits, and projection generation.

---

## 7.0 Acceptance Checklist

7.1 Funds scenario shows Summary Cards.
7.2 Scope selector filters by account type.
7.3 Equity scope shows investor breakdown with shares, ownership percent, implied value.
7.4 Locked shares manual updates persist and refresh.
7.5 Switching to Automatic shares applies from chosen effective date only.
7.6 As-of date refresh supports point-in-time and latest views.

