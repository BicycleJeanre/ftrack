# General Scenario Concept Design

1.0 Purpose
1.1 A General scenario is the simplest planning mode in FTrack.
1.2 It is used for exploratory forecasting without budget enforcement.
1.3 It focuses on Accounts, Planned Transactions, Projections, and a lightweight summary.

2.0 Core Sections
2.1 Accounts
2.1.1 Define accounts and opening balances.
2.1.2 Account types (Asset, Liability, Equity, Income, Expense) behave as they do elsewhere in FTrack.

2.2 Planned Transactions
2.2.1 Model expected money flows using the standard transactions grid.
2.2.2 Recurrence and periodic change are used the same way as in other scenario types.

2.3 Projections
2.3.1 Projections are generated using the existing projection engine.
2.3.2 Projections provide point-in-time balances over the scenario window.

3.0 Summary At The Top
3.1 Goal
3.1.1 Provide an always-visible, minimal “at a glance” summary at the top of the forecast view.
3.1.2 Keep the summary read-only and derived from existing scenario data.

3.2 Summary Content
3.2.1 The summary is a totals block consistent with existing totals conventions.
3.2.2 Suggested values:
3.2.2.1 Money in
3.2.2.2 Money out
3.2.2.3 Net
3.2.2.4 Current net worth (optional)
3.2.2.5 Projected end net worth (optional)

3.3 Computation Timing
3.3.1 Report-time: summary reflects the latest scenario state after edits.
3.3.2 Refresh: summary recomputes when projections are regenerated.

4.0 Design Constraints and Reuse
4.1 Reuse existing grids and totals rendering.
4.2 Reuse the existing “Summary Cards” style used by Debt Repayment, but keep it to one compact overall card.
4.3 Avoid adding new data fields for General scenarios.

5.0 Invariants
5.1 General scenarios remain lightweight.
5.2 Summary never becomes a second reporting system; it is a small derived view.

6.0 Open Questions
6.1 Should the top summary show transaction totals for planned transactions only, or include actual transactions if shown?
6.2 Should net worth totals be shown, or keep the summary limited to money in/out/net?
