const { test, expect } = require('@playwright/test');
const {
  gotoFTrack,
  readAppData,
  waitForScenarioCount
} = require('../helpers/app-data');
const { openSidebar, selectWorkflow } = require('../helpers/ui');

test.describe('Plan & Actuals detail editor lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFTrack(page);
  });

  test('closes a stale detail editor after scenario and period context changes', async ({ page }) => {
    await openSidebar(page);
    const before = await readAppData(page);
    const sourceScenarioId = Number(
      before?.uiState?.lastScenarioId || before?.scenarios?.[0]?.id || 0
    );

    await page.locator(
      `.scenario-list-item[data-scenario-id="${sourceScenarioId}"] button[title="Duplicate Scenario"]`
    ).click();
    await waitForScenarioCount(page, before.scenarios.length + 1);

    const afterDuplicate = await readAppData(page);
    const targetScenario = afterDuplicate.scenarios.find(
      (scenario) => Number(scenario.id) !== sourceScenarioId
    );
    expect(targetScenario).toBeTruthy();

    await selectWorkflow(page, 'Plan & Actuals (Detail)');
    const table = page.locator('#budgetTable .plan-actuals-detail-grid.tabulator');
    await expect(table).toBeVisible();

    await table.locator('.tabulator-row').first()
      .locator('button[title="Edit item"]')
      .click();
    const editor = page.locator(
      '#budgetTable .plan-actuals-detail-editor-host form'
    );
    await expect(editor).toBeVisible();

    await page.locator(
      `.scenario-list-item[data-scenario-id="${targetScenario.id}"]`
    ).click();
    await expect.poll(async () => {
      const data = await readAppData(page);
      return Number(data?.uiState?.lastScenarioId || 0);
    }).toBe(Number(targetScenario.id));
    await expect(editor).toHaveCount(0);
    await expect(table).toBeVisible();

    await table.locator('.tabulator-row').first()
      .locator('button[title="Edit item"]')
      .click();
    await expect(editor).toBeVisible();

    const periodSelect = page.locator('#plan-period-inline');
    const periodValues = await periodSelect.locator('option').evaluateAll(
      (options) => options.map((option) => option.value)
    );
    expect(periodValues.length).toBeGreaterThan(1);
    await periodSelect.selectOption(periodValues[1]);

    await expect(editor).toHaveCount(0);
    await expect(table).toBeVisible();
  });
});
