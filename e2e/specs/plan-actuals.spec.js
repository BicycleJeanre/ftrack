const { test, expect } = require('@playwright/test');
const {
  loadSmokeData,
  gotoFTrack,
  currentScenario,
  waitForCollectionCount,
  waitForScenario
} = require('../helpers/app-data');
const {
  selectWorkflow,
  openSectionFilters,
  closeFilterModal,
  confirmDialog
} = require('../helpers/ui');

function editorField(form, label) {
  const exactLabel = new RegExp(
    `^${String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
  );
  return form.locator('label.grid-summary-label')
    .filter({ hasText: exactLabel })
    .locator('..');
}

async function openNewItemEditor(page) {
  await openSectionFilters(page, '#budgetSection');
  await page.locator('.filter-modal button[title="Add item"]').click();
  await closeFilterModal(page);
  const form = page.locator('#budgetSection .plan-actuals-new-item form');
  await expect(form).toBeVisible();
  return form;
}

async function fillNewItem(form, {
  date,
  description,
  amount,
  status = 'planned',
  actualAmount = null
}) {
  await editorField(form, 'Secondary account').locator('select').selectOption('5');
  await editorField(form, 'Movement').locator('select').selectOption('2');
  await editorField(form, 'Date').locator('input').fill(date);
  await editorField(form, 'Current plan').locator('input').fill(String(amount));
  await editorField(form, 'Status').locator('select').selectOption(status);
  if (actualAmount !== null) {
    await editorField(form, 'Actual amount').locator('input').fill(String(actualAmount));
  }
  await editorField(form, 'Description').locator('input').fill(description);
}

async function selectPlanPeriod(page, label) {
  const select = page.locator('#plan-period-inline');
  const value = await select.locator('option').filter({ hasText: label }).getAttribute('value');
  expect(value, `Plan period option containing "${label}"`).toBeTruthy();
  await select.selectOption(value);
  await expect(select).toHaveValue(value);
}

async function expectPlanTotal(page, label, value) {
  const metric = page.locator('#budgetSection .plan-actuals-totals .total-metric', {
    has: page.locator('.label', { hasText: label })
  });
  await expect(metric.locator('.label')).toHaveText(label);
  await expect(metric.locator('.value')).toHaveText(value);
}

function buildRecurringSplitAppData() {
  const appData = loadSmokeData();
  const scenario = appData.scenarios[0];
  const recurrence = {
    recurrenceType: 4,
    startDate: '2026-01-15',
    endDate: null,
    interval: 1,
    dayOfMonth: 15
  };
  const groupId = 'loan-payment';
  const splitRules = [
    {
      id: 1011,
      secondaryAccountId: 3,
      amount: 800,
      description: 'Loan principal',
      transactionGroupRole: 'principal'
    },
    {
      id: 1012,
      secondaryAccountId: 7,
      amount: 150,
      description: 'Loan interest',
      transactionGroupRole: 'interest'
    },
    {
      id: 1013,
      secondaryAccountId: 5,
      amount: 50,
      description: 'Loan insurance',
      transactionGroupRole: 'insurance'
    }
  ].map((rule) => ({
    ...rule,
    primaryAccountId: 1,
    transactionTypeId: 2,
    effectiveDate: '2026-01-15',
    recurrence: { ...recurrence },
    periodicChange: null,
    tags: ['debt'],
    transactionGroupId: groupId
  }));

  scenario.accounts.push({
    id: 7,
    name: 'Loan Interest Expense',
    type: { id: 5, name: 'Expense' },
    currency: { id: 1, name: 'ZAR' },
    startingBalance: 0,
    openDate: '2026-01-01',
    periodicChange: null,
    goalAmount: null,
    goalDate: null,
    tags: ['debt']
  });
  scenario.transactions.push(...splitRules);
  scenario.splitTransactionSets.push({
    id: groupId,
    description: 'Loan payment',
    payingAccountId: 1,
    effectiveDate: '2026-01-15',
    strategy: 'manual',
    targetAccountId: 3,
    interestSource: 'manual',
    customRate: null,
    totalAmount: 1000,
    recurrence: { ...recurrence },
    tags: ['debt'],
    components: [
      {
        role: 'principal',
        accountId: 3,
        transactionTypeId: 2,
        description: 'Loan principal',
        recurrence: { ...recurrence },
        periodicChange: null,
        amountMode: 'fixed',
        value: 800,
        order: 0
      },
      {
        role: 'interest',
        accountId: 7,
        transactionTypeId: 2,
        description: 'Loan interest',
        recurrence: { ...recurrence },
        periodicChange: null,
        amountMode: 'fixed',
        value: 150,
        order: 1
      },
      {
        role: 'insurance',
        accountId: 5,
        transactionTypeId: 2,
        description: 'Loan insurance',
        recurrence: { ...recurrence },
        periodicChange: null,
        amountMode: 'fixed',
        value: 50,
        order: 2
      }
    ]
  });
  scenario.transactionOccurrences.push({
    id: 2090,
    sourceTransactionId: 1011,
    occurrenceKey: 'tx:1011|date:2026-01-15|role:principal',
    scheduledDate: '2026-01-15',
    plannedDate: null,
    actualDate: '2026-01-16',
    baselineAmount: 800,
    plannedAmount: 800,
    actualAmount: 805,
    status: 'actual',
    origin: 'generated',
    isOverride: true,
    primaryAccountId: 1,
    secondaryAccountId: 3,
    transactionTypeId: 2,
    baselinePrimaryAccountId: 1,
    baselineSecondaryAccountId: 3,
    baselineTransactionTypeId: 2,
    baselineSnapshotVersion: 1,
    actualSnapshotVersion: 1,
    description: 'January loan actual',
    tags: ['debt'],
    transactionGroupId: groupId,
    transactionGroupRole: 'principal',
    transactionGroupAccountGroupId: null,
    capitalAmount: 800,
    interestAmount: 0,
    recurrence: null,
    recurrenceDescription: null,
    periodicChange: null,
    createdAt: '2026-01-16T10:00:00.000Z',
    updatedAt: '2026-01-16T10:00:00.000Z'
  });
  scenario.baselinePeriods.push({
    periodTypeId: 3,
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    frozenAt: '2026-01-16T10:00:00.000Z'
  });
  return appData;
}

test.describe('unified Plan & Actuals workflow', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFTrack(page);
    await selectWorkflow(page, 'General');
    await page.getByRole('tab', { name: 'Period', exact: true }).click();
  });

  test('uses one card with Period and Recurring modes and no separate Transactions card', async ({ page }) => {
    const planSection = page.locator('#budgetSection');
    await expect(planSection).toBeVisible();
    await expect(planSection.locator('.forecast-card')).toHaveCount(1);
    await expect(page.locator('#transactionsSection')).toBeHidden();
    const totals = planSection.locator('.plan-actuals-totals');
    await expect(totals).toContainText('Baseline Net');
    await expect(totals).toContainText('Current Plan Net');
    await expect(totals).toContainText('Actual Net');
    await expect(totals).toContainText('Open Commitments');
    await expect(totals).toContainText('Forecast Net');
    await expect(totals).toContainText('Actual vs Baseline');
    await expect(totals).toContainText('Actual vs Current');
    await expect(totals).toContainText('Unplanned Actuals');

    const periodTab = page.getByRole('tab', { name: 'Period', exact: true });
    const recurringTab = page.getByRole('tab', { name: 'Recurring', exact: true });
    await expect(periodTab).toHaveAttribute('aria-selected', 'true');
    await expect(recurringTab).toHaveAttribute('aria-selected', 'false');
    await expect(planSection).toContainText('Groceries budget');

    await recurringTab.click();
    await expect(recurringTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#budgetTable')).toContainText('Monthly salary');
    await expect(page.locator('#budgetTable')).toContainText('Groceries');
    await expect(page.locator('#budgetTable .recurring-rule-card', {
      hasText: 'Monthly salary'
    }).locator('.recurring-rule-movement'))
      .toHaveText(/Salary Income.*→.*Checking/);

    await periodTab.click();
    await expect(periodTab).toHaveAttribute('aria-selected', 'true');
    await expect(planSection).toContainText('Groceries budget');
  });

  test('renders descriptions immediately below direction-aware money movements', async ({ page }) => {
    const moneyOutCard = page.locator('#budgetSection .plan-actuals-item', {
      hasText: 'Groceries budget'
    });
    await expect(moneyOutCard.locator('.plan-actuals-movement'))
      .toHaveText(/Money Out: Checking.*→.*Groceries Expense/);
    await expect(moneyOutCard.locator('.plan-actuals-description'))
      .toHaveText('Groceries budget');

    const moneyInCard = page.locator('#budgetSection .plan-actuals-item', {
      hasText: 'Monthly salary'
    });
    await expect(moneyInCard.locator('.plan-actuals-movement'))
      .toHaveText(/Money In: Salary Income.*→.*Checking/);

    for (const card of [moneyOutCard, moneyInCard]) {
      expect(await card.evaluate((element) => {
        const movement = element.querySelector('.plan-actuals-movement');
        const description = element.querySelector('.plan-actuals-description');
        return Boolean(
          movement &&
          description &&
          (movement.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING)
        );
      })).toBe(true);
    }
  });

  test('renders Period money movement from the selected account perspective', async ({ page }) => {
    await openSectionFilters(page, '#budgetSection');
    const accountFilter = page.locator('.filter-modal #plan-account');
    await accountFilter.selectOption('5');
    await closeFilterModal(page);

    const groceriesCard = page.locator('#budgetSection .plan-actuals-item', {
      hasText: 'Groceries budget'
    });
    await expect(groceriesCard).toBeVisible();
    await expect(groceriesCard.locator('.plan-actuals-movement'))
      .toHaveText(/Money In: Checking.*→.*Groceries Expense/);

    await selectWorkflow(page, 'Plan & Actuals (Detail)');
    await openSectionFilters(page, '#budgetSection');
    const detailAccountFilter = page.locator('.filter-modal #plan-account');
    await detailAccountFilter.selectOption('5');
    await closeFilterModal(page);

    const groceriesDetailRow = page.locator(
      '#budgetTable .plan-actuals-detail-grid .tabulator-row',
      { hasText: 'Groceries budget' }
    );
    await expect(groceriesDetailRow).toBeVisible();
    await expect(
      groceriesDetailRow.locator(
        '.tabulator-cell[tabulator-field="movement"] .plan-actuals-detail-movement'
      )
    ).toContainText(/Money In: Checking.*→.*Groceries Expense/);
  });

  test('adds both a planned item and a manual actual', async ({ page }) => {
    const before = (await currentScenario(page)).transactionOccurrences.length;

    const plannedForm = await openNewItemEditor(page);
    await fillNewItem(plannedForm, {
      date: '2026-01-20',
      description: 'Extra period cost',
      amount: 125
    });
    await plannedForm.getByRole('button', { name: 'Add item' }).click();
    await waitForCollectionCount(page, 'transactionOccurrences', before + 1);
    await waitForScenario(page, (scenario) => scenario.transactionOccurrences.some(
      (occurrence) => occurrence.description === 'Extra period cost' &&
        occurrence.status === 'planned' &&
        Number(occurrence.plannedAmount) === 125
    ), 'planned manual occurrence persisted');

    const actualForm = await openNewItemEditor(page);
    await fillNewItem(actualForm, {
      date: '2026-01-22',
      description: 'Unplanned repair',
      amount: 0,
      status: 'actual',
      actualAmount: 275
    });
    await actualForm.getByRole('button', { name: 'Add item' }).click();
    await waitForCollectionCount(page, 'transactionOccurrences', before + 4);
    await waitForScenario(page, (scenario) => {
      const actual = scenario.transactionOccurrences.find(
        (occurrence) => occurrence.description === 'Unplanned repair'
      );
      return actual?.status === 'actual' &&
        Number(actual.actualAmount) === 275 &&
        Number(actual.baselineAmount) === 0 &&
        actual.actualDate === '2026-01-22' &&
        scenario.baselinePeriods.some(
          (period) => period.startDate === '2026-01-01' && period.endDate === '2026-01-31'
        );
    }, 'manual actual and frozen period baseline persisted');
  });

  test('treats a One Time recurrence selection as a manual one-time item', async ({ page }) => {
    const before = await currentScenario(page);
    const form = await openNewItemEditor(page);
    await fillNewItem(form, {
      date: '2026-01-24',
      description: 'One-time period adjustment',
      amount: 90
    });

    await editorField(form, 'Repeat').locator('button').click();
    const recurrenceModal = page.locator('.modal-recurrence');
    await expect(recurrenceModal).toBeVisible();
    await recurrenceModal.locator('#recurrenceType').selectOption('1');
    await recurrenceModal.locator('button[title="Save"]').click();
    await expect(editorField(form, 'Repeat').locator('button')).toHaveText('One time');

    await form.getByRole('button', { name: 'Add item' }).click();
    await waitForScenario(page, (scenario) => (
      scenario.transactions.length === before.transactions.length &&
      scenario.transactionOccurrences.some(
        (occurrence) => occurrence.description === 'One-time period adjustment' &&
          occurrence.status === 'planned' &&
          !occurrence.sourceTransactionId
      ) &&
      !scenario.transactions.some(
        (transaction) => transaction.promotedFromOccurrenceKey &&
          transaction.description === 'One-time period adjustment'
      )
    ), 'one-time item persisted without recurring-rule promotion');
  });

  test('marks actual, skips and restores, duplicates, and promotes a manual copy to recurring', async ({ page }) => {
    const groceryCard = page.locator('#budgetSection .plan-actuals-item', {
      hasText: 'Groceries budget'
    });
    const groceryKey = await groceryCard.getAttribute('data-occurrence-key');
    await groceryCard.locator('button[title="Mark actual"]').click();
    await waitForScenario(page, (scenario) => {
      const occurrence = scenario.transactionOccurrences.find(
        (item) => item.occurrenceKey === groceryKey
      );
      return occurrence?.status === 'actual' && Number(occurrence.actualAmount) === 450;
    }, 'planned occurrence marked actual');
    await expectPlanTotal(page, 'Baseline Net', 'R 2 300,00');
    await expectPlanTotal(page, 'Current Plan Net', 'R 2 300,00');
    await expectPlanTotal(page, 'Actual Net', '-R 450,00');
    await expectPlanTotal(page, 'Open Commitments', 'R 2 750,00');
    await expectPlanTotal(page, 'Forecast Net', 'R 2 300,00');
    await expectPlanTotal(page, 'Actual vs Baseline', '-R 2 750,00');
    await expectPlanTotal(page, 'Actual vs Current', '-R 2 750,00');
    await expectPlanTotal(page, 'Unplanned Actuals', 'R 0,00');

    const paymentCard = page.locator('#budgetSection .plan-actuals-item', {
      hasText: 'Credit card payment'
    });
    const paymentKey = await paymentCard.getAttribute('data-occurrence-key');
    await paymentCard.locator('button[title="Skip occurrence"]').click();
    await waitForScenario(page, (scenario) => scenario.transactionOccurrences.some(
      (occurrence) => occurrence.occurrenceKey === paymentKey && occurrence.status === 'skipped'
    ), 'occurrence marked skipped');

    const skippedCard = page.locator(
      `#budgetSection .plan-actuals-item[data-occurrence-key="${paymentKey}"]`
    );
    await skippedCard.locator('button[title="Edit item"]').click();
    const restoreForm = skippedCard.locator('form');
    await expect(editorField(restoreForm, 'Repeat').locator('button')).toBeDisabled();
    await expect(editorField(restoreForm, 'Apply change to')).toHaveCount(0);
    await editorField(restoreForm, 'Status').locator('select').selectOption('planned');
    await restoreForm.getByRole('button', { name: 'Save' }).click();
    await waitForScenario(page, (scenario) => scenario.transactionOccurrences.some(
      (occurrence) => occurrence.occurrenceKey === paymentKey && occurrence.status === 'planned'
    ), 'skipped occurrence restored to planned');

    const transactionCount = (await currentScenario(page)).transactions.length;
    const occurrenceCount = (await currentScenario(page)).transactionOccurrences.length;
    const salaryCard = page.locator('#budgetSection .plan-actuals-item', {
      hasText: 'Monthly salary'
    }).first();
    await salaryCard.locator('button[title="Duplicate item"]').click();
    await waitForCollectionCount(page, 'transactionOccurrences', occurrenceCount + 1);

    const manualCopy = page.locator('#budgetSection .plan-actuals-item', {
      hasText: 'Monthly salary'
    }).filter({ has: page.locator('button[title="Repeat going forward"]') });
    await expect(manualCopy).toHaveCount(1);
    const manualKey = await manualCopy.getAttribute('data-occurrence-key');
    await manualCopy.locator('button[title="Repeat going forward"]').click();

    const recurrenceModal = page.locator('.modal-recurrence');
    await expect(recurrenceModal).toBeVisible();
    await recurrenceModal.locator('#recurrenceType').selectOption('4');
    await recurrenceModal.locator('#dayOfMonth').fill('25');
    await recurrenceModal.locator('button[title="Save"]').click();

    await waitForCollectionCount(page, 'transactions', transactionCount + 1);
    await waitForScenario(page, (scenario) => scenario.transactions.some(
      (transaction) => transaction.promotedFromOccurrenceKey === manualKey &&
        Number(
          typeof transaction.recurrence?.recurrenceType === 'object'
            ? transaction.recurrence.recurrenceType.id
            : transaction.recurrence?.recurrenceType
        ) === 4
    ), 'manual copy promoted to a recurring rule');
  });

  test('applies occurrence, this-and-future, and entire-series edits without rewriting actual history', async ({ page }) => {
    let groceryCard = page.locator('#budgetSection .plan-actuals-item', {
      hasText: 'Groceries budget'
    });
    const januaryKey = await groceryCard.getAttribute('data-occurrence-key');

    await groceryCard.locator('button[title="Edit item"]').click();
    let form = groceryCard.locator('form');
    await editorField(form, 'Current plan').locator('input').fill('475');
    await editorField(form, 'Description').locator('input').fill('January groceries override');
    await editorField(form, 'Apply change to').locator('select').selectOption('occurrence');
    await form.getByRole('button', { name: 'Save' }).click();
    await waitForScenario(page, (scenario) => {
      const occurrence = scenario.transactionOccurrences.find(
        (item) => item.occurrenceKey === januaryKey
      );
      const source = scenario.transactions.find((item) => Number(item.id) === 1002);
      return Number(occurrence?.plannedAmount) === 475 &&
        occurrence?.description === 'January groceries override' &&
        Number(source?.amount) === 450 &&
        source?.description === 'Groceries';
    }, 'occurrence-only override persisted without changing its rule');

    groceryCard = page.locator(
      `#budgetSection .plan-actuals-item[data-occurrence-key="${januaryKey}"]`
    );
    await groceryCard.locator('button[title="Edit item"]').click();
    form = groceryCard.locator('form');
    await editorField(form, 'Status').locator('select').selectOption('actual');
    await editorField(form, 'Actual amount').locator('input').fill('468');
    await form.getByRole('button', { name: 'Save' }).click();
    await waitForScenario(page, (scenario) => {
      const occurrence = scenario.transactionOccurrences.find(
        (item) => item.occurrenceKey === januaryKey
      );
      return occurrence?.status === 'actual' &&
        Number(occurrence.actualAmount) === 468 &&
        occurrence.actualDate === '2026-01-10' &&
        occurrence.description === 'January groceries override';
    }, 'January actual metadata persisted');

    await selectPlanPeriod(page, 'February 2026');
    let futureCard = page.locator('#budgetSection .plan-actuals-item', {
      hasText: 'Groceries'
    });
    const februaryKey = await futureCard.getAttribute('data-occurrence-key');
    await futureCard.locator('button[title="Edit item"]').click();
    form = futureCard.locator('form');
    await editorField(form, 'Current plan').locator('input').fill('500');
    await editorField(form, 'Description').locator('input').fill('Groceries from February');
    await editorField(form, 'Apply change to').locator('select').selectOption('future');
    await form.getByRole('button', { name: 'Save' }).click();
    await waitForScenario(page, (scenario) => {
      const januaryActual = scenario.transactionOccurrences.find(
        (item) => item.occurrenceKey === januaryKey
      );
      const originalRule = scenario.transactions.find((item) => Number(item.id) === 1002);
      const replacement = scenario.transactions.find(
        (item) => Number(item.seriesRootId) === 1002 &&
          Number(item.supersedesTransactionId) === 1002
      );
      return januaryActual?.status === 'actual' &&
        Number(januaryActual.actualAmount) === 468 &&
        januaryActual.actualDate === '2026-01-10' &&
        Number(originalRule?.amount) === 450 &&
        originalRule?.activeTo === '2026-02-09' &&
        Number(replacement?.amount) === 500 &&
        replacement?.activeFrom === '2026-02-10' &&
        replacement?.description === 'Groceries from February';
    }, 'this-and-future split preserved January actual history');

    await selectPlanPeriod(page, 'March 2026');
    const seriesCard = page.locator('#budgetSection .plan-actuals-item', {
      hasText: 'Groceries from February'
    });
    await seriesCard.locator('button[title="Edit item"]').click();
    form = seriesCard.locator('form');
    await editorField(form, 'Current plan').locator('input').fill('525');
    await editorField(form, 'Description').locator('input').fill('Groceries current series');
    await editorField(form, 'Apply change to').locator('select').selectOption('series');
    await form.getByRole('button', { name: 'Save' }).click();
    await waitForScenario(page, (scenario) => {
      const januaryActual = scenario.transactionOccurrences.find(
        (item) => item.occurrenceKey === januaryKey
      );
      const marchRules = scenario.transactions.filter(
        (item) => Number(item.seriesRootId) === 1002 &&
          String(item.activeFrom || item.recurrence?.startDate || '') >= '2026-03-10'
      );
      return januaryActual?.status === 'actual' &&
        Number(januaryActual.actualAmount) === 468 &&
        januaryActual.actualDate === '2026-01-10' &&
        marchRules.some(
          (item) => Number(item.amount) === 525 &&
            item.description === 'Groceries current series'
        );
    }, 'entire-series edit preserved actual history');

    expect(februaryKey).toContain('2026-02-10');
  });

  test('keeps Recurring Money In edits canonical under a secondary-account filter', async ({ page }) => {
    await page.getByRole('tab', { name: 'Recurring', exact: true }).click();
    await openSectionFilters(page, '#budgetSection');
    const accountFilter = page.locator('.filter-modal #tx-account-filter-select');
    await accountFilter.selectOption('4');
    await closeFilterModal(page);

    let salaryRule = page.locator('#budgetTable .recurring-rule-card', {
      hasText: 'Monthly salary'
    });
    await expect(salaryRule).toHaveAttribute('data-source-transaction-id', '1001');
    await expect(salaryRule.locator('.grid-summary-type')).toHaveText('Money Out');
    await expect(salaryRule.locator('.recurring-rule-movement'))
      .toHaveText(/Salary Income.*→.*Checking/);

    await salaryRule.locator('.recurring-rule-description').click();
    const form = salaryRule.locator('.grid-summary-form');
    await expect(form).toBeVisible();
    await expect(editorField(form, 'Receiving account').locator('select')).toHaveValue('1');
    await expect(editorField(form, 'Source account').locator('select')).toHaveValue('4');
    await expect(editorField(form, 'Movement').locator('select')).toHaveValue('1');
    await expect(
      editorField(form, 'Source account').locator('option[value="1"]')
    ).toBeDisabled();
    await editorField(form, 'Receiving account').locator('select').selectOption('2');
    await editorField(form, 'Description').locator('input').fill('Monthly salary canonical edit');
    await editorField(form, 'Apply change to').locator('select').selectOption('future');

    await salaryRule.locator('.grid-summary-header').evaluate((header) => {
      header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitForScenario(page, (scenario) => scenario.transactions.some(
      (transaction) => (
        Number(transaction.seriesRootId || transaction.id) === 1001 &&
        transaction.description === 'Monthly salary canonical edit' &&
        Number(transaction.primaryAccountId) === 2 &&
        Number(transaction.secondaryAccountId) === 4 &&
        Number(transaction.transactionTypeId) === 1
      )
    ), 'secondary-filtered recurring edit preserved canonical Money In fields');

    salaryRule = page.locator('#budgetTable .recurring-rule-card', {
      hasText: 'Monthly salary canonical edit'
    });
    await expect(salaryRule.locator('.grid-summary-type')).toHaveText('Money Out');
    await expect(salaryRule.locator('.recurring-rule-movement'))
      .toHaveText(/Salary Income.*→.*Savings Goal/);
  });

  test('shows stale state and automatically returns projections to current after plan changes', async ({ page }) => {
    await openSectionFilters(page, '#projectionsSection');
    await page.locator('.filter-modal button[title="Refresh projections now"]').click();
    await waitForScenario(page, (scenario) => (
      (scenario.projection?.rows || []).length > 0 &&
      scenario.projection?.stale === false &&
      Boolean(scenario.projection?.generatedAt)
    ), 'initial projection refresh completed');
    await closeFilterModal(page);
    await expect(page.locator('#projectionsSection .projection-freshness')).toHaveText('Current');

    const generatedAt = (await currentScenario(page)).projection.generatedAt;
    await page.evaluate(() => {
      const nativeSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = (callback, delay, ...args) => (
        nativeSetTimeout(callback, delay === 500 ? 1500 : delay, ...args)
      );
      window.__e2eProjectionFreshness = [];
      const capture = () => {
        document.querySelectorAll('.projection-freshness').forEach((element) => {
          window.__e2eProjectionFreshness.push(element.textContent || '');
        });
      };
      capture();
      window.__e2eProjectionObserver = new MutationObserver(capture);
      window.__e2eProjectionObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    });

    await page.locator('#budgetSection .plan-actuals-item', {
      hasText: 'Credit card payment'
    }).locator('button[title="Duplicate item"]').click();
    await expect(page.locator('#budgetSection .plan-actuals-item', {
      hasText: 'Credit card payment'
    })).toHaveCount(2);

    const groceriesCard = page.locator('#budgetSection .plan-actuals-item', {
      hasText: 'Groceries'
    }).first();
    await groceriesCard.locator('button[title="Edit item"]').click();
    const groceriesForm = groceriesCard.locator('form');
    await expect(groceriesForm).toBeVisible();
    await editorField(groceriesForm, 'Description').locator('input')
      .fill('Unsaved editor survives projection completion');

    await expect.poll(() => page.evaluate(() => (
      window.__e2eProjectionFreshness.some((value) => value.includes('Stale'))
    )), { message: 'stale freshness state was displayed' }).toBe(true);

    await waitForScenario(page, (scenario) => (
      scenario.projection?.stale === false &&
      Boolean(scenario.projection?.generatedAt) &&
      scenario.projection.generatedAt !== generatedAt
    ), 'automatic projection refresh completed');
    await expect(page.locator('#projectionsSection .projection-freshness')).toHaveText('Current');
    await expect(groceriesForm).toBeVisible();
    await expect(editorField(groceriesForm, 'Description').locator('input'))
      .toHaveValue('Unsaved editor survives projection completion');
  });

  test('Set projection period refreshes Plan and Projection period bounds together', async ({ page }) => {
    await page.locator(
      '#projectionsSection button.card-inline-action[title="Set projection period"]'
    ).click();
    await page.locator('#timeframe-start-date').fill('2026-03-01');
    await page.locator('#timeframe-end-date').fill('2026-04-30');
    await page.locator('#timeframe-period-type').selectOption('3');
    await page.locator('#timeframe-confirm-btn').click();

    await waitForScenario(page, (scenario) => (
      scenario.projection?.config?.startDate === '2026-03-01' &&
      scenario.projection?.config?.endDate === '2026-04-30' &&
      (scenario.projection?.rows || []).length > 0 &&
      (scenario.projection?.rows || []).every(
        (row) => row.date >= '2026-03-01' && row.date <= '2026-04-30'
      )
    ), 'projection window and rows moved to March-April');

    await expect(page.locator('#plan-period-inline option')).toHaveText([
      'March 2026',
      'April 2026'
    ]);
    await expect(page.locator('#projections-period-select-inline option')).toHaveText([
      'All',
      'March 2026',
      'April 2026'
    ]);
    await expect(page.locator('#projectionsSection .grid-summary-date')).not.toHaveCount(0);
    const renderedDates = await page.locator(
      '#projectionsSection .grid-summary-date'
    ).allTextContents();
    expect(renderedDates.every(
      (date) => date >= '2026-03-01' && date <= '2026-04-30'
    )).toBe(true);
  });
});

test.describe('persisted projection freshness', () => {
  test('automatically rebuilds a stale projection after a full app restart', async ({ page }) => {
    const appData = loadSmokeData();
    const staleGeneratedAt = '2025-12-31T12:00:00.000Z';
    appData.scenarios[0].projection = {
      ...appData.scenarios[0].projection,
      rows: [
        {
          period: '2026-01',
          accountId: 1,
          startBalance: 1200,
          totalIn: 0,
          totalOut: 0,
          endBalance: 1200
        }
      ],
      generatedAt: staleGeneratedAt,
      stale: true,
      staleAt: '2026-01-01T00:00:00.000Z',
      staleReason: 'Persisted plan edit before restart'
    };

    await gotoFTrack(page, appData);
    await selectWorkflow(page, 'General');
    await page.getByRole('tab', { name: 'Period', exact: true }).click();
    await waitForScenario(page, (scenario) => (
      scenario.projection?.stale === false &&
      !scenario.projection?.staleAt &&
      Boolean(scenario.projection?.generatedAt) &&
      scenario.projection.generatedAt !== staleGeneratedAt &&
      (scenario.projection?.rows || []).length > 0
    ), 'persisted stale projection automatically rebuilt after restart');

    await expect(page.locator('#projectionsSection .projection-freshness')).toHaveText('Current');
  });
});

test.describe('recurring split rule editing', () => {
  test('creates a recurring split set from the unified Recurring card', async ({ page }) => {
    await gotoFTrack(page);
    await selectWorkflow(page, 'General');
    await page.getByRole('tab', { name: 'Recurring', exact: true }).click();

    const createSplitButton = page.locator(
      '#budgetSection button[title="Create recurring split rule"]'
    );
    await expect(createSplitButton).toBeVisible();
    await createSplitButton.click();

    const draftCard = page.locator(
      '#budgetTable .recurring-rule-card[data-split-role="principal"]'
    ).last();
    await expect(draftCard).toHaveCount(1);
    await expect(draftCard).toHaveAttribute('data-split-role', 'principal');
    const groupId = await draftCard.getAttribute('data-split-group-id');
    expect(groupId).toBeTruthy();
    const form = draftCard.locator('.grid-summary-form');
    if (!await form.isVisible()) {
      await draftCard.locator('.recurring-rule-description').click();
    }
    await expect(form).toBeVisible();
    await expect(form.locator('.tx-split-inline')).toBeVisible();
    await expect(editorField(form, 'Paying account').locator('select')).toHaveValue('1');
    await editorField(form, 'Paying account').locator('select').selectOption('2');
    await editorField(form, 'Destination account').locator('select').selectOption('3');
    await expect(
      editorField(form, 'Destination account').locator('option[value="2"]')
    ).toBeDisabled();
    await editorField(form, 'Amount').first().locator('input').fill('1000');
    await editorField(form, 'Movement').locator('select').selectOption('2');
    await editorField(form, 'Description').locator('input').fill('Recurring loan split');
    await form.locator('.tx-split-inline-row', {
      hasText: 'Allocation Strategy'
    }).locator('select').selectOption('manual');
    await form.locator('.tx-split-inline-row', {
      hasText: 'Interest Account'
    }).locator('select').selectOption('5');
    await form.locator('.tx-split-inline-cell', {
      hasText: 'Interest Amount'
    }).locator('input').fill('200');
    await expect(
      form.locator('.tx-split-inline-cell', { hasText: 'Principal Amount' }).locator('input')
    ).toHaveValue('800.00');

    await draftCard.locator('.grid-summary-header').evaluate((header) => {
      header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitForScenario(page, (scenario) => {
      const splitSet = scenario.splitTransactionSets.find((set) => set.id === groupId);
      const groupRules = scenario.transactions.filter(
        (transaction) => transaction.transactionGroupId === groupId
      );
      const byRole = new Map(
        (splitSet?.components || []).map((component) => [component.role, component])
      );
      const recurrenceType = Number(
        typeof splitSet?.recurrence?.recurrenceType === 'object'
          ? splitSet.recurrence.recurrenceType.id
          : splitSet?.recurrence?.recurrenceType
      );
      return Number(splitSet?.totalAmount) === 1000 &&
        splitSet?.description === 'Recurring loan split' &&
        recurrenceType === 4 &&
        Number(byRole.get('principal')?.value) === 800 &&
        Number(byRole.get('principal')?.accountId) === 3 &&
        Number(byRole.get('interest')?.value) === 200 &&
        Number(byRole.get('interest')?.accountId) === 5 &&
        groupRules.length === 2 &&
        groupRules.every((rule) => (
          Number(rule.primaryAccountId) === 2 &&
          Number(
            typeof rule.recurrence?.recurrenceType === 'object'
              ? rule.recurrence.recurrenceType.id
              : rule.recurrence?.recurrenceType
          ) === 4
        ));
    }, 'recurring split set and component rules persisted');

    await expect(page.locator(
      `#budgetTable .recurring-rule-card[data-split-group-id="${groupId}"]`
    )).toHaveCount(1);

    await page.getByRole('tab', { name: 'Period', exact: true }).click();
    await expect(page.locator('#budgetSection .plan-actuals-item', {
      hasText: 'Recurring loan split'
    })).toHaveCount(1);
    await expect(page.locator('#budgetSection .plan-actuals-item', {
      hasText: 'Interest'
    })).toHaveCount(1);
    await waitForScenario(page, (scenario) => {
      const januarySavings = (scenario.projection?.rows || []).find(
        (row) => Number(row.accountId) === 2 && row.date === '2026-01-01'
      );
      return scenario.projection?.stale === false &&
        Number(januarySavings?.expenses) === 1000;
    }, 'new recurring split appeared in period occurrences and projections');
  });

  test('discards an abandoned recurring split draft without leaving grouped rules', async ({ page }) => {
    await gotoFTrack(page);
    await selectWorkflow(page, 'General');
    await page.getByRole('tab', { name: 'Recurring', exact: true }).click();

    await page.locator(
      '#budgetSection button[title="Create recurring split rule"]'
    ).click();
    const draftCard = page.locator(
      '#budgetTable .recurring-rule-card[data-split-role="principal"]'
    ).last();
    const groupId = await draftCard.getAttribute('data-split-group-id');
    expect(groupId).toBeTruthy();
    await waitForScenario(page, (scenario) => scenario.transactions.some(
      (rule) => rule.transactionGroupId === groupId
    ), 'recurring split draft persisted');

    await draftCard.locator('button[title="Discard recurring split draft"]').click();
    await expect(page.locator('.confirm-dialog-message')).toContainText(
      'Discard this unsaved recurring split draft'
    );
    await confirmDialog(page);

    await waitForScenario(page, (scenario) => (
      !scenario.transactions.some(
        (rule) => rule.transactionGroupId === groupId
      ) &&
      !scenario.splitTransactionSets.some(
        (set) => set.id === groupId
      )
    ), 'abandoned recurring split draft removed atomically');
    await expect(page.locator(
      `#budgetTable .recurring-rule-card[data-split-group-id="${groupId}"]`
    )).toHaveCount(0);
  });

  test('uses one principal card and safely applies Future then Entire Series split edits', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-08-02T12:00:00Z'));
    await gotoFTrack(page, buildRecurringSplitAppData());
    await selectWorkflow(page, 'General');
    await page.getByRole('tab', { name: 'Recurring', exact: true }).click();

    const splitCards = page.locator(
      '#budgetTable .recurring-rule-card[data-split-group-id="loan-payment"]'
    );
    await expect(splitCards).toHaveCount(1);
    const principalCard = splitCards.first();
    await expect(principalCard).toHaveAttribute('data-source-transaction-id', '1011');
    await expect(principalCard).toHaveAttribute('data-split-role', 'principal');
    await expect(page.locator(
      '#budgetTable .recurring-rule-card[data-source-transaction-id="1012"]'
    )).toHaveCount(0);
    await expect(page.locator(
      '#budgetTable .recurring-rule-card[data-source-transaction-id="1013"]'
    )).toHaveCount(0);

    await openSectionFilters(page, '#budgetSection');
    await page.locator('.filter-modal #tx-split-role-filter-summary').selectOption('interest');
    await expect(page.locator(
      '#budgetTable .recurring-rule-card[data-split-group-id="loan-payment"]'
    )).toHaveCount(1);
    const interestRoleCard = page.locator(
      '#budgetTable .recurring-rule-card[data-split-group-id="loan-payment"]'
    );
    await expect(interestRoleCard).toHaveAttribute('data-split-role', 'interest');
    await expect(interestRoleCard.locator('.grid-summary-type')).toHaveText('Money Out');
    await expect(interestRoleCard.locator('.recurring-rule-movement'))
      .toHaveText(/Checking.*→.*Loan Interest Expense/);
    await expect(interestRoleCard.locator('.grid-summary-amount')).toContainText('150');
    const interestOutMetric = page.locator(
      '#budgetTable #transactionsContent .total-metric',
      { has: page.locator('.label', { hasText: /^Interest Out$/ }) }
    );
    await expect(interestOutMetric.locator('.value')).toContainText('150');
    await page.locator('.filter-modal #tx-split-role-filter-summary').selectOption('');
    await closeFilterModal(page);
    await openSectionFilters(page, '#budgetSection');
    await page.locator('.filter-modal #tx-account-filter-select').selectOption('7');
    await closeFilterModal(page);
    const interestAccountCard = page.locator(
      '#budgetTable .recurring-rule-card[data-split-group-id="loan-payment"]'
    );
    await expect(interestAccountCard).toHaveCount(1);
    await expect(interestAccountCard).toHaveAttribute('data-split-role', 'interest');
    await expect(interestAccountCard.locator('.grid-summary-type')).toHaveText('Money In');
    await expect(interestAccountCard.locator('.recurring-rule-movement'))
      .toHaveText(/Checking.*→.*Loan Interest Expense/);
    await expect(interestAccountCard.locator('.grid-summary-amount')).toContainText('150');
    const interestInMetric = page.locator(
      '#budgetTable #transactionsContent .total-metric',
      { has: page.locator('.label', { hasText: /^Interest In$/ }) }
    );
    await expect(interestInMetric.locator('.value')).toContainText('150');
    await openSectionFilters(page, '#budgetSection');
    await page.locator('.filter-modal #tx-account-filter-select').selectOption('');
    await closeFilterModal(page);

    await principalCard.locator('.recurring-rule-description').click();
    let form = principalCard.locator('.grid-summary-form');
    await expect(form).toBeVisible();
    await expect(form.locator('.tx-split-inline')).toBeVisible();
    await expect(editorField(form, 'Amount').first().locator('input')).toHaveValue('1000');
    await expect(
      form.locator('.tx-split-inline-cell', { hasText: 'Principal Amount' }).locator('input')
    ).toHaveValue('800.00');
    await expect(
      form.locator('.tx-split-inline-cell', { hasText: 'Interest Amount' }).locator('input')
    ).toHaveValue('150.00');
    await expect(form.locator('.tx-split-inline')).toContainText('preserved components 50.00');

    await editorField(form, 'Amount').first().locator('input').fill('1200');
    await form.locator('.tx-split-inline-cell', {
      hasText: 'Interest Amount'
    }).locator('input').fill('200');
    await editorField(form, 'Description').locator('input').fill('Loan payment from August');
    await editorField(form, 'Apply change to').locator('select').selectOption('future');
    await expect(
      form.locator('.tx-split-inline-cell', { hasText: 'Principal Amount' }).locator('input')
    ).toHaveValue('950.00');

    await principalCard.locator('.grid-summary-header').evaluate((header) => {
      header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    let replacementGroupId = null;
    await waitForScenario(page, (scenario) => {
      const actual = scenario.transactionOccurrences.find(
        (occurrence) => occurrence.occurrenceKey ===
          'tx:1011|date:2026-01-15|role:principal'
      );
      const oldSet = scenario.splitTransactionSets.find((set) => set.id === 'loan-payment');
      const replacement = scenario.splitTransactionSets.find(
        (set) => set.id !== 'loan-payment' && set.supersedesTransactionGroupId === 'loan-payment'
      );
      const byRole = new Map(
        (replacement?.components || []).map((component) => [component.role, component])
      );
      if (
        actual?.status === 'actual' &&
        Number(actual.actualAmount) === 805 &&
        Number(actual.baselineAmount) === 800 &&
        actual.actualDate === '2026-01-16' &&
        actual.sourceTransactionId === 1011 &&
        actual.transactionGroupId === 'loan-payment' &&
        oldSet?.activeTo === '2026-08-14' &&
        oldSet?.recurrence?.endDate === '2026-08-14' &&
        Number(oldSet.totalAmount) === 1000 &&
        Number(byRole.get('principal')?.value) === 950 &&
        Number(byRole.get('interest')?.value) === 200 &&
        Number(byRole.get('insurance')?.value) === 50 &&
        Number(byRole.get('insurance')?.accountId) === 5 &&
        Number(replacement?.totalAmount) === 1200 &&
        replacement?.activeFrom === '2026-08-15'
      ) {
        replacementGroupId = replacement.id;
        return true;
      }
      return false;
    }, 'future split edit segmented the group without rewriting actual history');
    expect(replacementGroupId).toBeTruthy();

    const replacementCard = page.locator(
      `#budgetTable .recurring-rule-card[data-split-group-id="${replacementGroupId}"]`
    );
    await expect(replacementCard).toHaveCount(1);
    await replacementCard.locator('.recurring-rule-description').click();
    form = replacementCard.locator('.grid-summary-form');
    await expect(form).toBeVisible();
    await editorField(form, 'Amount').first().locator('input').fill('1300');
    await form.locator('.tx-split-inline-cell', {
      hasText: 'Interest Amount'
    }).locator('input').fill('250');
    await editorField(form, 'Description').locator('input').fill('Loan payment current series');
    await editorField(form, 'Apply change to').locator('select').selectOption('series');
    await expect(
      form.locator('.tx-split-inline-cell', { hasText: 'Principal Amount' }).locator('input')
    ).toHaveValue('1000.00');

    await replacementCard.locator('.grid-summary-header').evaluate((header) => {
      header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitForScenario(page, (scenario) => {
      const actual = scenario.transactionOccurrences.find(
        (occurrence) => occurrence.occurrenceKey ===
          'tx:1011|date:2026-01-15|role:principal'
      );
      const oldSet = scenario.splitTransactionSets.find((set) => set.id === 'loan-payment');
      const replacement = scenario.splitTransactionSets.find(
        (set) => set.id === replacementGroupId
      );
      const byRole = new Map(
        (replacement?.components || []).map((component) => [component.role, component])
      );
      const replacementRules = scenario.transactions.filter(
        (transaction) => transaction.transactionGroupId === replacementGroupId
      );
      const augustChecking = (scenario.projection?.rows || []).find(
        (row) => Number(row.accountId) === 1 && row.date === '2026-08-01'
      );
      return actual?.status === 'actual' &&
        Number(actual.actualAmount) === 805 &&
        Number(actual.baselineAmount) === 800 &&
        actual.actualDate === '2026-01-16' &&
        actual.sourceTransactionId === 1011 &&
        actual.transactionGroupId === 'loan-payment' &&
        oldSet?.activeTo === '2026-08-14' &&
        Number(oldSet.totalAmount) === 1000 &&
        replacement?.id === replacementGroupId &&
        Number(replacement?.totalAmount) === 1300 &&
        Number(byRole.get('principal')?.value) === 1000 &&
        Number(byRole.get('interest')?.value) === 250 &&
        Number(byRole.get('insurance')?.value) === 50 &&
        Number(byRole.get('insurance')?.accountId) === 5 &&
        replacementRules.length === 3 &&
        replacementRules.some(
          (rule) => rule.transactionGroupRole === 'insurance' && Number(rule.amount) === 50
        ) &&
        scenario.projection?.stale === false &&
        Number(augustChecking?.expenses) === 2000;
    }, 'entire-series split edit preserved history, group identity, extra roles, and projection totals');
  });

  test('duplicates a whole split set and ends the source series without deleting history', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-08-02T12:00:00Z'));
    await gotoFTrack(page, buildRecurringSplitAppData());
    await selectWorkflow(page, 'General');
    await page.getByRole('tab', { name: 'Recurring', exact: true }).click();

    const sourceCard = page.locator(
      '#budgetTable .recurring-rule-card[data-split-group-id="loan-payment"]'
    );
    await sourceCard.locator('button[title="Duplicate recurring split rule"]').click();

    let copyGroupId = null;
    await waitForScenario(page, (scenario) => {
      const copySet = scenario.splitTransactionSets.find(
        (set) => set.id !== 'loan-payment' && set.description === 'Loan payment copy'
      );
      const copyRules = scenario.transactions.filter(
        (rule) => rule.transactionGroupId === copySet?.id
      );
      if (
        Number(copySet?.totalAmount) === 1000 &&
        copySet?.components?.length === 3 &&
        copyRules.length === 3 &&
        copyRules.every((rule) => !rule.seriesRootId && !rule.supersedesTransactionId)
      ) {
        copyGroupId = copySet.id;
        return true;
      }
      return false;
    }, 'whole recurring split set duplicated');
    expect(copyGroupId).toBeTruthy();
    await expect(page.locator(
      `#budgetTable .recurring-rule-card[data-split-group-id="${copyGroupId}"]`
    )).toHaveCount(1);

    await sourceCard.locator('button[title="End recurring series"]').click();
    await expect(page.locator('.confirm-dialog-message')).toContainText(
      'Past actuals, skipped items, and frozen baselines will be preserved'
    );
    await confirmDialog(page);

    await waitForScenario(page, (scenario) => {
      const actual = scenario.transactionOccurrences.find(
        (occurrence) => occurrence.occurrenceKey ===
          'tx:1011|date:2026-01-15|role:principal'
      );
      const sourceSet = scenario.splitTransactionSets.find(
        (set) => set.id === 'loan-payment'
      );
      const sourceRules = scenario.transactions.filter(
        (rule) => rule.transactionGroupId === 'loan-payment'
      );
      const copySet = scenario.splitTransactionSets.find(
        (set) => set.id === copyGroupId
      );
      return actual?.status === 'actual' &&
        Number(actual.actualAmount) === 805 &&
        Number(actual.baselineAmount) === 800 &&
        actual.actualDate === '2026-01-16' &&
        actual.sourceTransactionId === 1011 &&
        sourceSet?.activeTo === '2026-08-14' &&
        sourceSet?.recurrence?.endDate === '2026-08-14' &&
        sourceRules.length === 3 &&
        sourceRules.every(
          (rule) => rule.activeTo === '2026-08-14' &&
            rule.recurrence?.endDate === '2026-08-14'
        ) &&
        copySet?.activeTo === null &&
        Number(copySet?.totalAmount) === 1000 &&
        copySet?.components?.length === 3;
    }, 'split series ended while actual history and independent copy remained');
  });
});

test.describe('recurring rule lifecycle actions', () => {
  test('duplicates an independent rule and ends only the copy', async ({ page }) => {
    await gotoFTrack(page);
    await selectWorkflow(page, 'General');
    await page.getByRole('tab', { name: 'Recurring', exact: true }).click();

    const sourceCard = page.locator('#budgetTable .recurring-rule-card', {
      hasText: 'Monthly salary'
    });
    await sourceCard.locator('button[title="Duplicate recurring rule"]').click();
    await waitForScenario(page, (scenario) => scenario.transactions.some(
      (rule) => rule.description === 'Monthly salary copy' &&
        !rule.transactionGroupId &&
        !rule.seriesRootId &&
        !rule.supersedesTransactionId
    ), 'independent recurring rule copy persisted');

    const copyCard = page.locator('#budgetTable .recurring-rule-card', {
      hasText: 'Monthly salary copy'
    });
    await expect(copyCard).toHaveCount(1);
    await copyCard.locator('button[title="End recurring series"]').click();
    await confirmDialog(page);

    await waitForScenario(page, (scenario) => {
      const source = scenario.transactions.find((rule) => Number(rule.id) === 1001);
      const copy = scenario.transactions.find(
        (rule) => rule.description === 'Monthly salary copy'
      );
      return !source?.activeTo &&
        !source?.recurrence?.endDate &&
        Boolean(copy?.activeTo) &&
        copy.activeTo === copy.recurrence?.endDate;
    }, 'only the duplicated recurring rule was ended');
  });

  test('shows protected-history feedback and leaves the recurring series unchanged', async ({ page }) => {
    const appData = loadSmokeData();
    appData.scenarios[0].transactionOccurrences.push({
      id: 2999,
      sourceTransactionId: 1001,
      occurrenceKey: 'tx:1001|date:2099-09-25|role:none',
      scheduledDate: '2099-09-25',
      plannedDate: null,
      actualDate: '2099-09-25',
      baselineAmount: 3000,
      plannedAmount: 3000,
      actualAmount: 3000,
      status: 'actual',
      origin: 'generated',
      isOverride: true,
      primaryAccountId: 1,
      secondaryAccountId: 4,
      transactionTypeId: 1,
      description: 'Protected future salary',
      tags: ['income'],
      transactionGroupId: null,
      transactionGroupRole: null,
      transactionGroupAccountGroupId: null,
      capitalAmount: null,
      interestAmount: null,
      recurrence: {
        recurrenceType: 4,
        startDate: '2026-01-25',
        endDate: null,
        interval: 1,
        dayOfMonth: 25
      },
      recurrenceDescription: '',
      periodicChange: null,
      actualSnapshotVersion: 1,
      baselinePrimaryAccountId: 1,
      baselineSecondaryAccountId: 4,
      baselineTransactionTypeId: 1,
      baselineSnapshotVersion: 1,
      createdAt: null,
      updatedAt: null
    });
    await gotoFTrack(page, appData);
    await selectWorkflow(page, 'General');
    await page.getByRole('tab', { name: 'Recurring', exact: true }).click();

    const salaryCard = page.locator('#budgetTable .recurring-rule-card', {
      hasText: 'Monthly salary'
    });
    await salaryCard.locator('button[title="End recurring series"]').click();
    await confirmDialog(page);
    await expect(page.locator('.notify-toast-error')).toContainText(
      'cannot end before actual, skipped, or frozen occurrence history'
    );

    await waitForScenario(page, (scenario) => {
      const source = scenario.transactions.find(
        (rule) => Number(rule.id) === 1001
      );
      const protectedActual = scenario.transactionOccurrences.find(
        (occurrence) =>
          occurrence.occurrenceKey ===
            'tx:1001|date:2099-09-25|role:none'
      );
      return !source?.activeTo &&
        !source?.recurrence?.endDate &&
        protectedActual?.status === 'actual' &&
        Number(protectedActual.actualAmount) === 3000;
    }, 'protected future occurrence prevented any series mutation');
  });
});

test.describe('one-time linked plan items', () => {
  test('keeps a linked one-time occurrence occurrence-scoped', async ({ page }) => {
    const appData = loadSmokeData();
    appData.scenarios[0].transactions.push({
      id: 1010,
      primaryAccountId: 1,
      secondaryAccountId: 5,
      transactionTypeId: 2,
      amount: 80,
      effectiveDate: '2026-01-18',
      description: 'Annual filing fee',
      recurrence: {
        recurrenceType: 1,
        startDate: '2026-01-18',
        endDate: null,
        interval: 1
      },
      periodicChange: null,
      tags: ['annual']
    });

    await gotoFTrack(page, appData);
    await selectWorkflow(page, 'General');
    await page.getByRole('tab', { name: 'Period', exact: true }).click();
    const card = page.locator('#budgetSection .plan-actuals-item', {
      hasText: 'Annual filing fee'
    });
    await card.locator('button[title="Edit item"]').click();
    const form = card.locator('form');
    await expect(editorField(form, 'Repeat').locator('button')).toBeDisabled();
    await expect(editorField(form, 'Apply change to')).toHaveCount(0);
    await editorField(form, 'Current plan').locator('input').fill('95');
    await editorField(form, 'Description').locator('input').fill('Annual filing fee adjusted');
    await form.getByRole('button', { name: 'Save' }).click();

    await waitForScenario(page, (scenario) => {
      const source = scenario.transactions.find((transaction) => Number(transaction.id) === 1010);
      const override = scenario.transactionOccurrences.find(
        (occurrence) => Number(occurrence.sourceTransactionId) === 1010
      );
      return Number(source?.amount) === 80 &&
        source?.description === 'Annual filing fee' &&
        Number(override?.plannedAmount) === 95 &&
        override?.description === 'Annual filing fee adjusted';
    }, 'one-time linked edit persisted as an occurrence override');
  });
});
