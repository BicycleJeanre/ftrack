const { test, expect } = require('@playwright/test');
const { gotoFTrack, readAppData, waitForScenarioCount } = require('../helpers/app-data');
const { openSidebar, selectWorkflow, confirmDialog } = require('../helpers/ui');

test.describe('app shell and workflow navigation', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFTrack(page);
  });

  test('renders the dashboard shell and all workflow entries', async ({ page }) => {
    await openSidebar(page);

    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('#workflowNav')).toContainText('Budget');
    await expect(page.locator('#workflowNav')).toContainText('General');
    await expect(page.locator('#workflowNav')).toContainText('Funds');
    await expect(page.locator('#workflowNav')).toContainText('Debt Repayment');
    await expect(page.locator('#workflowNav')).toContainText('Goal Workshop');
    await expect(page.locator('#workflowNav')).toContainText('Transactions (Detail)');
    await expect(page.locator('#workflowNav')).toContainText('Plan & Actuals (Detail)');
  });

  test('switches workflow cards according to the frontend registry', async ({ page }) => {
    await selectWorkflow(page, 'Budget');
    await expect(page.locator('#budgetSection')).toBeVisible();
    await expect(page.locator('#transactionsSection')).toBeHidden();
    await expect(page.locator('#summaryCardsSection')).toBeHidden();

    await selectWorkflow(page, 'General');
    await expect(page.locator('#summaryCardsSection')).toBeVisible();
    await expect(page.locator('#budgetSection')).toBeHidden();

    await selectWorkflow(page, 'Funds');
    await expect(page.locator('#summaryCardsSection')).toBeVisible();
    await expect(page.locator('#projectionsSection')).toBeHidden();

    await selectWorkflow(page, 'Goal Workshop');
    await expect(page.locator('#generatePlanSection')).toBeVisible();
    await expect(page.locator('#budgetSection')).toBeHidden();
  });

  test('adds and removes a scenario through the UI and storage boundary', async ({ page }) => {
    await openSidebar(page);
    const before = (await readAppData(page)).scenarios.length;

    await page.locator('.sidebar-section-title').filter({ hasText: 'Scenarios' }).locator('button[title="Add New Scenario"]').click();
    await waitForScenarioCount(page, before + 1);
    await expect(page.locator('.scenario-list-item', { hasText: 'New Scenario' })).toBeVisible();

    const newScenario = page.locator('.scenario-list-item', { hasText: 'New Scenario' });
    await newScenario.locator('button[title="Delete Scenario"]').click();
    await confirmDialog(page);
    await waitForScenarioCount(page, before);
  });
});
