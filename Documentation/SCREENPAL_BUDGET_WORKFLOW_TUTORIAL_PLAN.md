# ScreenPal Plan & Actuals Workflow Tutorial Plan

## 1.0 Purpose

Create a ScreenPal tutorial that teaches budget planning in the General
workflow from initial plan entry through period tracking and refreshed
projections.

The tutorial must show one connected model:

```text
Recurring rules
      ↓
Dated Period occurrences
      ↓
Baseline, Current plan, and Actual
      ↓
Resolved projections
```

The recording must not imply that users copy or generate a separate budget
from transaction rows. Period occurrences appear automatically from the rules.

## 2.0 Audience and Outcome

### 2.1 Audience

- New FTrack users.
- Existing users learning the unified Plan & Actuals workflow in General.
- Users whose largest problems are unexpected period costs, costs that later
  become recurring, and cumbersome future-plan adjustments.

### 2.2 By the End, the Viewer Can

1. Select General and create a scenario.
2. Add accounts and repeating rules.
3. Review the automatically resolved Period.
4. Freeze a baseline.
5. Adjust only one occurrence.
6. Record a linked actual and an unexpected actual.
7. Turn a newly learned manual cost into a recurring rule.
8. change an existing rule from one occurrence forward.
9. Interpret Baseline, Current plan, Actual, and variance totals.
10. Confirm projections are Current after plan changes.

## 3.0 Verified Product Behavior

Use these as recording guardrails.

### 3.1 Workflow and Cards

- Select **General** in the Forecast left navigation.
- General shows **Summary**, **Accounts**, **Plan & Actuals**, and **Projections**.
- Plan & Actuals switches between **Period** and **Recurring**.
- **Plan & Actuals (Detail)** provides an expanded version of the same card.

### 3.2 Recurring

- Recurring displays reusable transaction rules.
- A rule can be one-time or repeating.
- A non-split recurring edit requires **This and future** or
  **Entire series**.
- Split recurring rules use the shared split form and require
  **This and future** or **Entire series** scope.
- A split revision preserves its component grouping, recurrence, and linked
  account-group/rate metadata.
- Recurring can duplicate a normal rule or its whole split set.
- **End recurring series** stops before the next unresolved occurrence while
  preserving prior actual, skipped, and frozen history.

### 3.3 Period

- Period resolves dated occurrences from active rules automatically.
- Use View to select Day, Week, Month, Quarter, or Year.
- Use Period and previous/next controls to navigate.
- Use **Add item** for a manual planned or actual occurrence.
- Use **This occurrence only**, **This and future**, or **Entire series** when
  editing a linked recurring item.
- Use **Duplicate item** for a one-time planned copy.
- Use **Repeat going forward** to create a future rule from a manual item.

### 3.4 Baseline and Actuals

- **Freeze baseline** locks the comparison plan for the selected period.
- The first actual freezes an unfrozen period automatically.
- **Mark actual** can use the planned amount/date or be edited afterward.
- **Skip occurrence** excludes the item from projections.
- A manual Actual is treated as unplanned, with zero baseline and current
  plan.

### 3.5 Money Movement

- Money In flows from the secondary/source account into the
  primary/receiving account.
- Money Out flows from the primary/source account to the
  secondary/receiving account.
- In the Period summary, the description appears on its own line below the
  movement.

### 3.6 Projections

- Projections use the same resolved occurrence timeline as Plan & Actuals.
- A linked actual replaces its planned occurrence.
- Skipped occurrences are excluded.
- Plan-affecting edits mark projections stale and trigger an automatic refresh
  after a short debounce.
- The header shows **Pending**, **Stale**, **Stale · refreshing**, or
  **Current**.
- The immediate action tooltip is **Refresh projections now**.

## 4.0 Current Implementation References

Use these files if the UI changes before recording:

- `js/shared/workflow-registry.js`
- `js/ui/components/forecast/forecast-layout.js`
- `js/ui/controllers/forecast-controller.js`
- `js/ui/components/grids/plan-actuals-grid.js`
- `js/ui/components/grids/transactions-grid.js`
- `js/app/managers/occurrence-manager.js`
- `js/app/managers/projection-freshness.js`
- `js/domain/queries/resolve-scenario-occurrences.js`
- `js/domain/calculations/projection-engine.js`
- `js/ui/components/forecast/forecast-projections-section.js`
- `Documentation/USER_BUDGET_WORKFLOW.md`

Do not use deleted legacy budget manager/grid files as a reference.

## 5.0 Recording Format

### 5.1 Recommended Deliverables

Create one master recording and export:

1. **Full tutorial**: 8–12 minutes.
2. **Chapter 1 — Build the recurring plan**: 2–3 minutes.
3. **Chapter 2 — Review and adjust a period**: 2–3 minutes.
4. **Chapter 3 — Freeze and track actuals**: 2–3 minutes.
5. **Chapter 4 — Learn and update the future**: 2–3 minutes.
6. **Short clip — Unexpected cost to repeating rule**: 45–75 seconds.

### 5.2 Recording Style

- Record at a readable desktop width.
- Keep the cursor visible and deliberate.
- Pause briefly after every save or mode change.
- Zoom only when a control or variance needs emphasis.
- Hide personal browser data and unrelated tabs.
- Use callouts sparingly; the product state should carry the explanation.

### 5.3 Language

Prefer:

- rule;
- occurrence;
- Period;
- Recurring;
- baseline;
- current plan;
- actual;
- resolved plan; and
- refresh projections.

Avoid legacy language that suggests separate transaction, budget, and actual
datasets.

## 6.0 Demonstration Data

Use fictional values and a clean browser profile.

### 6.1 Scenario

- Name: `Household Plan Tutorial`
- Projection Start: `2026-04-01`
- Projection End: `2026-06-30`
- Projection Period Type: `Month`
- Plan & Actuals View: `Month`
- Selected Period: April 2026

### 6.2 Accounts

| Account | Type | Opening balance |
|---|---|---:|
| Main Checking | Asset | 4,200 |
| Emergency Savings | Asset | 8,000 |
| Salary Income | Income | 0 |
| Rent Expense | Expense | 0 |
| Groceries Expense | Expense | 0 |
| Utilities Expense | Expense | 0 |
| Transport Expense | Expense | 0 |

### 6.3 Initial Rules

| Description | Movement | Primary | Secondary | Amount | Repeat |
|---|---|---|---|---:|---|
| Paycheck | Money In | Main Checking | Salary Income | 3,200 | Monthly on 25th |
| Rent | Money Out | Main Checking | Rent Expense | 1,500 | Monthly on 1st |
| Groceries | Money Out | Main Checking | Groceries Expense | 150 | Weekly on Saturday |
| Utilities | Money Out | Main Checking | Utilities Expense | 220 | Monthly on 10th |

### 6.4 Period Changes Used in the Story

- April 4 groceries planned amount: change to 175 with
  **This occurrence only**.
- Rent actual: 1,480 on April 2.
- Unexpected transport pass actual: 90 on April 12.
- Promote the transport pass with **Repeat going forward** as monthly.
- Utilities increase to 245 beginning with the May occurrence using
  **This and future**.

Use local currency formatting as configured by the app. If the displayed
currency differs, retain the same numeric values.

## 7.0 Master Storyboard

### Scene 1 — Title and Promise

**Duration**: 20–30 seconds

**Screen**: Forecast landing state.

**Narration**:

> Build the repeating plan once, adjust the period you are in, record what
> happened, and let projections use that same timeline.

**Callout**: `One plan. Period adjustments. Actuals. Projections.`

### Scene 2 — Select General and Create the Scenario

**Duration**: 35–50 seconds

**Actions**:

1. Select **General**.
2. Create `Household Plan Tutorial`.
3. Set the projection window to April through June 2026.
4. Select the scenario.

**Narration point**:

> A workflow changes the cards we see. The scenario still owns the data.

### Scene 3 — Add Accounts

**Duration**: 45–60 seconds

**Actions**:

1. Add or verify the seven demonstration accounts.
2. Enter the opening balances.
3. Point out Main Checking as the primary account used in the examples.

**Callout**: `Money In enters the primary account; Money Out leaves it.`

### Scene 4 — Build the Plan in Recurring

**Duration**: 90–120 seconds

**Actions**:

1. Open **Plan & Actuals → Recurring**.
2. Add Paycheck.
3. Add Rent.
4. Add Groceries.
5. Add Utilities.

Pause after saving each rule so its repeat description is readable.

**Narration point**:

> Recurring is the rulebook. These rules will produce dated items without a
> second generation step.

### Scene 5 — Review the Automatically Resolved Period

**Duration**: 45–60 seconds

**Actions**:

1. Switch to **Period**.
2. Select Month and April 2026.
3. Scroll through Paycheck, Rent, Groceries, and Utilities occurrences.
4. Point to movement on the first line and description below it.

**Narration point**:

> Period is the working timeline. It combines rule-derived items with any
> exceptions and actuals we add.

### Scene 6 — Make a One-Occurrence Adjustment

**Duration**: 40–55 seconds

**Actions**:

1. Edit the April 4 Groceries item.
2. Set the amount to 175.
3. Select **This occurrence only**.
4. Save and show that the other grocery occurrences remain 150.

**Callout**: `One unusual week does not rewrite the recurring rule.`

### Scene 7 — Freeze the Baseline

**Duration**: 30–40 seconds

**Actions**:

1. Click **Freeze baseline**.
2. Point to the baseline values.

**Narration point**:

> Freezing creates the comparison point for this period. Later plan changes
> can move Current plan without rewriting the original baseline.

### Scene 8 — Record a Linked Actual

**Duration**: 45–60 seconds

**Actions**:

1. Open Rent.
2. Set status to Actual.
3. Enter 1,480 and April 2.
4. Save.
5. Point to Baseline, Current plan, Actual, and Variance.

**Narration point**:

> The actual replaces the planned rent in the resolved timeline; it is not
> counted twice.

### Scene 9 — Record an Unexpected Actual

**Duration**: 45–60 seconds

**Actions**:

1. Click **Add item**.
2. Choose Actual.
3. Enter `Transport pass`, Money Out, Main Checking to Transport Expense,
   amount 90, date April 12.
4. Save.
5. Point to its zero Baseline and Current plan, and the Unplanned Actuals
   total.

**Narration point**:

> Unexpected costs belong in the period where they happened. They do not
> require rebuilding the plan first.

### Scene 10 — Turn Learning into a Future Rule

**Duration**: 45–60 seconds

**Actions**:

1. Use **Repeat going forward** on Transport pass.
2. Choose a monthly pattern beginning with the next occurrence.
3. Save.
4. Switch to Recurring briefly to show the new rule.
5. Return to Period and move to May to show the new occurrence.

**Callout**: `Unexpected once → recurring from now on`

### Scene 11 — Adjust an Existing Rule Going Forward

**Duration**: 50–70 seconds

**Actions**:

1. In May, edit Utilities.
2. Change the amount from 220 to 245.
3. Select **This and future**.
4. Save.
5. Show April remaining unchanged and May/June using the new amount.

**Narration point**:

> FTrack keeps earlier history and starts a new rule segment where the change
> begins.

### Scene 12 — Show Skip and Duplicate Without Changing the Story

**Duration**: 30–45 seconds

**Actions**:

1. Hover or briefly identify **Skip occurrence**.
2. Identify **Duplicate item**.
3. Do not save either action in the master dataset unless a separate retake is
   available.

**Narration point**:

> Skip excludes a planned event that will not happen. Duplicate makes a new
> one-time planned copy.

### Scene 13 — Read the Totals

**Duration**: 50–70 seconds

**Actions**:

1. Return to April.
2. Point to Baseline net, Current plan net, Actual net, Open commitments,
   Forecast net, variance metrics, and Unplanned Actuals.
3. Explain why Actual net plus Open commitments is more useful mid-period than
   Actual net alone.

### Scene 14 — Confirm Projection Freshness

**Duration**: 45–60 seconds

**Actions**:

1. Open Projections after a plan-affecting edit.
2. Capture **Stale · refreshing** if timing permits.
3. Wait for **Current**.
4. Hover the immediate refresh action to show
   **Refresh projections now**.
5. Review Main Checking through June.

**Narration point**:

> Projections use the same resolved occurrences. There is no source switch and
> no second set of budget rows to maintain.

### Scene 15 — Close

**Duration**: 20–30 seconds

**Screen**: Plan & Actuals totals with Projections showing Current.

**Narration**:

> Review the next period, freeze the baseline, track reality, and apply what
> you learn to the future. The plan improves without being recreated.

**Callout**: `Review → Freeze → Track → Learn → Project`

## 8.0 Chapter Cut Points

1. `00:00` One plan and tutorial outcome.
2. `00:25` Scenario and accounts.
3. `01:30` Recurring rules.
4. `03:15` Period occurrences and one-off adjustment.
5. `04:30` Freeze baseline and linked actual.
6. `06:00` Unexpected actual.
7. `07:00` Repeat going forward and future-scoped change.
8. `08:45` Totals and projections.
9. `10:00` Review rhythm.

Adjust timestamps to the final recording; keep semantic cut points.

## 9.0 Callout Copy

Use only where it reinforces a transition:

- `Recurring = reusable rules`
- `Period = dated plan and actuals`
- `No separate budget generation`
- `Freeze the comparison point`
- `This occurrence only`
- `This and future`
- `Unexpected actual`
- `Repeat going forward`
- `Actual replaces its plan`
- `Projection: Stale → Current`

## 10.0 Recording Checklist

### 10.1 Before Recording

- Start from a clean fictional dataset.
- Verify General is visible and selected.
- Verify the demonstration scenario window.
- Verify all account names and balances.
- Verify the first Period is April 2026.
- Run through every scene once without recording.
- Confirm automatic projection refresh completes.
- Close personal tabs and disable unrelated notifications.

### 10.2 During Recording

- Keep account direction visible long enough to read.
- Show the description under the movement.
- Show the chosen edit scope before saving.
- Pause on frozen baseline and actual variance.
- Capture the unplanned actual total.
- Capture the new recurring rule after promotion.
- Wait for Projections to show Current.
- Retake any scene with a validation error or unexpected diagnostic.

### 10.3 After Recording

- Remove long save/loading pauses.
- Add chapter markers and captions.
- Check that callouts do not cover controls or totals.
- Verify no personal data is visible.
- Verify the narration never describes separate transaction, budget, and
  actual-generation workflows.
- Export the full tutorial and chapter clips.

## 11.0 Acceptance Criteria

The tutorial is ready when:

1. Every demonstrated label matches the current UI.
2. Recurring rules visibly produce Period occurrences without a generation
   action.
3. Money In and Money Out direction is explained correctly.
4. The Period description is visible below the movement.
5. A baseline is frozen before comparison.
6. A linked actual replaces its plan.
7. An unexpected actual appears as unplanned.
8. That manual item is promoted with Repeat going forward.
9. A future-scoped edit leaves prior history unchanged.
10. Projections visibly return to Current.
11. No deleted legacy budget controls or workflow names appear.

## 12.0 Follow-Up Short Tutorials

After the master tutorial:

1. This occurrence only vs This and future vs Entire series.
2. Freeze baseline and interpret variance.
3. Unexpected actual to Repeat going forward.
4. Skip, restore, duplicate, and manual planned items.
5. Why projections become stale and how they refresh.
6. Edit a split recurring rule with explicit future or entire-series scope.
