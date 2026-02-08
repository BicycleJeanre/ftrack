# Fund Scenario Concept Design

1.0 Purpose
1.1 A Fund scenario models a shared pool of assets with ownership expressed as shares per investor account.
1.2 It reuses the existing scenario structure: Accounts, Planned Transactions, and Projections, plus totals.
1.3 Primary goal: make “who owns what” clear without adding complex UX.

2.0 Core Concepts
2.1 Fund
2.1.1 The fund is the collection of accounts included in the scenario.
2.1.2 The fund has a reporting currency (same as existing scenario currency conventions).

2.2 Net Asset Value
2.2.1 Net Asset Value is the fund’s net worth at a point in time.
2.2.2 Conceptually: $\text{NAV} = \text{Assets} - \text{Liabilities}$.

2.3 Shares
2.3.1 Shares represent proportional ownership of the fund.
2.3.2 Shares are a derived view computed per investor account.
2.3.3 Total shares outstanding is computed as the sum of all investor shares.
2.3.4 Shares may be computed automatically or manually overridden for reporting.

2.4 Share Price
2.4.1 Share price is derived from the fund state.
2.4.2 Conceptually: $\text{Price} = \frac{\text{NAV}}{\text{Total Shares}}$ when total shares is non-zero.
2.4.3 When total shares is zero, share price is undefined and ownership reports should show “no investors yet”.
2.4.4 Share price can be computed on demand when reports are generated or refreshed.

3.0 Account Types and Their Role in a Fund
3.1 Asset Accounts
3.1.1 Represent fund holdings such as cash, bank, or investments.
3.1.2 Directly contribute to NAV.

3.2 Liability Accounts
3.2.1 Represent obligations such as fees payable, loans, or pending redemptions.
3.2.2 Reduce NAV.

3.3 Income Accounts
3.3.1 Represent fund income streams such as dividends, interest, or realized gains.
3.3.2 Increase NAV through profits.

3.4 Expense Accounts
3.4.1 Represent fund costs such as management fees and operating costs.
3.4.2 Decrease NAV through losses.

3.5 Equity Accounts
3.5.1 Represent ownership and claims on the fund.
3.5.2 In a Fund scenario, Equity accounts are investors.
3.5.3 Investor equity accounts keep their existing monetary balance only; share ownership is computed as a reporting layer on top.

4.0 Ownership and Share Calculations
4.0.1 A Fund scenario should not require changing the existing scenario or account data model.
4.0.2 Shares are calculated from the fund’s value and investor capital flows, using a consistent pricing policy.
4.0.3 Default distribution policy: distributions move value but do not change shares.
4.0.4 Share policy modes
4.0.4.1 Locked shares default: shares are user-driven, can be manually adjusted, and do not change automatically.
4.0.4.2 Initial shares default: the first investor share counts are set under Locked shares.
4.0.4.3 Automatic shares optional: user can switch the scenario to automatic recalculation where shares change for buy ins and redemptions using the share price at the effective date.
4.0.5 Computation timing
4.0.5.1 Report-time: compute shares, totals, and share price when generating the summary.
4.0.5.2 Point-in-time: compute shares, totals, and share price at a specific date, then refresh or regenerate to update.
4.1 Investor Buy In
4.1.1 A buy in increases fund assets and increases the investor’s equity claim.
4.1.2 The investor’s derived shares increase based on the share price at the effective date.

4.2 Investor Redemption
4.2.1 A redemption decreases fund assets and decreases the investor’s equity claim.
4.2.2 The investor’s derived shares decrease based on the share price at the effective date.

4.3 Distributions
4.3.1 Distributions move value from the fund to investors.
4.3.2 Two interpretations matter for reporting:
4.3.2.1 Value moves, shares unchanged: cash leaves the fund to investors, NAV drops, total shares stays the same, share price drops.
4.3.2.2 Shares change: treat it like a redemption, where investors receive cash and their shares are cancelled, so total shares drops.
4.3.3 Default for Funds: value moves with shares unchanged.

4.4 Fees and Expenses
4.4.1 Fees reduce NAV.
4.4.2 Fee handling should not require special transaction types; it should work with existing expense patterns.

4.5 Valuation Changes
4.5.1 Valuation changes adjust asset values and therefore NAV.
4.5.2 Share price changes naturally as NAV changes.

5.0 Reporting Requirements
5.1 Fund Summary Accordion or Summary Page
5.1.1 Purpose: a single summary area that reuses the Debt Repayment “summary cards” pattern.
5.1.2 Layout: one summary section with a scope selector based on account type.
5.1.3 The scope selector drives both the totals card and the detail view.
5.1.4 Reports should support both report-time and point-in-time views, with a simple refresh or regenerate action.

5.1.3 Shared Totals Block
5.1.3.1 The same totals block should be shown for any scope.
5.1.3.2 Scopes should include: All Accounts and a specific account type.
5.1.3.2.1 Asset
5.1.3.2.2 Liability
5.1.3.2.3 Equity
5.1.3.2.4 Income
5.1.3.2.5 Expense
5.1.3.3 Totals shown:
5.1.3.3.1 NAV
5.1.3.3.2 Total shares
5.1.3.3.3 Share price
5.1.3.3.4 Money in, money out, and net over the period using the existing totals conventions

5.1.4 Detail View
5.1.4.1 The detail view follows the selected scope.
5.1.4.2 Equity scope: show an investor-style breakdown with columns:
5.1.4.2.1 Account name
5.1.4.2.2 Shares owned
5.1.4.2.3 Ownership percent of total shares
5.1.4.2.4 Implied value at current share price
5.1.4.2.5 Net contributions and net redemptions over the scenario window
5.1.4.3 Non-equity scopes: show a simple per-account overview suitable for that account type.
5.1.4.4 All Accounts scope: show a grouped overview by account type.

5.2 All Accounts Overview
5.2.1 Purpose: reuse the same summary layout for a broader view.
5.2.2 Includes all account types with a type grouping, while keeping the investor breakdown focused on equity investors.

6.0 UI Design Constraints and Reuse
6.1 Reuse Existing Grids
6.1.1 Accounts grid remains the primary place to define accounts and balances.
6.1.2 Transactions grid remains the primary place to define planned flows.
6.1.3 Projections remain the primary place to view time-based outcomes.

6.2 Reuse Existing Totals Sections
6.2.1 Keep the existing totals area patterns.
6.2.2 Add a small fund-specific totals block conceptually limited to NAV, total shares, and share price.
6.2.3 Present fund summary information using the Debt Repayment summary cards pattern, without adding new navigation.

6.3 Keep It Simple
6.3.1 One share class only.
6.3.2 One reporting currency per scenario.
6.3.3 No changes to the base data model; ownership should be inferable from existing entries.

7.0 Invariants and Guardrails
7.1 Ownership should always reconcile
7.1.1 If shares exist, the implied investor values should sum to approximately NAV.
7.1.2 Differences should be explainable by rounding and configured policies.

7.2 Account Type Meaning Must Stay Intact
7.2.1 Assets and liabilities drive NAV.
7.2.2 Income and expense explain changes in NAV.
7.2.3 Equity explains who owns NAV.

8.0 Open Questions
8.1 Switching from Locked shares to Automatic shares applies only from a chosen effective date.
