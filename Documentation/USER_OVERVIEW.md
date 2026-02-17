# Overview

## 1.0 Purpose

FTrack documentation is displayed dynamically from Markdown files in the repository.

## 1.1 How This Page Works

1. Documentation files live under the `Documentation/` folder.
2. The app generates a manifest at build time in `assets/docs-manifest.json`.
3. The documentation UI loads the manifest, builds the sidebar, and renders Markdown content.

## 1.2 Document Categories

Categories are inferred from filename prefixes.

- `CONCEPTS_` files: User-facing concepts and how-to explanations
- `Plans/` folder: Planning and implementation notes
- `TECH_` files: Technical documentation
- `USER_` files: User documentation

New prefixes automatically create new categories.

## 1.3 Adding Or Updating Docs

1. Add or edit a Markdown file under `Documentation/`.
2. Ensure the first line is a clear document title using a `#` header.
3. Run `npm run docs:manifest` to regenerate `assets/docs-manifest.json`.

## 1.4 Deep Links

Docs can be deep-linked using the hash format.

- `#repo-docs/<docId>`

The `docId` is based on the filename without extension.

## 2.0 Choosing A Scenario Type

2.1 Budget.

2.1.1 Use when you want plan vs actual tracking and a budget workflow.

2.2 General.

2.2.1 Use for flexible what-if planning without the budget grid.

2.3 Funds.

2.3.1 Use to model a shared pool with NAV and share-based ownership.

2.4 Debt Repayment.

2.4.1 Use for payoff timelines, interest, and payoff dates.

2.5 Goal-Based.

2.5.1 Use for simple per-account goals and a single generated contribution plan.

2.6 Advanced Goal Solver.

2.6.1 Use for multiple goals across accounts with constraints and an applyable solution.

## 3.0 Choosing Goal Planning Mode

3.1 If you want to reach a savings target.

3.1.1 Use Goal-Based when one account goal is enough and you want one generated contribution transaction.

3.1.2 Use Advanced Goal Solver when you need constraints such as max outflow per month, locked accounts, or floors.

3.2 If you want to pay off a debt by a date.

3.2.1 Use Debt Repayment when you want to experiment with payment sizes and see payoff metrics.

3.2.2 Use Advanced Goal Solver when you want the tool to solve for the required monthly movement under constraints.

3.3 Related documents.

3.3.1 Goal Planning guide. [Goal Planning](#repo-docs/USER_GOAL_PLANNING)

3.3.2 Advanced Goal Solver guide. [Advanced Goal Solver](#repo-docs/USER_ADVANCED_GOAL_SOLVER)

3.3.3 Debt Repayment guide. [Debt Repayment](#repo-docs/USER_DEBT_REPAYMENT)

3.3.4 Scenario type overview. [Scenario Planning](#repo-docs/CONCEPTS_SCENARIOS)
