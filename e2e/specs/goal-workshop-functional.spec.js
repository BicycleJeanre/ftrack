const { test, expect } = require('@playwright/test');
const {
  gotoFTrack,
  currentScenario,
  waitForCollectionCount,
  waitForScenario
} = require('../helpers/app-data');
const { selectWorkflow } = require('../helpers/ui');

test.describe('Goal Workshop browser functionality', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFTrack(page);
    await selectWorkflow(page, 'Goal Workshop');
  });

  test('solves and applies an advanced goal plan into transactions', async ({ page }) => {
    const before = (await currentScenario(page)).transactions.length;

    await page.locator('#generatePlanSection button[title="Solve — calculate suggested transactions"]').click();
    await expect(page.locator('#adv-goal-solution-totals')).toContainText('Suggested Transactions');
    await expect(page.locator('#adv-goal-solution-totals')).toContainText('1');
    await expect(page.locator('#adv-goal-solution')).toContainText('Advanced Goal: Reach Savings Goal');

    const applyButton = page.locator('#generatePlanSection button[title="Apply — write transactions into this scenario"]');
    await expect(applyButton).toBeEnabled();
    await applyButton.click();

    await waitForCollectionCount(page, 'transactions', before + 1);
    await waitForScenario(page, (scenario) =>
      scenario.transactions.some((transaction) =>
        transaction.description === 'Advanced Goal: Reach Savings Goal' &&
        Array.isArray(transaction.tags) &&
        transaction.tags.includes('adv-goal-generated')
      ), 'advanced goal transaction applied');
  });

  test('adds and removes advanced goals and constraints', async ({ page }) => {
    const before = await currentScenario(page);
    const beforeGoals = before.advancedGoalSettings.goals.length;
    const beforeLocked = before.advancedGoalSettings.constraints.lockedAccountIds.length;

    await page.locator('#adv-goals-panel button[title="Add Goal"]').click();
    await waitForScenario(page, (scenario) => scenario.advancedGoalSettings.goals.length === beforeGoals + 1, 'goal added');

    await page.locator('#adv-goals-panel .grid-summary-card').last().locator('.grid-summary-card-summary').click();
    await page.locator('#adv-goals-panel .grid-summary-card').last().locator('button[title="Remove"]').click();
    await waitForScenario(page, (scenario) => scenario.advancedGoalSettings.goals.length === beforeGoals, 'goal removed');

    await page.locator('#adv-constraints-panel button[title="Add Constraint (start with Funding Account)"]').click();
    await expect(page.locator('#adv-constraints-panel .grid-summary-card')).toHaveCount(beforeLocked + 2);
    const newConstraint = page.locator('#adv-constraints-panel .grid-summary-card').last();
    await newConstraint.locator('.grid-summary-card-summary').click();
    await newConstraint.locator('select').nth(1).selectOption('3');
    await waitForScenario(page, (scenario) =>
      scenario.advancedGoalSettings.constraints.lockedAccountIds.length === beforeLocked + 1,
      'constraint added');

    await newConstraint.locator('button[title="Remove"]').click();
    await waitForScenario(page, (scenario) =>
      scenario.advancedGoalSettings.constraints.lockedAccountIds.length === beforeLocked,
      'constraint removed');
  });
});
