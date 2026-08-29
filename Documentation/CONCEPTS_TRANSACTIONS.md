# Transaction Rules and Occurrences

## 1.0 One Transaction-Based Plan

FTrack uses one transaction model for planning, budget tracking, and
projections. You do not create transactions in one place and then generate a
separate budget from them.

The model has two layers:

- **Transaction rules** describe expected one-time or recurring money
  movements.
- **Transaction occurrences** are the dated items produced by those rules.
  Occurrences also hold exceptions, actuals, skips, manual items, and frozen
  baseline values.

Projections resolve these two layers into the same dated timeline shown in
**Plan & Actuals**.

## 1.1 Transaction Rules

A rule answers: “What should normally happen?”

Examples include:

- a paycheck every second Friday;
- rent on the first day of each month;
- groceries every Saturday;
- an annual insurance payment; or
- a one-time purchase on a known date.

Create and maintain rules in **Plan & Actuals → Recurring** in any primary
workflow. In General, switch to **Period** to create and track the budget from
the dated occurrences produced by those same rules.

A rule may include:

- movement type: **Money In** or **Money Out**;
- primary and optional secondary account;
- amount and description;
- one-time or recurring schedule;
- tags; and
- a periodic amount change, such as an annual raise or inflation increase.

## 1.2 Money Movement

The movement label is always from the primary account's perspective:

- **Money In** flows from the secondary/source account into the
  primary/receiving account.
- **Money Out** flows from the primary/source account to the
  secondary/receiving account.

Examples:

| Movement | Primary account | Secondary account | Meaning |
|---|---|---|---|
| Money In | Checking | Salary Income | Salary flows into Checking |
| Money Out | Checking | Rent Expense | Rent flows out of Checking |
| Money Out | Checking | Savings | Money transfers from Checking to Savings |

The description appears on its own line under the movement in the Period
summary so similarly shaped movements remain easy to distinguish.

## 1.3 Period Occurrences

An occurrence answers: “What is planned or what happened on this date?”

Open **Plan & Actuals → Period** to see the occurrences for a selected Day,
Week, Month, Quarter, or Year. Repeating rules appear there automatically; no
generation step is required.

Most future occurrences stay derived from their rules. FTrack stores an
occurrence only when dated state must survive, including:

- a change to this occurrence only;
- an actual amount or date;
- a skipped occurrence;
- a manual planned or actual item; or
- a frozen baseline.

## 1.4 Editing Scope

Choose scope deliberately when changing a linked recurring occurrence:

- **This occurrence only** changes the selected dated item.
- **This and future** starts a new rule segment at the selected occurrence.
- **Entire series** changes the current and future segments in the logical
  series.

Changing the repeat pattern requires **This and future** or **Entire series**.
Past actuals remain protected from later rule edits.

In Recurring, duplication copies either one rule or the whole split set.
**End recurring series** bounds the logical series before its next unresolved
occurrence. It is history-safe: protected actual, skipped, and frozen evidence
is retained rather than destructively deleting the rule lineage.

Use **Duplicate item** to make a one-time planned copy. Use
**Repeat going forward** to turn a manual item into a recurring rule without
removing the original occurrence.

## 1.5 Baseline, Current Plan, and Actual

Each Period item can be compared across three values:

- **Baseline**: the plan frozen for comparison.
- **Current plan**: the latest planned amount after adjustments.
- **Actual**: the realized amount and date.

Click **Freeze baseline** when you want to lock the selected period before
tracking begins. If you do not freeze it explicitly, marking the first actual
in the period freezes it automatically.

Once frozen, later plan changes affect Current plan but not Baseline. This
makes the variance meaningful even when you improve the plan during the
period.

## 1.6 Tracking Reality

For a planned occurrence:

1. Click **Mark actual** when it happens.
2. Edit the item if the actual amount or date differs.
3. Use **Skip occurrence** if it will not happen.

For an unexpected movement, click **Add item** and create it as Actual. A
manual actual has a zero baseline and zero current plan, so it is counted as an
unplanned actual.

A matching actual replaces its planned occurrence in projections; it is not
added as a second movement.

## 1.7 A Useful Review Rhythm

- Review the upcoming Period at the start of each time period.
- Freeze the baseline when the plan is ready.
- Record actuals and exceptions during the period.
- At period end, compare Baseline, Current plan, Actual, and the variance
  totals.
- Turn newly learned repeating costs into rules with **Repeat going forward**,
  or revise an existing rule with **This and future**.

This rhythm lets the budget learn from prior periods without rebuilding it.
