const { test, expect } = require('@playwright/test');
const { gotoFTrack, waitForScenario } = require('../helpers/app-data');
const { selectWorkflow, openSectionFilters, closeFilterModal } = require('../helpers/ui');

function editorField(form, label) {
  const exactLabel = new RegExp(
    `^${String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
  );
  return form.locator('label.grid-summary-label')
    .filter({ hasText: exactLabel })
    .locator('..');
}

async function expectUnifiedPlanSurface(page, defaultView = 'recurring') {
  const planSection = page.locator('#budgetSection');
  const tabName = defaultView === 'period' ? 'Period' : 'Recurring';
  await expect(planSection).toBeVisible();
  await expect(page.locator('#transactionsSection')).toBeHidden();
  await expect(planSection.getByRole('tab', { name: tabName, exact: true }))
    .toHaveAttribute('aria-selected', 'true');
}

test.describe('documented workflow smoke coverage', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFTrack(page);
  });

  test('General exposes unified Plan & Actuals period and projection controls', async ({ page }) => {
    await selectWorkflow(page, 'General');
    await page.getByRole('tab', { name: 'Period', exact: true }).click();
    await expect(page.locator('#budgetSection')).toBeVisible();
    await expect(page.locator('#transactionsSection')).toBeHidden();
    await expect(page.locator('#summaryCardsSection')).toBeVisible();
    await expect(page.locator('#budgetSection .forecast-card')).toHaveCount(1);
    await expect(page.locator('#budgetTable .plan-actuals-item').first()).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Period' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Recurring' })).toBeVisible();

    await openSectionFilters(page, '#budgetSection');
    await expect(page.locator('.filter-modal')).toContainText('Filter Plan & Actuals');
    await expect(page.locator('.filter-modal button[title="Add item"]')).toBeVisible();
    await closeFilterModal(page);

    await openSectionFilters(page, '#projectionsSection');
    await expect(page.locator('.filter-modal')).toContainText('Filter Projections');
    await expect(page.locator('.filter-modal button[title="Refresh projections now"]')).toBeVisible();
    await expect(page.locator('.filter-modal button[title="Generate projections"]')).toHaveCount(0);
    await expect(page.locator('.filter-modal button[title="Clear projections"]')).toHaveCount(0);
    await closeFilterModal(page);
  });

  test('General row accordion hides the Plan & Actuals section body', async ({ page }) => {
    await selectWorkflow(page, 'General');

    const planSection = page.locator('#budgetSection');
    const planBody = planSection.locator(':scope > .dash-row-body');
    await expect(planBody).toBeVisible();

    await planSection.locator(':scope > .dash-row-header').click();
    await expect(planSection).toHaveClass(/collapsed/);
    await expect(planBody).toBeHidden();
  });

  test('General exposes summary and projection controls', async ({ page }) => {
    await selectWorkflow(page, 'General');
    await expectUnifiedPlanSurface(page);
    await expect(page.locator('#summaryCardsContent')).toContainText('OVERALL TOTAL');

    await openSectionFilters(page, '#projectionsSection');
    await expect(page.locator('.filter-modal')).toContainText('Filter Projections');
    await closeFilterModal(page);
  });

  test('Funds exposes fund totals and equity detail', async ({ page }) => {
    await selectWorkflow(page, 'Funds');
    await expectUnifiedPlanSurface(page);
    await expect(page.locator('#summaryCardsContent')).toContainText('FUND TOTALS');
    await expect(page.locator('#summaryCardsContent')).toContainText('Equity Accounts');
  });

  test('Debt Repayment exposes debt summary and schedule-capable account cards', async ({ page }) => {
    await selectWorkflow(page, 'Debt Repayment');
    await expectUnifiedPlanSurface(page);
    await expect(page.locator('#summaryCardsContent')).toContainText('OVERALL TOTAL');
    await expect(page.locator('#summaryCardsContent')).toContainText('Credit Card');
    await expect(page.locator('#accountsSection')).toContainText('Credit Card');
  });

  test('General, Funds, and Debt summaries refresh without configured projection dates', async ({ page }) => {
    const changeStoredBalanceAndNotify = (accountId, nextBalance) => page.evaluate((change) => {
      const data = JSON.parse(window.localStorage.getItem('ftrack:app-data') || '{}');
      const scenarioId = Number(
        data?.uiState?.lastScenarioId || data?.scenarios?.[0]?.id || 0
      );
      const scenario = data?.scenarios?.find(
        (candidate) => Number(candidate?.id) === scenarioId
      );
      const account = scenario?.accounts?.find(
        (candidate) => Number(candidate?.id) === Number(change.accountId)
      );
      if (!scenario || !account) throw new Error('Summary refresh fixture is incomplete');

      account.startingBalance = change.nextBalance;
      scenario.projection = {
        ...(scenario.projection || {}),
        config: {}
      };
      window.localStorage.setItem('ftrack:app-data', JSON.stringify(data));

      if (!window.__ftrackNativeSetTimeout) {
        window.__ftrackNativeSetTimeout = window.setTimeout.bind(window);
        window.__ftrackBlockedProjectionRefreshes = 0;
        window.setTimeout = (callback, delay, ...args) => {
          if (Number(delay) === 500) {
            window.__ftrackBlockedProjectionRefreshes += 1;
            return 2147483646;
          }
          return window.__ftrackNativeSetTimeout(callback, delay, ...args);
        };
      }

      document.dispatchEvent(new CustomEvent('forecast:planChanged', {
        detail: {
          scenarioId,
          reason: 'summary refresh without configured projection dates'
        }
      }));
    }, { accountId, nextBalance });

    const expectMetricDigits = async (label, expectedDigits) => {
      const row = page.locator(
        '#summaryCardsContent > .overall-total .summary-card-row',
        { hasText: label }
      );
      await expect.poll(async () => {
        const text = await row.locator('.value').textContent();
        return (String(text || '').match(/\d/g) || []).join('');
      }, { message: `${label} refreshed to ${expectedDigits}` }).toBe(expectedDigits);
    };

    await selectWorkflow(page, 'General');
    await changeStoredBalanceAndNotify(1, 1300);
    await expectMetricDigits('Starting Balance:', '110000');

    await selectWorkflow(page, 'Funds');
    await changeStoredBalanceAndNotify(1, 1400);
    await expectMetricDigits('NAV:', '120000');

    await selectWorkflow(page, 'Debt Repayment');
    const overallTotal = page.locator('#summaryCardsContent > .overall-total');
    await expect(overallTotal).toHaveCount(1);

    await changeStoredBalanceAndNotify(3, -850);
    await expectMetricDigits('Starting Balance:', '105000');
    await expect(overallTotal).toHaveCount(1);

    await changeStoredBalanceAndNotify(3, -900);
    await expectMetricDigits('Starting Balance:', '100000');
    await expect(overallTotal).toHaveCount(1);
    await expect.poll(() => page.evaluate(
      () => window.__ftrackBlockedProjectionRefreshes
    )).toBeGreaterThan(0);
  });

  test('Goal Workshop exposes advanced goal controls', async ({ page }) => {
    await selectWorkflow(page, 'Goal Workshop');
    await expectUnifiedPlanSurface(page);
    await expect(page.locator('#generatePlanSection')).toContainText('Goal Workshop');
    await expect(page.locator('#generatePlanSection')).toContainText('Constraints');
    await expect(page.locator('#generatePlanSection')).toContainText('Goals');
    await expect(page.locator('#generatePlanSection button[title="Solve — calculate suggested plan rules"]')).toBeVisible();
  });

  test('shares a manual actual through the unified Period surface across workflows', async ({ page }) => {
    const description = 'Cross-workflow actual';

    await selectWorkflow(page, 'General');
    await page.locator('#budgetSection').getByRole('tab', { name: 'Period', exact: true }).click();
    await openSectionFilters(page, '#budgetSection');
    await page.locator('.filter-modal button[title="Add item"]').click();
    await closeFilterModal(page);

    const form = page.locator('#budgetSection .plan-actuals-new-item form');
    await expect(form).toBeVisible();
    await editorField(form, 'Secondary account').locator('select').selectOption('5');
    await editorField(form, 'Movement').locator('select').selectOption('2');
    await editorField(form, 'Date').locator('input').fill('2026-01-22');
    await editorField(form, 'Current plan').locator('input').fill('0');
    await editorField(form, 'Status').locator('select').selectOption('actual');
    await editorField(form, 'Actual amount').locator('input').fill('275');
    await editorField(form, 'Description').locator('input').fill(description);
    await form.getByRole('button', { name: 'Add item' }).click();

    await waitForScenario(page, (scenario) => scenario.transactionOccurrences.some(
      (occurrence) => occurrence.description === description &&
        occurrence.status === 'actual' &&
        Number(occurrence.actualAmount) === 275
    ), 'manual actual persisted');

    for (const workflow of ['General', 'Funds', 'Debt Repayment', 'Goal Workshop']) {
      await selectWorkflow(page, workflow);
      await page.locator('#budgetSection').getByRole('tab', { name: 'Period', exact: true }).click();
      await expectUnifiedPlanSurface(page, 'period');
      await expect(page.locator('#budgetSection .plan-actuals-item', { hasText: description }))
        .toBeVisible();
      await expect(page.locator('#budgetSection .plan-actuals-item', { hasText: description }))
        .toContainText('actual');
    }
  });
});
