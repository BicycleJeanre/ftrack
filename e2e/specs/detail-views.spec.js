const { test, expect } = require('@playwright/test');
const {
  currentScenario,
  gotoFTrack,
  readAppData,
  waitForScenario,
  waitForScenarioCount
} = require('../helpers/app-data');
const {
  openSidebar,
  selectWorkflow,
  openSectionFilters,
  closeFilterModal
} = require('../helpers/ui');

test.describe('detail workflow reachability', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFTrack(page);
  });

  test('detail views isolate their target sections and expose filters', async ({ page }) => {
    await selectWorkflow(page, 'Accounts (Detail)');
    await expect(page.locator('#accountsSection')).toBeVisible();
    await expect(page.locator('#transactionsSection')).toBeHidden();
    await openSectionFilters(page, '#accountsSection');
    await expect(page.locator('.filter-modal')).toContainText('Filter Accounts');
    await closeFilterModal(page);

    await selectWorkflow(page, 'Plan Rules (Detail)');
    await expect(page.locator('#budgetSection')).toBeVisible();
    await expect(page.locator('#transactionsSection')).toBeHidden();
    await expect(page.locator('#accountsSection')).toBeHidden();
    await expect(page.locator('#budgetSection').getByRole('tab', { name: 'Recurring', exact: true }))
      .toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#budgetSection .plan-actuals-toolbar')).toBeVisible();
    await expect(page.locator('#budgetSection #tx-grouping-select-summary option')).toHaveText([
      'None',
      'Movement',
      'Primary Account',
      'Secondary Account',
      'Recurring Split',
      'Split Role',
      'Split Account Group'
    ]);
    await expect(page.locator('#budgetSection #tx-split-group-filter-summary option').first())
      .toHaveText('All Recurring Splits');

    await selectWorkflow(page, 'Plan & Actuals (Detail)');
    await expect(page.locator('#budgetSection')).toBeVisible();
    await expect(page.locator('#transactionsSection')).toBeHidden();
    await expect(page.locator('#budgetSection').getByRole('tab', { name: 'Period', exact: true }))
      .toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#budgetTable .plan-actuals-detail-grid.grid-detail.tabulator'))
      .toBeVisible();

    await selectWorkflow(page, 'Projections (Detail)');
    await expect(page.locator('#projectionsSection')).toBeVisible();
    await expect(page.locator('#budgetSection')).toBeHidden();
  });

  test('Plan Rules detail renders a real recurring-rules table with safe edit actions', async ({ page }) => {
    await selectWorkflow(page, 'Plan Rules (Detail)');

    const rulesTable = page.locator(
      '#budgetTable .recurring-rules-detail-grid.grid-detail.tabulator'
    );
    await expect(rulesTable).toBeVisible();
    await expect(page.locator('#budgetTable #transactionsContent .summary-card-title'))
      .toHaveText('PLAN RULE TOTALS');

    const headerTitles = rulesTable.locator('.tabulator-header .tabulator-col-title');
    for (const title of [
      'Movement',
      'From',
      'To',
      'Amount',
      'Recurrence',
      'Adjustment',
      'Active From',
      'Active To',
      'Next',
      'Description',
      'Tags',
      'Split',
      'Actions'
    ]) {
      await expect(headerTitles.filter({ hasText: new RegExp(`^${title}$`) })).toHaveCount(1);
    }
    await expect(headerTitles.filter({ hasText: /^Date$/ })).toHaveCount(0);
    await expect(headerTitles.filter({ hasText: /^Status$/ })).toHaveCount(0);

    const firstRow = rulesTable.locator(
      '.tabulator-tableholder .tabulator-row',
      { hasText: 'Monthly salary' }
    ).first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.locator('button[title="Edit recurring rule safely"]')).toBeVisible();
  });

  test('Plan Rules detail opens a newly added rule in its safe editor', async ({ page }) => {
    await selectWorkflow(page, 'Plan Rules (Detail)');
    const beforeCount = (await currentScenario(page)).transactions.length;

    await page.locator('#budgetSection button[title="Add recurring rule"]').click();

    const openCard = page.locator(
      '#budgetTable .recurring-rules-detail-grid .recurring-rule-card',
      { has: page.locator('.grid-summary-form:visible') }
    );
    await expect(openCard).toHaveCount(1);
    await expect(openCard.locator('.grid-summary-form')).toBeVisible();
    await expect(openCard.locator('.tx-split-inline')).toBeHidden();
    const sourceRuleId = Number(await openCard.getAttribute('data-source-transaction-id'));
    expect(sourceRuleId).toBeGreaterThan(0);
    await waitForScenario(page, (scenario) => (
      scenario.transactions.length === beforeCount + 1 &&
      scenario.transactions.some((rule) => Number(rule.id) === sourceRuleId)
    ), 'new recurring rule opened from the detail workflow');
  });

  test('Plan Rules detail opens a newly added split rule in its safe editor', async ({ page }) => {
    await selectWorkflow(page, 'Plan Rules (Detail)');

    await page.locator(
      '#budgetSection button[title="Create recurring split rule"]'
    ).click();

    const openCard = page.locator(
      '#budgetTable .recurring-rules-detail-grid .recurring-rule-card',
      { has: page.locator('.grid-summary-form:visible') }
    );
    await expect(openCard).toHaveCount(1);
    await expect(openCard.locator('.tx-split-inline')).toBeVisible();
    await expect(openCard).toHaveAttribute('data-split-role', 'principal');
    const splitGroupId = await openCard.getAttribute('data-split-group-id');
    expect(splitGroupId).toBeTruthy();
    await waitForScenario(page, (scenario) => scenario.transactions.some(
      (rule) =>
        rule.transactionGroupId === splitGroupId &&
        rule.transactionGroupRole === 'principal'
    ), 'new recurring split rule opened from the detail workflow');
  });

  test('Plan & Actuals detail renders comparison columns without summary cards', async ({ page }) => {
    await selectWorkflow(page, 'Plan & Actuals (Detail)');

    const planTable = page.locator(
      '#budgetTable .plan-actuals-detail-grid.grid-detail.tabulator'
    );
    const headerTitles = planTable.locator('.tabulator-header .tabulator-col-title');
    for (const title of [
      'Date',
      'Status',
      'Money Movement',
      'Description',
      'Repeat',
      'Baseline',
      'Current Plan',
      'Actual',
      'Forecast Contribution',
      'Variance vs Baseline',
      'Variance vs Current',
      'Actions'
    ]) {
      await expect(headerTitles.filter({ hasText: new RegExp(`^${title}$`) })).toHaveCount(1);
    }
    const firstRow = planTable.locator('.tabulator-row').first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.locator(
      '.plan-actuals-completion input[type="checkbox"]'
    )).toHaveCount(1);
    await expect(firstRow.locator('.plan-actuals-completion')).toContainText('Actual');
    await expect(page.locator('#budgetSection .plan-actuals-item')).toHaveCount(0);
  });

  test('tears down detail tables across subview, presentation, and surface changes', async ({ page }) => {
    await page.evaluate(() => {
      const prototype = window.Tabulator?.prototype;
      if (!prototype || typeof prototype.destroy !== 'function') {
        throw new Error('Tabulator destroy lifecycle is unavailable');
      }
      const originalDestroy = prototype.destroy;
      window.__ftrackDestroyedDetailGrids = [];
      prototype.destroy = function (...args) {
        const element = this.element;
        if (element?.classList?.contains('plan-actuals-detail-grid')) {
          window.__ftrackDestroyedDetailGrids.push('period');
        }
        if (element?.classList?.contains('recurring-rules-detail-grid')) {
          window.__ftrackDestroyedDetailGrids.push('recurring');
        }
        return originalDestroy.apply(this, args);
      };
    });

    const destroyedCount = (kind) => page.evaluate(
      (expectedKind) => window.__ftrackDestroyedDetailGrids
        .filter((entry) => entry === expectedKind).length,
      kind
    );

    await selectWorkflow(page, 'Plan & Actuals (Detail)');
    await expect(page.locator('#budgetTable .plan-actuals-detail-grid.tabulator')).toBeVisible();

    const periodBeforeSubviewChange = await destroyedCount('period');
    await page.locator('#budgetSection').getByRole('tab', {
      name: 'Recurring',
      exact: true
    }).click();
    await expect(page.locator('#budgetTable .recurring-rules-detail-grid.tabulator')).toBeVisible();
    await expect.poll(() => destroyedCount('period')).toBeGreaterThan(periodBeforeSubviewChange);

    const recurringBeforeSubviewChange = await destroyedCount('recurring');
    await page.locator('#budgetSection').getByRole('tab', {
      name: 'Period',
      exact: true
    }).click();
    await expect(page.locator('#budgetTable .plan-actuals-detail-grid.tabulator')).toBeVisible();
    await expect.poll(() => destroyedCount('recurring'))
      .toBeGreaterThan(recurringBeforeSubviewChange);

    await selectWorkflow(page, 'Plan Rules (Detail)');
    await expect(page.locator('#budgetTable .recurring-rules-detail-grid.tabulator')).toBeVisible();
    const recurringBeforePresentationChange = await destroyedCount('recurring');
    await selectWorkflow(page, 'General');
    await expect(page.locator('#budgetTable .recurring-rules-detail-grid')).toHaveCount(0);
    await expect.poll(() => destroyedCount('recurring'))
      .toBeGreaterThan(recurringBeforePresentationChange);

    await selectWorkflow(page, 'Plan & Actuals (Detail)');
    await expect(page.locator('#budgetTable .plan-actuals-detail-grid.tabulator')).toBeVisible();
    const periodBeforeHide = await destroyedCount('period');
    await selectWorkflow(page, 'Accounts (Detail)');
    await expect(page.locator('#budgetSection')).toBeHidden();
    await expect.poll(() => destroyedCount('period')).toBeGreaterThan(periodBeforeHide);
  });

  test('waits for an in-flight refresh before repeated workflow navigation renders', async ({ page }) => {
    await selectWorkflow(page, 'Plan & Actuals (Detail)');
    await expect(page.locator('#budgetTable .plan-actuals-detail-grid.tabulator')).toBeVisible();

    await page.evaluate(() => {
      const prototype = window.Tabulator?.prototype;
      if (!prototype || typeof prototype.replaceData !== 'function') {
        throw new Error('Tabulator replaceData lifecycle is unavailable');
      }

      const originalReplaceData = prototype.replaceData;
      window.__ftrackNavigationBarrier = {
        entered: false,
        release: null
      };
      prototype.replaceData = function (...args) {
        const shouldBlock =
          !window.__ftrackNavigationBarrier.entered &&
          this.element?.classList?.contains('plan-actuals-detail-grid');
        if (!shouldBlock) return originalReplaceData.apply(this, args);

        window.__ftrackNavigationBarrier.entered = true;
        return new Promise((resolve, reject) => {
          window.__ftrackNavigationBarrier.release = () => {
            Promise.resolve(originalReplaceData.apply(this, args)).then(resolve, reject);
          };
        });
      };

      const appData = JSON.parse(
        window.localStorage.getItem('ftrack:app-data') || '{}'
      );
      const scenarioId = Number(
        appData?.uiState?.lastScenarioId || appData?.scenarios?.[0]?.id || 0
      );
      document.dispatchEvent(new CustomEvent('forecast:planChanged', {
        detail: { scenarioId, reason: 'navigation barrier regression test' }
      }));
    });

    await expect.poll(() => page.evaluate(
      () => window.__ftrackNavigationBarrier?.entered === true
    )).toBe(true);

    const targetWorkflow = page.getByRole('button', {
      name: 'Accounts (Detail)',
      exact: true
    });
    await targetWorkflow.click();
    await targetWorkflow.click();
    await page.waitForTimeout(150);

    await expect(page.getByRole('button', { name: 'Plan & Actuals (Detail)', exact: true }))
      .toHaveClass(/active/);
    await expect(page.locator('#budgetSection')).toBeVisible();
    expect(await page.evaluate(() => {
      const appData = JSON.parse(
        window.localStorage.getItem('ftrack:app-data') || '{}'
      );
      return appData?.uiState?.lastWorkflowId || null;
    })).toBe('budget-detail');

    await page.evaluate(() => window.__ftrackNavigationBarrier.release());

    await expect(page.getByRole('button', { name: 'Accounts (Detail)', exact: true }))
      .toHaveClass(/active/);
    await expect(page.locator('#accountsSection')).toBeVisible();
    await expect(page.locator('#budgetSection')).toBeHidden();
  });

  test('serializes manual Refresh with scenario and workflow navigation', async ({ page }) => {
    await openSidebar(page);
    const before = await readAppData(page);
    const sourceScenarioId = Number(
      before?.uiState?.lastScenarioId || before?.scenarios?.[0]?.id || 0
    );

    await page.locator(
      `.scenario-list-item[data-scenario-id="${sourceScenarioId}"] button[title="Duplicate Scenario"]`
    ).click();
    await waitForScenarioCount(page, before.scenarios.length + 1);
    await expect(page.locator('.scenario-list-item'))
      .toHaveCount(before.scenarios.length + 1);

    const afterDuplicate = await readAppData(page);
    const targetScenario = afterDuplicate.scenarios.find(
      (scenario) => Number(scenario.id) !== sourceScenarioId
    );
    expect(targetScenario).toBeTruthy();

    await page.evaluate(async ({ scenarioId }) => {
      const { update } = await import('/js/app/managers/account-manager.js');
      await update(scenarioId, 1, { name: 'Refresh Navigation Target Account' });
    }, { scenarioId: targetScenario.id });

    await selectWorkflow(page, 'Plan & Actuals (Detail)');
    await expect(page.locator('#budgetTable .plan-actuals-detail-grid.tabulator'))
      .toBeVisible();

    await page.evaluate(() => {
      const prototype = window.Tabulator?.prototype;
      if (!prototype || typeof prototype.replaceData !== 'function') {
        throw new Error('Tabulator replaceData lifecycle is unavailable');
      }

      const originalReplaceData = prototype.replaceData;
      window.__ftrackManualRefreshBarrier = {
        entered: false,
        release: null
      };
      prototype.replaceData = function (...args) {
        const shouldBlock =
          !window.__ftrackManualRefreshBarrier.entered &&
          this.element?.classList?.contains('plan-actuals-detail-grid');
        if (!shouldBlock) return originalReplaceData.apply(this, args);

        window.__ftrackManualRefreshBarrier.entered = true;
        return new Promise((resolve, reject) => {
          window.__ftrackManualRefreshBarrier.release = () => {
            Promise.resolve(originalReplaceData.apply(this, args)).then(resolve, reject);
          };
        });
      };
    });

    const refreshButton = page.locator(
      '#budgetSection > .dash-row-header button[title="Refresh"]'
    );
    await refreshButton.evaluate((button) => button.click());
    await expect.poll(() => page.evaluate(
      () => window.__ftrackManualRefreshBarrier?.entered === true
    )).toBe(true);
    await expect(refreshButton).toBeDisabled();
    await expect(refreshButton).toHaveAttribute('aria-busy', 'true');

    await page.locator(
      `.scenario-list-item[data-scenario-id="${targetScenario.id}"]`
    ).click();
    await page.getByRole('button', { name: 'Accounts (Detail)', exact: true }).click();
    await page.waitForTimeout(150);

    await expect(page.getByRole('button', {
      name: 'Plan & Actuals (Detail)',
      exact: true
    })).toHaveClass(/active/);
    expect(await page.evaluate(() => {
      const data = JSON.parse(window.localStorage.getItem('ftrack:app-data') || '{}');
      return {
        scenarioId: Number(data?.uiState?.lastScenarioId || 0),
        workflowId: data?.uiState?.lastWorkflowId || null
      };
    })).toEqual({
      scenarioId: sourceScenarioId,
      workflowId: 'budget-detail'
    });

    await page.evaluate(() => window.__ftrackManualRefreshBarrier.release());

    await expect.poll(() => page.evaluate(() => {
      const data = JSON.parse(window.localStorage.getItem('ftrack:app-data') || '{}');
      return {
        scenarioId: Number(data?.uiState?.lastScenarioId || 0),
        workflowId: data?.uiState?.lastWorkflowId || null
      };
    })).toEqual({
      scenarioId: Number(targetScenario.id),
      workflowId: 'accounts-detail'
    });
    await expect(page.getByRole('button', {
      name: 'Accounts (Detail)',
      exact: true
    })).toHaveClass(/active/);
    await expect(page.locator('#accountsSection'))
      .toContainText('Refresh Navigation Target Account');
    await expect(page.locator('#budgetSection')).toBeHidden();
    await expect(refreshButton).toBeEnabled();
    await expect(refreshButton).not.toHaveAttribute('aria-busy', 'true');
  });

  test('does not let a Plan Rules refresh restore its presentation after General navigation', async ({ page }) => {
    await selectWorkflow(page, 'Plan Rules (Detail)');
    await expect(page.locator('#budgetTable .recurring-rules-detail-grid.tabulator'))
      .toBeVisible();

    await page.evaluate(() => {
      const refresh = document.querySelector(
        '#budgetSection button[title="Refresh recurring rules"]'
      );
      const general = [...document.querySelectorAll('.workflow-nav-item')]
        .find((button) => button.textContent?.trim() === 'General');
      if (!refresh || !general) throw new Error('Plan Rules refresh/General controls unavailable');

      // Keep both requests in one browser task so the refresh is awaiting its
      // scenario read when General synchronously revokes its render authority.
      refresh.click();
      general.click();
    });
    await closeFilterModal(page);

    await expect(page.getByRole('button', { name: 'General', exact: true }))
      .toHaveClass(/active/);
    await expect(page.locator('#budgetTable .recurring-rules-detail-grid')).toHaveCount(0);
    await expect(page.locator('#budgetSection .recurring-rule-card').first()).toBeVisible();
  });

  test('serializes manual projection generation with workflow navigation', async ({ page }) => {
    await selectWorkflow(page, 'Projections (Detail)');
    await expect(page.locator('#projectionsGrid.tabulator')).toBeVisible();

    await page.evaluate(() => {
      const prototype = window.Tabulator?.prototype;
      if (!prototype || typeof prototype.destroy !== 'function') {
        throw new Error('Tabulator destroy lifecycle is unavailable');
      }
      const originalDestroy = prototype.destroy;
      window.__ftrackProjectionNavigationBarrier = {
        entered: false,
        release: null
      };
      prototype.destroy = function (...args) {
        const shouldBlock =
          !window.__ftrackProjectionNavigationBarrier.entered &&
          this.element?.classList?.contains('projections-grid');
        if (!shouldBlock) return originalDestroy.apply(this, args);

        window.__ftrackProjectionNavigationBarrier.entered = true;
        return new Promise((resolve, reject) => {
          window.__ftrackProjectionNavigationBarrier.release = () => {
            Promise.resolve(originalDestroy.apply(this, args)).then(resolve, reject);
          };
        });
      };
    });

    await page.locator(
      '#projectionsSection button.card-inline-action[title="Refresh projections now"]'
    ).click();
    await expect.poll(() => page.evaluate(
      () => window.__ftrackProjectionNavigationBarrier?.entered === true
    )).toBe(true);

    await page.getByRole('button', { name: 'Accounts (Detail)', exact: true }).click();
    await page.waitForTimeout(150);
    await expect(page.getByRole('button', { name: 'Projections (Detail)', exact: true }))
      .toHaveClass(/active/);

    await page.evaluate(() => window.__ftrackProjectionNavigationBarrier.release());
    await expect(page.getByRole('button', { name: 'Accounts (Detail)', exact: true }))
      .toHaveClass(/active/);
    await expect(page.locator('#accountsSection')).toBeVisible();
    await expect(page.locator('#projectionsSection')).toBeHidden();
  });

  test('keeps refreshes requested during navigation pending until navigation is idle', async ({ page }) => {
    await selectWorkflow(page, 'Accounts (Detail)');
    await expect(page.locator('#budgetTable .plan-actuals-detail-grid')).toHaveCount(0);

    await page.evaluate(async () => {
      const DataStore = await import('/js/app/services/storage-service.js');
      let release;
      window.__ftrackNavigationRefreshBarrier = {
        entered: false,
        release: () => release?.()
      };
      const hold = new Promise((resolve) => {
        release = resolve;
      });
      void DataStore.transaction(async (data) => {
        window.__ftrackNavigationRefreshBarrier.entered = true;
        await hold;
        return data;
      });

      const prototype = window.Tabulator?.prototype;
      const originalReplaceData = prototype?.replaceData;
      window.__ftrackNavigationRefreshReplacements = 0;
      if (prototype && typeof originalReplaceData === 'function') {
        prototype.replaceData = function (...args) {
          if (this.element?.classList?.contains('plan-actuals-detail-grid')) {
            window.__ftrackNavigationRefreshReplacements += 1;
          }
          return originalReplaceData.apply(this, args);
        };
      }
    });
    await expect.poll(() => page.evaluate(
      () => window.__ftrackNavigationRefreshBarrier?.entered === true
    )).toBe(true);

    await page.getByRole('button', {
      name: 'Plan & Actuals (Detail)',
      exact: true
    }).click();
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('forecast:accountsUpdated'));
    });
    await page.waitForTimeout(150);

    // Navigation is held before loadScenarioData; the refresh must not render
    // the target surface out of turn.
    await expect(page.locator('#budgetTable .plan-actuals-detail-grid')).toHaveCount(0);

    await page.evaluate(() => window.__ftrackNavigationRefreshBarrier.release());
    await expect(page.getByRole('button', {
      name: 'Plan & Actuals (Detail)',
      exact: true
    })).toHaveClass(/active/);
    await expect(page.locator('#budgetTable .plan-actuals-detail-grid.tabulator'))
      .toBeVisible();
    await expect.poll(() => page.evaluate(
      () => window.__ftrackNavigationRefreshReplacements
    )).toBeGreaterThan(0);
  });
});
