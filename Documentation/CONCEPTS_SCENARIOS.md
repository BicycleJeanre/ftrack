# Scenarios and Workflows

## 1.0 What Is a Scenario?

A **scenario** is a version of your financial model: accounts, planned transactions, optional budgets, and the last generated projections.

Scenarios are designed for “baseline vs what-if” comparisons.

- **Baseline**: your current reality (starting balances + expected inflows/outflows).
- **What-if versions**: copies of your baseline with different assumptions (raise, rent change, extra debt payment).

## 2.0 What Is a Workflow?

A **workflow** is a Forecast UI preset (left navigation) that controls which cards are visible (Summary, Budget, Generate Plan, etc.).

Important rules.

- Workflows are **view-only**. They do **not** change or “tag” a scenario.
- Scenarios are **content-only**. They store your accounts and transactions; workflows decide how you work with them.
- Workflow selection is global and is restored on reload (defaults to **General**).

## 3.0 Scenario Versions and Duplication

When you duplicate a scenario, FTrack creates a **new scenario** with:

- a new `id`
- an incremented `version`
- a lineage record that links it back to its source

This lets you keep a clean baseline and compare changes across versions.

## 4.0 Projection Window vs View-By vs Planning Window

FTrack has three separate “time” concepts that serve different purposes.

### 4.1 Projection Window (engine settings)

Each scenario has a **projection configuration**:

- **Start** and **End** dates
- a **Period Type** (Day/Week/Month/Quarter/Year)

This window controls what date range projections generate over.

You edit these fields in the scenario list at the top of Forecast.

### 4.2 View By (UI grouping)

Each grid card (Transactions, Budget, Projections) has a **View By** selector.

- This changes how data is grouped for display.
- It does not change the projection engine settings.
- It is remembered per card.

### 4.3 Planning Windows (goal tooling)

Goal tooling uses explicit **planning windows** that can differ from the projection window:

- **Generate Plan (Goal-Based)** uses the **Generate Plan planning window**
- **Advanced Goal Solver** uses the **Solver planning window**

You edit these inside the Generate Plan card when using those workflows.

Tip: If you want projections to validate a plan all the way to a goal date, keep the projection window and the planning window aligned.

## 5.0 Workflow Overview (what each workflow emphasizes)

### 5.1 Budget

Use when you want budgets and plan-vs-actual tracking.

Includes: Accounts, Transactions, Budget, Projections.

### 5.2 General

Use for flexible planning with summary totals.

Includes: Summary Cards, Accounts, Transactions, Projections.

### 5.3 Funds

Use to model a pooled fund with NAV and share-based ownership.

Includes: Funds Summary, Accounts, Transactions, Projections.

### 5.4 Debt Repayment

Use to model payoff timelines and interest.

Includes: Debt Summary Cards, Accounts, Transactions, Projections (plus variable-rate schedules on accounts).

### 5.5 Goal-Based

Use for simple, per-account goals.

Includes: Accounts (with goal fields), Generate Plan, Transactions, Projections.

### 5.6 Advanced Goal Solver

Use for multi-goal planning with constraints and an applyable solution.

Includes: Generate Plan (solver), Transactions, Projections.

## 6.0 Recommended Pattern

1. Create a **Baseline** scenario and enter real starting balances.
2. Add planned income/expenses with recurrence.
3. Generate projections and confirm the baseline behaves as expected.
4. Duplicate the baseline for each what-if change (raise, new expense, debt strategy).
5. Compare ending balances, cash flow, and payoff dates across scenarios.
