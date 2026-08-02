const { test, expect } = require('@playwright/test');
const { currentScenario, gotoFTrack, waitForScenario } = require('../helpers/app-data');
const { selectWorkflow } = require('../helpers/ui');

test.describe('configuration modals', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFTrack(page);
  });

  test('updates a plan rule through the safe recurring-rule detail editor', async ({ page }) => {
    await selectWorkflow(page, 'Plan Rules (Detail)');
    const salaryRow = page.locator(
      '#budgetTable .recurring-rules-detail-grid .tabulator-row',
      { hasText: 'Monthly salary' }
    );
    await salaryRow.locator('button[title="Edit recurring rule safely"]').click();
    const safeEditor = salaryRow.locator('.recurring-rule-card');
    const sourceRuleId = Number(await safeEditor.getAttribute('data-source-transaction-id'));
    expect(sourceRuleId).toBeGreaterThan(0);
    const transactionCount = (await currentScenario(page)).transactions.length;
    await safeEditor.click();
    await safeEditor.locator('[title="Click to edit recurrence"]:visible').click();
    await expect(page.locator('.modal-recurrence')).toBeVisible();

    await page.locator('#recurrenceType').selectOption('2');
    await page.locator('.modal-recurrence button[title="Save"]').click();
    await safeEditor.locator('.grid-summary-field', { hasText: 'Apply change to' })
      .locator('select')
      .selectOption('series');
    await safeEditor.locator('button[title="Save recurring rule"]').click();

    await waitForScenario(page, (scenario) => {
      const source = scenario.transactions.find(
        (transaction) => Number(transaction?.id) === sourceRuleId
      );
      const successors = scenario.transactions.filter(
        (transaction) =>
          Number(transaction?.seriesRootId) === sourceRuleId &&
          Number(transaction?.supersedesTransactionId) === sourceRuleId
      );
      const recurrenceType = successors[0]?.recurrence?.recurrenceType;
      return Boolean(
        source?.activeTo &&
        successors.length === 1 &&
        Number(recurrenceType?.id || recurrenceType) === 2
      );
    }, 'recurring plan rule segmented once with a daily successor');

    const updatedScenario = await currentScenario(page);
    const editedSeries = updatedScenario.transactions.filter(
      (transaction) =>
        Number(transaction?.id) === sourceRuleId ||
        Number(transaction?.seriesRootId) === sourceRuleId
    );
    const sourceSegment = editedSeries.find(
      (transaction) => Number(transaction?.id) === sourceRuleId
    );
    const successorSegments = editedSeries.filter(
      (transaction) => Number(transaction?.id) !== sourceRuleId
    );

    expect(updatedScenario.transactions).toHaveLength(transactionCount + 1);
    expect(editedSeries).toHaveLength(2);
    expect(sourceSegment?.seriesRootId).toBe(sourceRuleId);
    expect(successorSegments).toHaveLength(1);
    expect(successorSegments[0]?.seriesRootId).toBe(sourceRuleId);
    expect(successorSegments[0]?.supersedesTransactionId).toBe(sourceRuleId);
    expect(Number(
      successorSegments[0]?.recurrence?.recurrenceType?.id ||
      successorSegments[0]?.recurrence?.recurrenceType
    )).toBe(2);
    expect(sourceSegment?.activeTo).toBeTruthy();
    expect(successorSegments[0]?.activeFrom).toBeTruthy();
    const expectedSuccessorStart = new Date(`${sourceSegment.activeTo}T00:00:00Z`);
    expectedSuccessorStart.setUTCDate(expectedSuccessorStart.getUTCDate() + 1);
    expect(successorSegments[0].activeFrom)
      .toBe(expectedSuccessorStart.toISOString().slice(0, 10));

    const rulesDetailGrid = page.locator(
      '#budgetTable .recurring-rules-detail-grid'
    );
    await expect(rulesDetailGrid).toBeVisible();
    await expect(
      rulesDetailGrid.locator('.tabulator-row', { hasText: 'Monthly salary' })
    ).toHaveCount(2);
    await expect(rulesDetailGrid).toContainText('Every day');
    await expect(
      page.locator('#budgetTable .recurring-rule-card .grid-summary-form:visible')
    ).toHaveCount(0);
  });

  test('updates account periodic change through the periodic change modal', async ({ page }) => {
    await selectWorkflow(page, 'General');
    const card = page.locator('.account-card', { hasText: 'Checking' });
    await card.click();
    await card.locator('[title="Click to edit periodic change"]').click();
    await expect(page.locator('.modal-periodic')).toBeVisible();

    await page.locator('#value').fill('4.5');
    await page.locator('.modal-periodic button[title="Save"]').click();

    await waitForScenario(page, (scenario) => {
      const account = scenario.accounts.find((item) => Number(item.id) === 1);
      return Number(account?.periodicChange?.value) === 4.5;
    }, 'periodic change saved');
  });
});
