# Scenarios and Workflows

## 1.0 What Is a Scenario?

A **scenario** is an independent version of a financial model. It owns:

- accounts and opening balances;
- one-time and recurring transaction rules;
- dated occurrence overrides, actuals, skips, and manual items;
- frozen baseline periods;
- the projection configuration and latest freshness-aware results; and
- Goal Workshop planning settings when used.

Scenarios support “expected reality vs what-if” comparisons.

- **Baseline scenario**: the version you maintain from real balances and
  current expectations.
- **What-if scenario**: a duplicate with different assumptions, such as a
  raise, rent change, purchase, or extra debt payment.

## 2.0 What Is a Workflow?

A **workflow** is a Forecast UI preset that controls which cards are visible.

- Workflows are view-only. They do not change or tag a scenario.
- Scenarios hold the data. Workflows determine how that same data is presented.
- Workflow selection is global, restored on reload, and defaults to
  **General**.

## 3.0 Scenario Versions and Duplication

Duplicating a scenario creates a new scenario with:

- a new ID;
- an incremented version; and
- lineage linking it to the source scenario.

Rules, occurrences, baselines, and projection configuration are copied so the
new version can be changed independently.

## 4.0 Time Controls

FTrack has separate time settings for separate jobs.

### 4.1 Projection Window

Each scenario stores projection Start, End, and Period Type. These control the
date range and interval used by the projection engine.

Edit them in the scenario list at the top of Forecast.

### 4.2 Plan & Actuals Period

Every primary workflow uses the same Plan & Actuals card. Its View and Period
controls determine which resolved occurrences are shown for review and
tracking. They do not change the projection engine configuration.

### 4.3 Display View By

Plan & Actuals and Projections can group or filter displayed data by a chosen
period. Display grouping does not alter rule schedules or projection-engine
Period Type.

### 4.4 Goal Workshop Planning Window

Goal Workshop Simple and Advanced modes share the Generate Plan card but use
an explicit planning window that can differ from the projection window.

If projections should validate an applied plan through its goal date, extend
the scenario projection End date to the same horizon.

## 5.0 Workflow Overview

### 5.1 Budget

Use for period planning, baseline freeze, actuals, skips, unplanned items,
variance, and synchronized projections.

Includes: Accounts, Plan & Actuals, and Projections.

### 5.2 General

Use for flexible rule editing, period tracking, summary totals, and
projections. Plan & Actuals opens on Recurring by default; Period remains
available for baseline and actual tracking.

Includes: Summary, Accounts, Plan & Actuals, and Projections.

### 5.3 Funds

Use for a pooled fund with NAV, shares, and ownership.

Includes: Funds Summary, Accounts, and Plan & Actuals.

### 5.4 Debt Repayment

Use for payoff strategies, interest, payoff dates, and variable-rate
schedules.

Includes: Debt Summary, Accounts, Plan & Actuals, and Projections.

### 5.5 Goal Workshop

Use Simple mode for account-based goals and one generated contribution rule.
Use Advanced mode for multiple goals and constraints.

Includes: Accounts, Generate Plan, Plan & Actuals, and Projections.

## 6.0 Recommended Pattern

1. Create a baseline scenario and enter real opening balances.
2. Add expected one-time and recurring rules.
3. In Budget, review the resolved Period and freeze its baseline.
4. Let projections refresh and confirm the scenario behaves as expected.
5. Duplicate the baseline for each major what-if change.
6. Compare ending balances, low points, cash flow, and payoff dates.
7. Keep actual learning in the maintained baseline; keep experiments in their
   duplicates.
