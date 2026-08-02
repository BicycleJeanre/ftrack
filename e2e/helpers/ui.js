const { expect } = require('@playwright/test');

const WORKFLOW_IDS_BY_NAME = {
  Budget: 'budget',
  General: 'general',
  Funds: 'funds',
  'Debt Repayment': 'debt-repayment',
  'Goal Workshop': 'goal-workshop',
  'Accounts (Detail)': 'accounts-detail',
  'Transactions (Detail)': 'transactions-detail',
  'Plan & Actuals (Detail)': 'budget-detail',
  'Projections (Detail)': 'projections-detail'
};

const WORKFLOW_READY_SELECTORS = {
  'Accounts (Detail)': '#accountsTable .grid-container.grid-detail.tabulator',
  'Transactions (Detail)': '#transactionsTable .grid-container.grid-detail.tabulator',
  'Plan & Actuals (Detail)': '#budgetTable .plan-actuals-grid',
  'Projections (Detail)': '#projectionsContent'
};

async function openSidebar(page) {
  const sidebar = page.locator('.sidebar');
  const isVisible = await sidebar.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 20 && rect.right > 20 && rect.left >= -1;
  });
  if (isVisible) return;

  await page.getByRole('button', { name: 'Menu' }).click();
  await expect.poll(() =>
    sidebar.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 20 && rect.right > 20 && rect.left >= -1;
    })
  ).toBe(true);
}

async function selectWorkflow(page, name) {
  await openSidebar(page);
  const workflow = page.getByRole('button', { name, exact: true });
  await expect(workflow).toHaveCount(1);
  await workflow.click();
  await expect(workflow).toHaveClass(/active/);

  const workflowId = WORKFLOW_IDS_BY_NAME[name];
  if (workflowId) {
    await expect.poll(async () => {
      return page.evaluate(() => {
        const data = JSON.parse(window.localStorage.getItem('ftrack:app-data') || '{}');
        return data?.uiState?.lastWorkflowId || null;
      });
    }, { message: `${name} workflow persisted` }).toBe(workflowId);
  }

  const readySelector = WORKFLOW_READY_SELECTORS[name];
  if (readySelector) {
    await expect(page.locator(readySelector)).toBeVisible();
  }
}

async function openSectionFilters(page, sectionSelector) {
  const section = page.locator(sectionSelector);
  await expect(section).toBeVisible();
  const filterButton = section.locator('button[title="Open filters"]');
  await expect(filterButton).toHaveCount(1);
  await filterButton.click();
  await expect(page.locator('.filter-modal')).toBeVisible();
}

async function closeFilterModal(page) {
  if (await page.locator('.filter-modal').count()) {
    await page.keyboard.press('Escape');
    await expect(page.locator('.filter-modal')).toHaveCount(0);
  }
}

async function confirmDialog(page) {
  const dialog = page.locator('.confirm-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('button[title="Confirm"]').click();
  await expect(dialog).toHaveCount(0);
}

async function expectNoHorizontalOverflow(page, selector = 'body') {
  const overflow = await page.locator(selector).evaluate((root) => {
    const doc = root === document.body ? document.documentElement : root;
    const viewportWidth = window.innerWidth;
    const scrollWidth = Math.max(doc.scrollWidth || 0, root.scrollWidth || 0);
    const offenders = Array.from(document.querySelectorAll(
      '.topbar, .dash-row-header, .dash-panel-header, .filter-modal, .summary-card, .grid-summary-card, .account-card'
    ))
      .filter((el) => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const sidebar = el.closest('.sidebar');
        if (sidebar && !sidebar.classList.contains('open')) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > viewportWidth + 1);
      })
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: el.className || null,
        left: el.getBoundingClientRect().left,
        right: el.getBoundingClientRect().right,
        viewportWidth
      }));

    return {
      viewportWidth,
      scrollWidth,
      overflowBy: scrollWidth - viewportWidth,
      offenders
    };
  });

  expect(overflow, JSON.stringify(overflow, null, 2)).toMatchObject({
    offenders: []
  });
  expect(overflow.overflowBy, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(2);
}

module.exports = {
  openSidebar,
  selectWorkflow,
  openSectionFilters,
  closeFilterModal,
  confirmDialog,
  expectNoHorizontalOverflow
};
