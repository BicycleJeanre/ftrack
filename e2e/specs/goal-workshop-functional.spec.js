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

  test('solves and applies an advanced goal plan as plan rules', async ({ page }) => {
    const before = (await currentScenario(page)).transactions.length;

    await page.locator('#generatePlanSection button[title="Solve — calculate suggested plan rules"]').click();
    await expect(page.locator('#adv-goal-solution-totals')).toContainText('Suggested Plan Rules');
    await expect(page.locator('#adv-goal-solution-totals')).toContainText('1');
    await expect(page.locator('#adv-goal-solution')).toContainText('Advanced Goal: Reach Savings Goal');

    const applyButton = page.locator('#generatePlanSection button[title="Apply — add plan rules to this scenario"]');
    await expect(applyButton).toBeEnabled();
    await applyButton.click();

    await waitForCollectionCount(page, 'transactions', before + 1);
    await waitForScenario(page, (scenario) =>
      scenario.transactions.some((transaction) =>
        transaction.description === 'Advanced Goal: Reach Savings Goal' &&
        Array.isArray(transaction.tags) &&
        transaction.tags.includes('adv-goal-generated')
      ), 'advanced goal plan rule applied');
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

  test('refreshes Generate Plan after a plan rule changes', async ({ page }) => {
    await page.locator(
      '#generatePlanSection button[title="Solve — calculate suggested plan rules"]'
    ).click();
    await expect(page.locator('#adv-goal-solution-totals'))
      .toContainText('Suggested Plan Rules');

    await page.evaluate(async () => {
      const { create } = await import('/js/app/managers/transaction-manager.js');
      const data = JSON.parse(window.localStorage.getItem('ftrack:app-data') || '{}');
      const scenarioId = Number(
        data?.uiState?.lastScenarioId || data?.scenarios?.[0]?.id || 0
      );
      await create(scenarioId, {
        primaryAccountId: 1,
        secondaryAccountId: 2,
        transactionTypeId: 2,
        amount: 25,
        effectiveDate: '2026-02-01',
        description: 'Goal refresh regression rule',
        recurrence: {
          recurrenceType: 4,
          startDate: '2026-02-01',
          endDate: null,
          interval: 1,
          dayOfMonth: 1
        }
      });
    });

    await expect(page.locator('#adv-goal-solution'))
      .toHaveText('Configure goals and click Solve.');
    await waitForScenario(page, (scenario) => scenario.transactions.some(
      (transaction) => transaction.description === 'Goal refresh regression rule'
    ), 'plan rule persisted before Generate Plan refreshed');
  });

  test('refreshes simple Generate Plan after an account goal input changes', async ({ page }) => {
    await page.locator('#generatePlanSection button[title="Settings"]').click();
    await page.locator('.modal-dialog .mode-btn[data-mode="simple"]').click();

    const goalOption = page.locator('#goal-account-select option[value="2"]');
    await expect(goalOption).toBeAttached();
    await expect.poll(async () => {
      const text = await goalOption.textContent();
      return (String(text || '').split(' by ')[0].match(/\d/g) || []).join('');
    }).toContain('250000');

    await page.evaluate(async () => {
      const { update } = await import('/js/app/managers/account-manager.js');
      const data = JSON.parse(window.localStorage.getItem('ftrack:app-data') || '{}');
      const scenarioId = Number(
        data?.uiState?.lastScenarioId || data?.scenarios?.[0]?.id || 0
      );
      await update(scenarioId, 2, { goalAmount: 3100 });
    });

    await expect.poll(async () => {
      const text = await goalOption.textContent();
      return (String(text || '').split(' by ')[0].match(/\d/g) || []).join('');
    }, { message: 'Generate Plan shows the persisted account goal amount' })
      .toContain('310000');
  });
});
