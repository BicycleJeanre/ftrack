const { test, expect } = require('@playwright/test');
const { gotoFTrack, loadSmokeData, currentScenario } = require('../helpers/app-data');
const { expectNoHorizontalOverflow, selectWorkflow } = require('../helpers/ui');

function buildLargeScenarioData() {
  const data = loadSmokeData();
  const scenario = data.scenarios[0];

  scenario.accounts = [];
  scenario.transactions = [];
  scenario.budgets = [];

  for (let index = 1; index <= 40; index += 1) {
    scenario.accounts.push({
      id: index,
      name: `Load Account ${index}`,
      type: { id: index % 5 === 0 ? 5 : 1, name: index % 5 === 0 ? 'Expense' : 'Asset' },
      currency: { id: 1, name: 'ZAR' },
      startingBalance: index * 100,
      openDate: '2026-01-01',
      periodicChange: null,
      goalAmount: index % 4 === 0 ? index * 250 : null,
      goalDate: index % 4 === 0 ? '2026-12-31' : null,
      tags: [`group-${index % 6}`]
    });
  }

  for (let index = 1; index <= 220; index += 1) {
    const primaryAccountId = (index % 20) + 1;
    const secondaryAccountId = ((index + 8) % 20) + 21;
    const day = String((index % 28) + 1).padStart(2, '0');
    const month = String((index % 12) + 1).padStart(2, '0');

    scenario.transactions.push({
      id: 5000 + index,
      primaryAccountId,
      secondaryAccountId,
      transactionTypeId: index % 3 === 0 ? 1 : 2,
      amount: 50 + index,
      effectiveDate: `2026-${month}-${day}`,
      description: `Load transaction ${index}`,
      recurrence: {
        recurrenceType: 3,
        startDate: `2026-${month}-${day}`,
        endDate: null,
        interval: 1,
        dayOfMonth: Number(day)
      },
      periodicChange: null,
      status: { name: 'planned', actualAmount: null, actualDate: null },
      tags: [`load-${index % 10}`]
    });
  }

  for (let index = 1; index <= 180; index += 1) {
    const sourceTransaction = scenario.transactions[index % scenario.transactions.length];
    scenario.budgets.push({
      id: 8000 + index,
      sourceTransactionId: sourceTransaction.id,
      primaryAccountId: sourceTransaction.primaryAccountId,
      secondaryAccountId: sourceTransaction.secondaryAccountId,
      transactionTypeId: sourceTransaction.transactionTypeId,
      amount: sourceTransaction.amount,
      plannedAmount: sourceTransaction.amount,
      description: `Load budget ${index}`,
      occurrenceDate: sourceTransaction.effectiveDate,
      recurrenceDescription: 'Monthly',
      status: { name: 'planned', actualAmount: null, actualDate: null }
    });
  }

  return data;
}

test.describe('frontend performance smoke', () => {
  test('loads and navigates dense local data within smoke thresholds', async ({ page }) => {
    test.setTimeout(45_000);
    await page.setViewportSize({ width: 1024, height: 768 });

    const startedAt = Date.now();
    await gotoFTrack(page, buildLargeScenarioData());
    const loadMs = Date.now() - startedAt;

    expect(loadMs).toBeLessThan(12_000);
    await expect(page.locator('.account-card')).toHaveCount(40);
    await expectNoHorizontalOverflow(page);

    const budgetStartedAt = Date.now();
    await selectWorkflow(page, 'Budget');
    expect((await currentScenario(page)).budgets).toHaveLength(180);
    await expect(page.locator('#budgetSection .grid-summary-card').first()).toBeVisible();
    expect(Date.now() - budgetStartedAt).toBeLessThan(8_000);
    await expectNoHorizontalOverflow(page);
  });
});
