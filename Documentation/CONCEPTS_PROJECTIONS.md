# Projections Guide

## 1.0 Projections Guide

## 1.1 Understanding Projections

- **Forecast grid**: See projected account balances over time.
- **How they work**: Start with current balance, add income, subtract expenses.
- **Recalculate**: Refresh projections after any change.
- **Scenario comparison**: Validate which plan is most sustainable.

## 1.2 Generating Projections

Projections show you where your finances are headed based on account balances and the resolved plan.

The resolved plan combines:

- actual occurrences at their actual amount and date;
- remaining planned occurrences at their latest planned amount and date;
- future occurrences generated from recurring rules;
- manual planned or actual occurrences; and
- no movement for occurrences marked skipped.

The legacy `transactions` versus `budget` projection-source setting is retained only for schemaVersion 43 compatibility. It no longer changes the calculation.

1. Ensure all your accounts and planned transactions are set up correctly.
2. Set the scenario **projection window** (Start, End, Period Type) in the scenario list at the top of Forecast.
3. Click **Generate Projections** in the Projections card.
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
- Review and update planned transactions regularly.
- Use recurrence for all repeating payments.
- Add periodic changes for salary increases or known expense changes.
- Record actuals and occurrence adjustments in Budget, then recalculate projections.
- An actual replaces its matching planned occurrence; it is not added beside it.
- Manual unplanned actuals and skipped occurrences are reflected when projections are recalculated.

## 1.5 View By (display grouping)

The Projections card includes a **View By** selector.

- View By changes how the grid is grouped for display (for example, Month vs Week).
- It does not change the projection engine’s Period Type.

## 1.6 Scenario Comparison

Create multiple scenarios with different assumptions to compare outcomes.

- **Baseline**: Your expected reality.
- **Conservative**: Higher expenses, lower income.
- **Optimistic**: Lower expenses, higher income.
- **What-if**: Test specific changes like a new job or expense.
