# Getting Started

## 1.0 Build Your First Plan

FTrack combines transaction planning, budget tracking, actuals, and
projections. Recurring rules create dated occurrences automatically, so there
is no separate transaction-to-budget generation step.

Use the in-app documentation in either of two ways:

- Open **Workflow Guide: Plan, Track, and Project** when you know the outcome
  you want and need to choose the right workflow.
- Open **Interface Guide: Controls, Tables, and Editing** when you are already
  on a screen and need to understand its controls or actions.

## 1.1 Key Concepts

- **Scenario**: an independent version of your accounts, transaction rules,
  occurrences, baselines, and projections.
- **Workflow**: a Forecast UI preset. It changes which cards are visible, not
  the scenario data.
- **Rule**: a one-time or recurring expected money movement.
- **Occurrence**: one dated instance of a rule, or a manual planned/actual
  item.
- **Baseline**: the frozen plan used for later variance comparisons.
- **Projection window**: the Start, End, and Period Type stored on the
  scenario. It controls the calculation horizon.

## 1.2 Step by Step

1. Go to **Forecast** and select **Budget** in the left navigation.
2. Create a scenario with **+ Add New**, or select an existing scenario.
3. Set the scenario's projection **Start**, **End**, and **Period Type**.
   Month is a useful starting point.
4. Add the accounts used by your money movements, including opening balances.
5. Open **Plan & Actuals → Recurring** and add the rules that normally repeat:
   paychecks, rent, utilities, groceries, subscriptions, transfers, and other
   expected movements.
6. Open **Plan & Actuals → Period**. FTrack resolves the rules into dated
   occurrences automatically.
7. Add one-time items or exceptions directly in Period. When editing a linked
   recurring item, choose:
   - **This occurrence only** for a one-off change.
   - **This and future** for a new amount or schedule going forward.
   - **Entire series** for the current and future segments of the series.
8. Click **Freeze baseline** when the selected period's plan is ready. The
   first actual in an unfrozen period also freezes it automatically.
9. Record reality:
   - click **Mark actual** for something that happened;
   - edit the actual amount or date when it differs;
   - use **Skip occurrence** for something that will not happen; or
   - use **Add item** to record an unexpected actual.
10. Review **Projections**. Plan and actual changes mark projections stale and
    trigger an automatic refresh. Use **Refresh projections now** if you do not
    want to wait.

## 1.3 Reading Money Movements

- **Money In** flows from the secondary/source account into the
  primary/receiving account.
- **Money Out** flows from the primary/source account to the
  secondary/receiving account.

In Period, the description appears on a separate line below the movement so
income and expense items are easier to tell apart.

## 1.4 A Simple First-Month Routine

At the start of the period:

1. Review the dated occurrences.
2. Add known one-time costs.
3. Freeze the baseline.

During the period:

1. Mark linked items actual as they happen.
2. Record unexpected actuals.
3. Skip cancelled items.

At the end of the period:

1. Compare Baseline, Current plan, Actual, and variance.
2. Turn a manual cost that is likely to repeat into a rule with
   **Repeat going forward**.
3. Use **This and future** to adjust an existing recurring rule based on what
   you learned.
4. Confirm the Projections header returns to **Current**.

## 1.5 Choosing Another Workflow

- **General**: accounts, Plan & Actuals, projections, and summary totals.
- **Funds**: pooled-fund and ownership analysis plus Plan & Actuals.
- **Debt Repayment**: payoff timelines, interest, variable-rate schedules, and
  Plan & Actuals.
- **Goal Workshop**: Simple and Advanced Generate Plan modes plus Plan &
  Actuals.

Every primary workflow supports period baselines, actuals, skips, and variance
tracking through the same Plan & Actuals card. Budget simply opens on Period;
the other primary workflows open on Recurring.

## 1.6 Troubleshooting

### 1.6.1 Plan & Actuals Is Not Visible

Select any primary workflow: **Budget**, **General**, **Funds**, **Debt
Repayment**, or **Goal Workshop**. Detail shortcuts intentionally isolate one
surface.

### 1.6.2 Generate Plan Is Not Visible

Select **Goal Workshop**, then choose Simple or Advanced mode in the Generate
Plan card.

### 1.6.3 Period Is Empty

Confirm the scenario is selected, its accounts exist, and at least one rule or
manual item overlaps the selected period. Check the View and Period controls.

### 1.6.4 Projections Are Blank or Stale

Confirm the scenario has a valid projection Start, End, and Period Type. Wait
for automatic refresh or click **Refresh projections now**.

### 1.6.5 Import Fails

Current exports use schemaVersion 44. Import opens an in-app Data Upgrade
Review before anything is replaced. Check its Validation, What Changed, and
Warnings and Recovery sections. You can download both the complete change
report and the upgraded JSON. Import remains disabled for malformed data,
validation failures, or future schema versions.

Select **Data Check > Current Browser Data** to run the same review against the
raw JSON already stored in this browser. Older browser data is also intercepted
at startup and remains unchanged until you approve the upgrade.
