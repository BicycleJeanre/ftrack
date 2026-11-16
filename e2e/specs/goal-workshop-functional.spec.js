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
    await selectWorkflow(page, 'Workshop');
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

  test('combines business flows, compares variables through projections, and saves only the setup', async ({ page }) => {
    const before = await currentScenario(page);
    await page.getByLabel('Scenario setup strategy').selectOption('business');
    const feature = page.locator('[data-business-model]');
    await expect(feature).toBeVisible();
    await feature.getByLabel('Minimum business closing cash (optional)').fill('999999');
    await feature.getByRole('button', { name: 'Business cash account', exact: true }).click();
    await page.locator('.selection-dialog').getByRole('option', { name: /^Checking\b/ }).click();
    await feature.getByRole('button', { name: 'Add variable', exact: true }).click();
    await feature.getByLabel('Variable name').fill('Subscribers');
    await feature.getByLabel('Default value').fill('5');
    await feature.getByLabel('Revenue model preset').selectOption({ label: 'Recurring customers' });
    await feature.getByRole('button', { name: 'Add preset', exact: true }).click();
    const revenue = feature.getByRole('group', { name: 'Flow 1', exact: true });
    await revenue.getByLabel('Flow name').fill('Recurring fees');
    await expect(revenue.getByLabel('Calculation')).toHaveValue('volume');
    await revenue.getByLabel('Quantity variable').selectOption({ label: 'Subscribers' });
    await revenue.getByLabel('Rate per unit').fill('100');
    await feature.getByRole('button', { name: 'Add cost', exact: true }).click();
    const cost = feature.getByRole('group', { name: 'Flow 2', exact: true });
    await cost.getByLabel('Flow name').fill('Payroll');
    await cost.getByLabel('Amount', { exact: true }).fill('300');
    await feature.getByLabel('Variable to test').selectOption({ label: 'Subscribers' });
    await feature.getByLabel('Test from').fill('2');
    await feature.getByLabel('Test to').fill('6');
    await feature.getByLabel('Test step').fill('2');
    await feature.getByRole('button', { name: 'Test range', exact: true }).click();
    await expect(feature.getByRole('status')).toContainText('Preview only');
    const comparison = feature.getByRole('table', { name: 'Compare test values' });
    await expect(comparison.getByRole('row')).toHaveCount(4);
    await expect(comparison.getByRole('row').nth(1)).toContainText('2026-01: short');
    const firstEndingCash = await comparison.getByRole('row').nth(1).getByRole('cell').nth(1).innerText();
    await expect(comparison.getByRole('row').nth(3).getByRole('cell').nth(1)).not.toHaveText(firstEndingCash);
    await feature.getByLabel('Preview test case').selectOption({ label: '6' });
    await expect(feature.getByRole('heading', { name: 'Preview · Subscribers: 6' })).toBeVisible();
    await feature.getByText('Review proposed Plan Rules (2)', { exact: true }).click();
    await expect(feature.getByRole('table', { name: 'Proposed account movements' })).toContainText('Recurring fees');
    await expect(feature.getByRole('table', { name: 'Proposed account movements' })).toContainText('Payroll');
    await feature.getByRole('button', { name: 'Save setup' }).click();
    await waitForScenario(page, current => current.planning.businessModel?.flows.length === 2);
    const after = await currentScenario(page);
    for (const key of ['transactions', 'transactionOccurrences', 'accounts', 'projection']) {
      expect(after[key]).toEqual(before[key]);
    }
    await page.reload();
    await expect(page.getByLabel('Scenario setup strategy')).toHaveValue('business');
    await expect(feature.getByLabel('Default value')).toHaveValue('5');
    await expect(feature.getByLabel('Flow name').last()).toHaveValue('Payroll');
    await page.setViewportSize({ width: 390, height: 844 });
    await feature.getByRole('button', { name: 'Preview projections', exact: true }).click();
    await expect(feature.getByRole('status')).toContainText('Preview only');
    await expect.poll(() => feature.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await page.getByLabel('Scenario setup strategy').selectOption('balanced');
    await expect(page.locator('#adv-goals-panel')).toBeVisible();
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
    await newConstraint.locator('select').first().selectOption('lockedAccount');
    await newConstraint.locator('select').nth(1).selectOption('3');
    await waitForScenario(page, (scenario) =>
      scenario.advancedGoalSettings.constraints.lockedAccountIds.length === beforeLocked + 1,
      'constraint added');

    await newConstraint.locator('button[title="Remove"]').click();
    await waitForScenario(page, (scenario) =>
      scenario.advancedGoalSettings.constraints.lockedAccountIds.length === beforeLocked,
      'constraint removed');
  });

  test('creates and selects a new business account without losing unsaved Workshop inputs', async ({ page }) => {
    await page.getByLabel('Scenario setup strategy').selectOption('business');
    const feature = page.locator('[data-business-model]');
    await feature.getByRole('button', { name: 'Add revenue', exact: true }).click();
    await feature.getByLabel('Flow name').fill('Unsaved revenue flow');
    await feature.getByRole('button', { name: 'Counterparty account', exact: true }).click();
    await page.locator('.selection-dialog').getByRole('option', { name: /Add new account/ }).click();
    await page.locator('.modal-quick-account').getByLabel('Name', { exact: true }).fill('New workshop counterparty');
    await page.getByRole('button', { name: 'Use Account', exact: true }).click();
    await expect(feature.getByRole('button', { name: 'Counterparty account', exact: true }))
      .toContainText('New workshop counterparty');
    await expect(feature.getByLabel('Flow name')).toHaveValue('Unsaved revenue flow');
    await feature.getByRole('button', { name: 'Business cash account', exact: true }).click();
    await expect(page.locator('.selection-dialog').getByRole('option', { name: /^New workshop counterparty/ })).toBeVisible();
    await page.locator('.selection-dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await feature.getByRole('button', { name: 'Save setup' }).click();
    await waitForScenario(page, scenario => {
      const account = scenario.accounts.find(entry => entry.name === 'New workshop counterparty');
      return account && Number(scenario.planning.businessModel?.flows[0]?.counterpartyId) === account.id;
    });
  });

  test('creates a Goal Contribution account with its amount and date in the same picker', async ({ page }) => {
    await page.getByLabel('Scenario setup strategy').selectOption('goal-contribution');
    await page.getByRole('button', { name: 'Goal Account', exact: true }).click();
    await page.locator('.selection-dialog').getByRole('option', { name: /Add new account/ }).click();
    const modal = page.locator('.modal-quick-account');
    await modal.getByLabel('Name', { exact: true }).fill('New savings target');
    await modal.getByLabel('Goal Amount').fill('1500');
    await modal.getByLabel('Goal Date').fill('2026-12-15');
    await modal.getByRole('button', { name: 'Use Account', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Goal Account', exact: true })).toContainText('New savings target');
    await waitForScenario(page, scenario => scenario.accounts.some(account =>
      account.name === 'New savings target' && account.goalAmount === 1500 && account.goalDate === '2026-12-15'));
  });

  test('can create a funding account directly from a Workshop constraint', async ({ page }) => {
    const card = page.locator('#adv-constraints-panel .grid-summary-card').first();
    await card.locator('.grid-summary-card-summary').click();
    await card.getByRole('button', { name: 'Constraint account', exact: true }).click();
    await page.locator('.selection-dialog').getByRole('option', { name: /Add new account/ }).click();
    const modal = page.locator('.modal-quick-account');
    await modal.getByLabel('Name', { exact: true }).fill('New Workshop funding');
    await modal.getByRole('button', { name: 'Use Account', exact: true }).click();
    await waitForScenario(page, scenario => {
      const added = scenario.accounts.find(account => account.name === 'New Workshop funding');
      return added && scenario.advancedGoalSettings.constraints.fundingAccountId === added.id;
    });
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
      .toContainText('Configure goals and constraints');
    await waitForScenario(page, (scenario) => scenario.transactions.some(
      (transaction) => transaction.description === 'Goal refresh regression rule'
    ), 'plan rule persisted before Generate Plan refreshed');
  });

  test('offers and persists all four solver strategies', async ({ page }) => {
    const selector = page.getByLabel('Scenario setup strategy');
    await expect(selector.locator('option')).toHaveCount(6);

    const strategies = [
      { value: 'priority-cascade', label: 'Priority Cascade', allocation: 'cascade', payoff: 'priority' },
      { value: 'snowball', label: 'Debt Snowball', allocation: 'cascade', payoff: 'snowball' },
      { value: 'avalanche', label: 'Debt Avalanche', allocation: 'cascade', payoff: 'avalanche' },
      { value: 'balanced', label: 'Balanced Monthly', allocation: 'parallel', payoff: 'priority' }
    ];

    for (const strategy of strategies) {
      await selector.selectOption(strategy.value);
      await waitForScenario(page, (scenario) =>
        scenario.advancedGoalSettings.strategy === strategy.value &&
        scenario.advancedGoalSettings.allocationStrategy === strategy.allocation &&
        scenario.advancedGoalSettings.payoffOrder === strategy.payoff,
        `${strategy.label} saved`);
      await expect(selector).toHaveValue(strategy.value);
      await expect(page.locator('#generatePlanSection .goal-workshop-strategy-badge'))
        .toHaveText(strategy.label);
    }
  });

  test('persists avalanche strategy and a contractual goal minimum', async ({ page }) => {
    await page.getByLabel('Scenario setup strategy').selectOption('avalanche');
    await waitForScenario(page, (scenario) =>
      scenario.advancedGoalSettings.strategy === 'avalanche' &&
      scenario.advancedGoalSettings.allocationStrategy === 'cascade' &&
      scenario.advancedGoalSettings.payoffOrder === 'avalanche',
      'avalanche strategy saved');

    await expect(page.locator('#generatePlanSection .goal-workshop-strategy-badge'))
      .toHaveText('Debt Avalanche');

    const goalCard = page.locator('#adv-goals-panel .grid-summary-card').first();
    await goalCard.locator('.grid-summary-card-summary').click();
    await goalCard.getByLabel('Contractual Minimum / Month').fill('125');
    await goalCard.getByLabel('Contractual Minimum / Month').blur();

    await waitForScenario(page, (scenario) =>
      Number(scenario.advancedGoalSettings.goals[0].minimumMonthlyAmount) === 125,
      'contractual minimum saved');
  });

  test('solves a pay-down snowball and creates phased schema-valid rules', async ({ page }) => {
    await page.evaluate(async () => {
      const ScenarioManager = await import('/js/app/managers/scenario-manager.js');
      const data = JSON.parse(window.localStorage.getItem('ftrack:app-data') || '{}');
      const scenarioId = Number(data?.uiState?.lastScenarioId || data?.scenarios?.[0]?.id || 0);
      const scenario = data.scenarios.find((item) => Number(item.id) === scenarioId);
      await ScenarioManager.update(scenarioId, {
        transactions: scenario.transactions.filter((transaction) => transaction.id !== 1003),
        advancedGoalSettings: {
          strategy: 'snowball',
          allocationStrategy: 'cascade',
          payoffOrder: 'snowball',
          constraints: {
            fundingAccountId: 1,
            maxOutflowPerMonth: 200,
            lockedAccountIds: [],
            maxMovementByAccountId: {},
            minBalanceFloorsByAccountId: {}
          },
          goals: [
            {
              id: 'pay-card',
              priority: 1,
              type: 'pay_down_by_date',
              accountId: 3,
              targetAmount: 0,
              startDate: '2026-01-01',
              endDate: '2026-12-31'
            },
            {
              id: 'grow-savings',
              priority: 2,
              type: 'reach_balance_by_date',
              accountId: 2,
              targetAmount: 700,
              startDate: '2026-01-01',
              endDate: '2026-12-31'
            }
          ]
        }
      });
      window.location.reload();
    });

    await selectWorkflow(page, 'Workshop');
    await page.locator('#generatePlanSection button[title="Solve — calculate suggested plan rules"]').click();

    await expect(page.locator('#adv-goal-solution-totals')).toContainText('Plan ready to apply');
    await expect(page.locator('#adv-goal-solution')).toContainText('Credit Card');
    await expect(page.locator('#adv-goal-solution')).toContainText('Savings Goal');

    const applyButton = page.locator('#generatePlanSection button[title="Apply — add plan rules to this scenario"]');
    await expect(applyButton).toBeEnabled();
    await applyButton.click();

    await waitForScenario(page, (scenario) => {
      const generated = scenario.transactions.filter((transaction) =>
        transaction.tags?.includes('adv-goal-generated')
      );
      return generated.length >= 2 && generated.every((transaction) =>
        !Object.prototype.hasOwnProperty.call(transaction, 'status')
      );
    }, 'schema-valid phased cascade rules applied');

    const validation = await page.evaluate(async () => {
      const { validateAppData } = await import('/js/app/services/validation-service.js');
      const data = JSON.parse(window.localStorage.getItem('ftrack:app-data') || '{}');
      return validateAppData(data);
    });
    expect(validation.isValid).toBe(true);
  });

  test('refreshes simple Generate Plan after an account goal input changes', async ({ page }) => {
    await page.getByLabel('Scenario setup strategy').selectOption('goal-contribution');

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
