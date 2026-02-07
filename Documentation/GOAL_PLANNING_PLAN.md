# Goal-Based Planning: Implementation Plan

**Version**: 1.0.0  
**Date**: February 4, 2026

---

## 1.0 Overview

Goal-Based Planning is implemented by storing a target amount and target date directly on each account, then generating standard transactions from a **Generate Plan** section. The resulting transactions appear in the normal transactions grid and are used by the exi
sting projection engine.

---

## 2.0 User Interface

### 2.1 Accounts Grid

**Goal fields stored on the account**:
- **Goal Amount** (currency)
- **Goal Date** (date)

Accounts grid includes these two editable columns. These values are persisted on the account.

### 2.2 Generate Plan Section

A **Generate Plan** accordion appears below Accounts. It lets the user adjust parameters that are **not stored** on the account itself and preview the calculated output before generating transactions.

**Inputs (not stored on account)**:
- **Solve For**: Contribution Amount | Goal Date | Goal Amount
- **Contribution Frequency**: Weekly | Monthly | Quarterly | Yearly
- **Contribution Amount** (editable when Solve For ≠ Contribution Amount)

**Read-only outputs**:
- Calculated value for the selected Solve For
- Summary line (e.g., “$323/month to reach $10,000 by Dec 2026”)

**Actions**:
- **[Generate]**: Creates transactions based on current parameters
- **[Reset]**: Resets Generate Plan inputs to defaults

### 2.3 Transactions Grid

Generated transactions are standard transactions and appear alongside manual ones:
- Fully editable
- Can be deleted or duplicated
- Optional tag: `goal-generated`

### 2.4 Projections

No new projection system is added. Projections are generated from the transactions list using the existing projection engine.

---

## 3.0 User-Adjustable Parameters

### 3.1 Stored on Account

These values are persisted on the account:
- **Goal Amount**
- **Goal Date**

### 3.2 Adjustable in Generate Plan

These values are adjustable per generation and are **not persisted** on the account:
- **Solve For**
- **Contribution Frequency**
- **Contribution Amount** (if not solving for amount)

### 3.3 Recalculation Rules

When a user edits any input in Generate Plan, the system recalculates immediately:
- Changing **Goal Date** recalculates contribution amount (same goal amount)
- Changing **Contribution Amount** recalculates goal date (same goal amount)
- Changing **Goal Amount** recalculates contribution amount (same date)
- Changing **Frequency** recalculates per‑period contribution

---

## 4.0 Reuse of Existing Functionality

- **Transactions model**: generated items are standard `scenario.transactions[]` entries
- **Recurrence**: uses existing recurrence structure and `generateRecurrenceDates()`
- **Periodic change**: uses existing periodic change structure when applied to the generated transaction
- **Projection engine**: uses `projection-engine.js` with no changes to inputs
- **Managers**: reuse `TransactionManager` and `AccountManager` patterns

---

## 5.0 New Functionality Added

### 5.1 Account Fields

Add to account schema:
- `goalAmount: number | null`
- `goalDate: string | null`

### 5.2 Goal Calculation Utility

New utility module for solving goal math:
- Calculate contribution amount per selected frequency
- Calculate goal date when contribution amount is fixed
- Calculate goal amount when date and contribution amount are fixed

### 5.3 Generate Plan UI

New UI section for:
- Solve For selection
- Frequency selection
- Contribution amount input
- Live recalculation and summary
- Generate button to create transactions

### 5.4 Transaction Generation

Generated transaction uses standard shape:
- `primaryAccountId` set to the selected account
- `transactionTypeId` set to Money In (or Money Out for liabilities)
- `recurrence` based on selected frequency and goal date
- Optional `periodicChange` based on existing account settings
- `tags: ['goal-generated']` for identification

---

## 6.0 Output

The system’s only outputs are:
- Updated account goal fields
- Generated transactions in `scenario.transactions[]`
- Projections calculated from those transactions
