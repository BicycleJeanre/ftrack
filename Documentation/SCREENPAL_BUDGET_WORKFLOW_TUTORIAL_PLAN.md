# ScreenPal Budget Workflow Tutorial Plan

## 1. Purpose

This document is a production-ready plan for recording a silent ScreenPal tutorial that walks an end user through a basic FTrack budget workflow.

Scope is intentionally narrow:

- Use the **Budget** workflow only.
- Show only a **basic end-user budget flow**.
- Use **typed text, hovers, click callouts, and pop-up tooltips** instead of voice-over.
- Keep user effort minimal by using the current UI exactly as it exists.

## 2. Verified Current App Behavior

This plan is based on the current code, not older docs alone.

Verified in:

- `js/shared/workflow-registry.js`
- `js/ui/components/forecast/forecast-layout.js`
- `js/ui/controllers/forecast-controller.js`
- `js/ui/components/grids/accounts-grid.js`
- `js/ui/components/grids/transactions-grid.js`
- `js/ui/components/grids/budget-grid.js`
- `js/ui/components/forecast/forecast-projections-section.js`
- `js/app/managers/budget-manager.js`
- `js/domain/calculations/projection-engine.js`

Current behavior that matters for the tutorial:

1. The left sidebar has a **Workflows** section, and **Budget** is a selectable workflow.
2. Scenarios are created from the **Scenarios** sidebar section using the `⊕` button with tooltip **Add New Scenario**.
3. Scenario naming is edited by selecting the scenario card, then clicking the selected card again.
4. The Budget workflow shows these sections: **Accounts**, **Transactions**, **Budget**, and **Projections**.
5. Accounts are added from the **Accounts** section filter modal: hover `⚙`, then click `+`.
6. Transactions are added from the **Transactions** section filter modal: hover `⚙`, then click `+`.
7. Transaction cards support editing:
   - Type
   - Secondary Account
   - Amount
   - Description
   - Date
   - Status
   - Tags
   - Recurrence
   - Periodic Change
8. Budget entries are generated from planned transactions from the **Budget** filter modal using the `⊞` button with tooltip **Generate from Expanded Transactions**.
9. The budget window is separate from the projection window.
10. Budget rows can be marked actual with the checkbox on each budget card.
11. When a budget row is toggled to actual, the app auto-fills actual amount and actual date if they are empty.
12. Projections are generated from the **Projections** filter modal:
   - `⊞` = **Set projection period**
   - `⊕` = **Generate projections**
   - `↺` = **Regenerate projections**
13. The engine supports projection source = `budget`, but the current visible UI does **not** expose a source toggle. Do not script a “Project from Budget” step.

## 3. Recording Strategy

Record one master tutorial and export optional chapter cuts from the same timeline.

Recommended deliverables:

1. **Master video**: 4 to 6 minutes.
2. **Chapter 1**: Choose workflow and create scenario.
3. **Chapter 2**: Add accounts.
4. **Chapter 3**: Add planned transactions.
5. **Chapter 4**: Generate projections and generate budget.
6. **Chapter 5**: Mark actuals and review.

Why this structure works:

- One recording pass keeps production effort low.
- Short chapter exports are easier to reuse in docs, onboarding, and support.
- The user sees one clean story from setup to budget tracking.

## 4. ScreenPal Setup Assumptions

I could not locate public ScreenPal documentation to verify product-specific labels or feature names. The setup below assumes ScreenPal supports a standard tutorial workflow with:

- Projects
- Scenes or timeline sections
- Screen recording
- Cursor highlight
- Click emphasis
- Timed text overlays
- Callouts or tooltip-style popups
- Chapter or per-scene export

If ScreenPal uses different labels, map them 1:1.

## 5. Recommended ScreenPal Project Setup

### 5.1 Project Metadata

- Project name: `FTrack - Basic Budget Workflow`
- Subtitle: `Silent typed tutorial for first-time budget users`
- Aspect ratio: `16:9`
- Resolution: `1920x1080`
- Frame rate: `30 fps`

### 5.2 Recording Rules

- Record the full browser window, not a cropped region.
- Keep the browser zoom at `100%`.
- Use one clean browser profile if possible.
- Turn off unrelated bookmarks/toolbars if they create visual noise.
- Keep cursor movement deliberate and slightly slower than normal.
- Pause `0.5s` before each important click.
- Leave hovers visible long enough for icon tooltips to appear.

### 5.3 Overlay Rules

Use one repeating pattern for every scene:

1. **Step title**
2. **What to do**
3. **Why it matters**

Recommended visual system:

- Step title: short, top-left, bold
- Action text: sentence case, 1 line
- Why text: sentence case, 1 line
- Hover tooltip callouts: small and anchored near the icon or field

Recommended timing:

- Step title appears immediately
- Action text types in over `1.0s`
- Why text types in over `1.2s`
- Fade out both before the next click sequence

### 5.4 Cursor/Click Effects

- Enable cursor highlight
- Enable click pulse
- Do not use heavy zoom punches unless the icon is too small
- For icon-only buttons, always hover first so the tooltip appears

### 5.5 Scene Structure In ScreenPal

Create these scenes:

1. Title card
2. Select Budget workflow
3. Create and rename scenario
4. Add accounts
5. Add paycheck transaction
6. Add rent transaction
7. Add groceries transaction
8. Add utilities transaction
9. Set projection period and generate projections
10. Generate budget from planned transactions
11. Mark actuals in the budget
12. Review totals and close

## 6. Demo Data To Use

Use this sample data so the tutorial stays concrete and the budget output is easy to follow.

### 6.1 Scenario

- Scenario name: `April Budget Baseline`
- Scenario description: `Basic household plan`

### 6.2 Accounts

1. `Checking`
   - Type: `Asset`
   - Starting Balance: `2500`
2. `Salary`
   - Type: `Income`
   - Starting Balance: `0`
3. `Housing`
   - Type: `Expense`
   - Starting Balance: `0`
4. `Groceries`
   - Type: `Expense`
   - Starting Balance: `0`
5. `Utilities`
   - Type: `Expense`
   - Starting Balance: `0`

### 6.3 Planned Transactions

1. Paycheck
   - Type: `Money In`
   - Primary Account: `Checking`
   - Secondary Account: `Salary`
   - Amount: `3000`
   - Date: `2026-04-01`
   - Recurrence: `Monthly - Day of Month`
   - Day of Month: `1`

2. Rent
   - Type: `Money Out`
   - Primary Account: `Checking`
   - Secondary Account: `Housing`
   - Amount: `1200`
   - Date: `2026-04-03`
   - Recurrence: `Monthly - Day of Month`
   - Day of Month: `3`

3. Groceries
   - Type: `Money Out`
   - Primary Account: `Checking`
   - Secondary Account: `Groceries`
   - Amount: `150`
   - Date: `2026-04-05`
   - Recurrence: `Weekly`

4. Utilities
   - Type: `Money Out`
   - Primary Account: `Checking`
   - Secondary Account: `Utilities`
   - Amount: `200`
   - Date: `2026-04-12`
   - Recurrence: `Monthly - Day of Month`
   - Day of Month: `12`

### 6.4 Windows To Use

- Projection window:
  - Start: `2026-04-01`
  - End: `2026-06-30`
  - Period Type: `Month`
- Budget window:
  - Start: `2026-04-01`
  - End: `2026-04-30`

Why these dates:

- Three months makes projections useful.
- One month keeps the budget list easy to read.
- The difference also demonstrates that projection and budget windows are separate.

## 7. Production Guardrails

These points should shape the recording:

1. Do **not** say “set the projection window on the scenario row.” The current UI uses the **Projections** modal, not a scenario row editor.
2. Do **not** say “Regenerate from Planned Transactions” as a visible button label. In the current UI, the budget action is an icon button with tooltip **Generate from Expanded Transactions**.
3. Do **not** script a visible “Project from Budget” control. The engine supports it, but the current UI does not expose it.
4. Keep the transaction and budget perspective focused on **Checking** so the card list stays understandable.
5. Hover icon buttons before clicking them so ScreenPal captures the tooltip text.

## 8. Master Tutorial Script

Use this as the actual ScreenPal timeline script.

### Scene 1. Title Card

- Duration: `6s`
- On-screen typed text:
  - Title: `Build a basic budget in FTrack`
  - Body: `Create a scenario, add accounts, plan recurring transactions, generate a budget, and track what actually happened.`
- Visual: Static view of Forecast page with Budget workflow available in the sidebar.

### Scene 2. Select Budget Workflow

- Duration: `12s`
- Action:
  - Hover **Budget** in the left **Workflows** list.
  - Click **Budget**.
- Typed text:
  - What: `Choose Budget to keep planning, budget tracking, and projections in one workflow.`
  - Why: `This is the fastest path for users who want plan-versus-actual budgeting.`
- Tooltip/callout:
  - Point to the left sidebar and label it `Workflow selector`

### Scene 3. Create And Rename A Scenario

- Duration: `20s`
- Action:
  - Hover the `⊕` button in **Scenarios** until **Add New Scenario** appears.
  - Click it.
  - Click the new scenario card to select it.
  - Click it again to edit.
  - Change name to `April Budget Baseline`.
  - Change description to `Basic household plan`.
- Typed text:
  - What: `Create a scenario for this version of your budget.`
  - Why: `Scenarios let users keep a clean baseline before they test changes later.`
- Tooltip/callout:
  - `Use scenarios for clean versioning`

### Scene 4. Add The Core Accounts

- Duration: `45s`
- Action:
  - In **Accounts**, hover `⚙` to show **Open filters**.
  - Click `⚙`.
  - Hover `+` to show **Add Account**.
  - Add and edit these accounts one by one:
    - `Checking`, `Asset`, `2500`
    - `Salary`, `Income`, `0`
    - `Housing`, `Expense`, `0`
    - `Groceries`, `Expense`, `0`
    - `Utilities`, `Expense`, `0`
- Typed text:
  - What: `Add the real cash account first, then add income and spending categories as accounts.`
  - Why: `FTrack uses account-to-account flows, so categories need to exist before transactions can point to them.`
- Tooltip/callout:
  - `Click a card to edit it`

### Scene 5. Add The Paycheck Transaction

- Duration: `30s`
- Action:
  - In **Transactions**, open `⚙`.
  - Keep the account filter on `Checking`.
  - Click `+`.
  - Open the new transaction card.
  - Enter:
    - Type: `Money In`
    - Secondary Account: `Salary`
    - Amount: `3000`
    - Description: `Paycheck`
    - Date: `2026-04-01`
  - Click **Recurrence**.
  - In the modal select:
    - `Monthly - Day of Month`
    - Start Date: `2026-04-01`
    - Day of Month: `1`
  - Save recurrence.
- Typed text:
  - What: `Create the main income transaction and make it recurring.`
  - Why: `Recurring income drives both projections and monthly budget generation.`
- Tooltip/callout:
  - `Keep Transactions filtered to Checking so new rows default to the cash account`

### Scene 6. Add The Rent Transaction

- Duration: `24s`
- Action:
  - Add another transaction from the Transactions filter modal.
  - Enter:
    - Type: `Money Out`
    - Secondary Account: `Housing`
    - Amount: `1200`
    - Description: `Rent`
    - Date: `2026-04-03`
  - Set recurrence:
    - `Monthly - Day of Month`
    - Start Date: `2026-04-03`
    - Day of Month: `3`
- Typed text:
  - What: `Add the largest fixed expense next.`
  - Why: `Large recurring bills shape the budget fastest, so users should model them first.`

### Scene 7. Add The Groceries Transaction

- Duration: `24s`
- Action:
  - Add another transaction.
  - Enter:
    - Type: `Money Out`
    - Secondary Account: `Groceries`
    - Amount: `150`
    - Description: `Groceries`
    - Date: `2026-04-05`
  - Set recurrence:
    - `Weekly`
    - Start Date: `2026-04-05`
- Typed text:
  - What: `Add a weekly variable expense.`
  - Why: `This makes the generated budget feel real, not just a list of monthly bills.`

### Scene 8. Add The Utilities Transaction

- Duration: `22s`
- Action:
  - Add another transaction.
  - Enter:
    - Type: `Money Out`
    - Secondary Account: `Utilities`
    - Amount: `200`
    - Description: `Utilities`
    - Date: `2026-04-12`
  - Set recurrence:
    - `Monthly - Day of Month`
    - Start Date: `2026-04-12`
    - Day of Month: `12`
- Typed text:
  - What: `Add one more routine expense to complete the starter plan.`
  - Why: `Users only need a few recurring items to get a useful first budget.`

### Scene 9. Set The Projection Period And Generate Projections

- Duration: `30s`
- Action:
  - In **Projections**, hover `⚙`, then click it.
  - Hover `⊞` to show **Set projection period**.
  - Click `⊞`.
  - Set:
    - Start Date: `2026-04-01`
    - End Date: `2026-06-30`
    - Period Type: `Month`
  - Confirm.
  - Hover `⊕` to show **Generate projections**.
  - Click `⊕`.
- Typed text:
  - What: `Set a three-month projection window and generate the forecast.`
  - Why: `Users need a forward view to confirm the plan stays sustainable beyond one pay cycle.`
- Tooltip/callout:
  - `Set period first, then generate`

### Scene 10. Generate The Budget From Planned Transactions

- Duration: `30s`
- Action:
  - In **Budget**, hover `⚙`, then click it.
  - Hover `⊞` to show **Generate from Expanded Transactions**.
  - Click `⊞`.
  - Set:
    - Start Date: `2026-04-01`
    - End Date: `2026-04-30`
  - Confirm.
  - Let the budget cards render.
- Typed text:
  - What: `Expand the planned transactions into a month of budget entries.`
  - Why: `This turns the high-level plan into individual dated items the user can track during the month.`
- Tooltip/callout:
  - `Budget window is separate from the projection window`

### Scene 11. Mark Real Spending As Actual

- Duration: `35s`
- Action:
  - In the Budget card list, mark the `Rent` entry as actual using the checkbox.
  - Open the rent card and change:
    - Actual Amount: `1185`
    - Actual Date: `2026-04-03`
  - Mark one `Groceries` occurrence as actual.
  - Open it and change:
    - Actual Amount: `142`
    - Actual Date: `2026-04-05`
- Typed text:
  - What: `Mark completed items as actual and adjust the amount when reality differs from plan.`
  - Why: `This is where the budget becomes useful for real tracking instead of static planning.`
- Tooltip/callout:
  - `The checkbox auto-fills actual amount and date, so edits are only needed for variance`

### Scene 12. Review The Budget Totals

- Duration: `18s`
- Action:
  - Pause on the budget totals card.
  - Hover over:
    - `Realized Net`
    - `Open Commitments`
    - `Forecast Position`
- Typed text:
  - What: `Read the budget totals after a few entries are marked actual.`
  - Why: `Users can immediately see what has happened, what is still outstanding, and where the month is likely to land.`

### Scene 13. Close On The Projection View

- Duration: `16s`
- Action:
  - Return focus to **Projections**.
  - Briefly show the generated projection cards.
- Typed text:
  - What: `Use projections to confirm the budget still supports healthy balances.`
  - Why: `A budget is stronger when it is linked to a forward cash-flow view, not just a static checklist.`

### Scene 14. End Card

- Duration: `6s`
- Typed text:
  - Title: `Basic budget workflow complete`
  - Body: `Create the plan, generate the budget, track actuals, and review the forecast.`

## 9. Copy-Paste Overlay Text Library

Use these lines directly in ScreenPal as scene text.

### 9.1 Short Step Titles

1. `Choose the Budget workflow`
2. `Create a scenario`
3. `Add the core accounts`
4. `Add recurring income`
5. `Add fixed expenses`
6. `Add weekly spending`
7. `Generate projections`
8. `Generate the budget`
9. `Mark actual spending`
10. `Review the totals`

### 9.2 Action + Why Lines

1. `Choose Budget so planning, tracking, and projections stay together.`
2. `Create a scenario so this version of the budget has a clean baseline.`
3. `Add accounts first because transactions move between accounts.`
4. `Create recurring income because future cash flow starts with reliable inflows.`
5. `Model large monthly bills first because they drive the budget fastest.`
6. `Add weekly groceries so the budget reflects real month-to-month spending.`
7. `Generate projections to test whether the plan stays sustainable.`
8. `Generate the budget to turn recurring plans into dated monthly items.`
9. `Mark items actual so the budget reflects what really happened.`
10. `Review the totals so users can compare realized results against open commitments.`

## 10. Editing Notes For ScreenPal

### 10.1 Typing Style

- Type overlays at a medium pace, not instant.
- Keep each overlay on screen long enough to read once without pausing.
- Do not stack more than two text blocks at a time.

### 10.2 Hover Style

- For every icon-only action, show:
  - hover
  - tooltip appears
  - click

This is critical because the current UI uses many icon-only buttons.

### 10.3 Pacing

- Slow down slightly when opening:
  - filter modals
  - recurrence modal
  - timeframe modal
- Pause after budget generation and after projection generation so the result can register.

## 11. Recommended Export Set

### 11.1 Master Export

- Name: `ftrack-basic-budget-workflow.mp4`
- Use case: onboarding, docs landing page, product walkthrough

### 11.2 Chapter Exports

1. `ftrack-budget-01-workflow-and-scenario.mp4`
2. `ftrack-budget-02-accounts.mp4`
3. `ftrack-budget-03-planned-transactions.mp4`
4. `ftrack-budget-04-projections-and-budget.mp4`
5. `ftrack-budget-05-actuals-and-review.mp4`

## 12. Final Checklist Before Recording

1. Start from an empty or clean scenario set.
2. Confirm the sidebar is visible.
3. Confirm the Budget workflow is selectable.
4. Record all icon hovers long enough for tooltips to appear.
5. Use the exact sample values in this document.
6. Keep the Transactions filter on `Checking` during transaction entry.
7. Use the exact projection and budget windows in this document.
8. Do not include any step that implies a visible “Project from Budget” button.

## 13. Optional Follow-Up Variant

If you want a second tutorial later, the easiest follow-up is:

- `How to update the budget mid-month`

That version can reuse the same scenario and show:

1. Edit a planned transaction
2. Regenerate the budget
3. Show that existing actuals are preserved
4. Regenerate projections

That would be the next-best companion video after this basic workflow.
