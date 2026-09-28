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
    await expect(page.locator('#workflowNav').getByRole('button', { name: 'Budget', exact: true })).toHaveCount(0);
    await expect(page.locator('#workflowNav')).toContainText('General');
    await expect(page.locator('#workflowNav')).toContainText('Funds');
    await expect(page.locator('#workflowNav')).toContainText('Debt Repayment');
    await expect(page.locator('#workflowNav')).toContainText('Goal Workshop');
    await expect(page.locator('#workflowNav')).not.toContainText('Plan Rules (Detail)');
    await expect(page.locator('#workflowNav').getByRole('button', {
      name: 'Plan & Actuals (Detail)',
      exact: true
    })).toHaveCount(1);
  });

  test('switches workflow cards according to the frontend registry', async ({ page }) => {
    await selectWorkflow(page, 'General');
    await expect(page.locator('#summaryCardsSection')).toBeVisible();
    await expect(page.locator('#budgetSection')).toBeVisible();
    await expect(page.locator('#transactionsSection')).toBeHidden();
    await expect(page.locator('#budgetSection').getByRole('tab', { name: 'Recurring', exact: true }))
      .toHaveAttribute('aria-selected', 'true');

    await selectWorkflow(page, 'Funds');
    await expect(page.locator('#summaryCardsSection')).toBeVisible();
    await expect(page.locator('#budgetSection')).toBeVisible();
    await expect(page.locator('#transactionsSection')).toBeHidden();
    await expect(page.locator('#projectionsSection')).toBeHidden();
    await expect(page.locator('#budgetSection').getByRole('tab', { name: 'Recurring', exact: true }))
      .toHaveAttribute('aria-selected', 'true');

    await selectWorkflow(page, 'Debt Repayment');
    await expect(page.locator('#summaryCardsSection')).toBeVisible();
    await expect(page.locator('#budgetSection')).toBeVisible();
    await expect(page.locator('#transactionsSection')).toBeHidden();
    await expect(page.locator('#budgetSection').getByRole('tab', { name: 'Recurring', exact: true }))
      .toHaveAttribute('aria-selected', 'true');

    await selectWorkflow(page, 'Goal Workshop');
    await expect(page.locator('#generatePlanSection')).toBeVisible();
    await expect(page.locator('#budgetSection')).toBeVisible();
    await expect(page.locator('#transactionsSection')).toBeHidden();
    await expect(page.locator('#budgetSection').getByRole('tab', { name: 'Recurring', exact: true }))
      .toHaveAttribute('aria-selected', 'true');
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

  test('edits the shared scenario timeframe from the scenario card', async ({ page }) => {
    await openSidebar(page);
    const scenario = (await readAppData(page)).scenarios[0];
    const card = page.locator(`.scenario-list-item[data-scenario-id="${scenario.id}"]`);

    await card.locator('button[title="Set scenario timeframe"]').click();
    await page.locator('#timeframe-start-date').fill('2026-02-01');
    await page.locator('#timeframe-end-date').fill('2026-10-31');
    await page.locator('#timeframe-period-type').selectOption('4');
    await page.locator('button[title="Save scenario timeframe"]').click();

    await expect.poll(async () => {
      const data = await readAppData(page);
      const saved = data.scenarios.find((entry) => Number(entry.id) === Number(scenario.id));
      return {
        timeframe: saved?.timeframe,
        projectionWindow: saved?.projection?.config && {
          startDate: saved.projection.config.startDate,
          endDate: saved.projection.config.endDate,
          periodTypeId: saved.projection.config.periodTypeId
        }
      };
    }).toEqual({
      timeframe: {
        startDate: '2026-02-01',
        endDate: '2026-10-31',
        periodTypeId: 4
      },
      projectionWindow: {
        startDate: '2026-02-01',
        endDate: '2026-10-31',
        periodTypeId: 4
      }
    });
    await expect(card.locator('.scenario-timeframe-summary'))
      .toContainText('2026-02-01 → 2026-10-31 · Quarterly');
  });

  test('clears every financial surface after deleting the sole scenario', async ({ page }) => {
    await expect(page.locator('#accountsTable')).toContainText('Checking');
    await expect(page.locator('#budgetTable')).toContainText('Monthly salary');

    const initialData = await readAppData(page);
    const deletedScenarioId = initialData.scenarios[0].id;

    await openSidebar(page);
    await page.locator(
      `.scenario-list-item[data-scenario-id="${deletedScenarioId}"] button[title="Delete Scenario"]`
    ).click();
    await confirmDialog(page);

    await expect.poll(async () => {
      const data = await readAppData(page);
      return {
        scenarioCount: data.scenarios.length,
        lastScenarioId: data.uiState.lastScenarioId,
        lastScenarioVersion: data.uiState.lastScenarioVersion
      };
    }).toEqual({
      scenarioCount: 0,
      lastScenarioId: null,
      lastScenarioVersion: null
    });

    await expect(page.locator('#scenariosList .scenarios-list-placeholder'))
      .toContainText('No scenarios yet');

    for (const selector of [
      '#accountsTable',
      '#transactionsTable',
      '#budgetTable',
      '#projectionsContent',
      '#summaryCardsContent',
      '#generatePlanContent'
    ]) {
      await expect(page.locator(`${selector} > [data-empty-reason="no-scenario"]`))
        .toHaveText('No scenario selected. Create a scenario to begin.');
    }

    await expect(page.locator([
      '#accountsTable',
      '#transactionsTable',
      '#budgetTable',
      '#projectionsContent',
      '#summaryCardsContent',
      '#generatePlanContent'
    ].join(', ')).locator(
      'button, input, select, textarea, .tabulator, .grid-summary-card, .account-card'
    )).toHaveCount(0);

    await expect(page.locator([
      '#accountsSection .card-header-controls > *',
      '#transactionsSection .card-header-controls > *',
      '#budgetSection .card-header-controls > *',
      '#projectionsSection .card-header-controls > *'
    ].join(', '))).toHaveCount(0);

    await page.evaluate((scenarioId) => {
      document.dispatchEvent(new CustomEvent('forecast:planChanged', {
        detail: { scenarioId, reason: 'stale deleted scenario test' }
      }));
    }, deletedScenarioId);
    await expect(page.locator('[data-empty-reason="no-scenario"]')).toHaveCount(6);
  });
});
