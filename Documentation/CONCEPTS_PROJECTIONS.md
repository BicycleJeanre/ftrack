# Projections Guide

## 1.0 Projections Guide

## 1.1 Understanding Projections

- **Forecast grid**: See projected account balances over time.
- **How they work**: Start with current balance, add income, subtract expenses.
- **Freshness**: Plan changes mark projections stale and trigger an automatic
  refresh.
- **Scenario comparison**: Validate which plan is most sustainable.

## 1.2 Using Projections

Projections show you where your finances are headed based on account balances and the resolved plan.

The resolved plan combines:

- actual occurrences at their actual amount and date;
- remaining planned occurrences at their latest planned amount and date;
- future occurrences generated from recurring rules;
- manual planned or actual occurrences; and
- no movement for occurrences marked skipped.

There is one projection source: the resolved plan. SchemaVersion 44 does not
store or display a transactions-versus-budget source choice.

1. Ensure your accounts, transaction rules, and dated Plan & Actuals items are
   set up correctly.
2. Set the scenario **projection window** (Start, End, Period Type) in the scenario list at the top of Forecast.
3. Allow automatic refresh to complete, or click **Refresh projections now**
   for an immediate calculation.
4. Review the projected balances for each account over the projection window.
5. Identify any accounts that go negative or reach critical levels.
6. Adjust transactions or income as needed to improve the forecast.

## 1.3 Interpreting The Projection Grid

The projection grid displays each account as a column and each time period as a row. Each cell shows the projected balance at that point in time.

- Red values indicate negative balances, overspending.
- Green values indicate positive balances, healthy savings.
- Watch for trends: steadily declining or rising balances indicate unsustainable patterns.
- Compare multiple scenarios to find the most sustainable plan.

## 1.4 Refining Your Projections

Projections are only as good as your data. Here is how to improve accuracy.

- Keep account balances current, weekly updates.
- Review recurring rules and upcoming period occurrences regularly.
- Use recurrence for all repeating payments.
- Add periodic changes for salary increases or known expense changes.
- Record actuals and occurrence adjustments in **Plan & Actuals**.
- An actual replaces its matching planned occurrence; it is not added beside it.
- Manual unplanned actuals and skipped occurrences are reflected when projections are recalculated.

## 1.5 Projection Freshness

Projection rows have an explicit current/stale lifecycle.

- A rule, occurrence, account, or projection-policy edit marks the stored
  projection stale immediately.
- The projection card may retain old rows for reference, but labels them stale
  and does not present them as synchronized results.
- A successful recalculation replaces the rows, records the generated time, and
  clears the stale marker.
- Schema migration clears old rows and marks projections stale because their
  source provenance cannot be guaranteed under the new rule/occurrence model.
- `staleReason` records why refresh is required, while `staleAt` records when
  the state changed.

## 1.6 View By (display grouping)

The Projections card includes a **View By** selector.

- View By changes how the grid is grouped for display (for example, Month vs Week).
- It does not change the projection engine’s Period Type.

## 1.7 Scenario Comparison

Create multiple scenarios with different assumptions to compare outcomes.

- **Baseline**: Your expected reality.
- **Conservative**: Higher expenses, lower income.
- **Optimistic**: Lower expenses, higher income.
- **What-if**: Test specific changes like a new job or expense.
