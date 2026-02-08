// forecast-projections-section.js
// Projections section/grid loader extracted from forecast.js (no behavior change).

import { createGrid, createDateColumn, createTextColumn, createMoneyColumn } from '../grid-factory.js';
import { formatDateOnly } from '../date-utils.js';
import { notifyError, notifySuccess } from '../notifications.js';

import * as BudgetManager from '../managers/budget-manager.js';

import { getScenario, getScenarioPeriods } from '../data-manager.js';
import { generateProjections, clearProjections } from '../projection-engine.js';

export async function loadProjectionsSection({
  container,
  scenarioState,
  getScenarioTypeConfig,
  state,
  tables,
  callbacks,
  logger
}) {
  let currentScenario = scenarioState?.get?.();
  if (!currentScenario) return;

  container.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'grid-toolbar';

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'toolbar-item';

  const generateButton = document.createElement('button');
  generateButton.className = 'btn btn-primary';
  generateButton.textContent = 'Generate Projections';
  generateButton.addEventListener('click', async () => {
    try {
      generateButton.textContent = 'Generating...';
      generateButton.disabled = true;

      currentScenario = scenarioState?.get?.();

      await generateProjections(currentScenario.id, {
        periodicity: 'monthly',
        source: 'transactions'
      });

      const refreshed = await getScenario(currentScenario.id);
      scenarioState?.set?.(refreshed);
      currentScenario = refreshed;

      await loadProjectionsSection({
        container,
        scenarioState,
        getScenarioTypeConfig,
        state,
        tables,
        callbacks,
        logger
      });

      const typeConfig = getScenarioTypeConfig?.();
      if (typeConfig?.showSummaryCards) {
        await callbacks?.loadDebtSummaryCards?.(callbacks?.getEl?.('summaryCardsContent'));
      }
    } catch (err) {
      notifyError('Failed to generate projections: ' + err.message);
    } finally {
      generateButton.textContent = 'Generate Projections';
      generateButton.disabled = false;
    }
  });
  window.add(buttonContainer, generateButton);

  const clearButton = document.createElement('button');
  clearButton.className = 'btn';
  clearButton.textContent = 'Clear Projections';
  clearButton.addEventListener('click', async () => {
    try {
      currentScenario = scenarioState?.get?.();

      await clearProjections(currentScenario.id);

      const refreshed = await getScenario(currentScenario.id);
      scenarioState?.set?.(refreshed);

      await loadProjectionsSection({
        container,
        scenarioState,
        getScenarioTypeConfig,
        state,
        tables,
        callbacks,
        logger
      });
    } catch (err) {
      notifyError('Failed to clear projections: ' + err.message);
    }
  });
  window.add(buttonContainer, clearButton);

  const saveBudgetButton = document.createElement('button');
  saveBudgetButton.className = 'btn btn-primary';
  saveBudgetButton.textContent = 'Save as Budget';
  saveBudgetButton.addEventListener('click', async () => {
    try {
      currentScenario = scenarioState?.get?.();

      if (!currentScenario.projections || currentScenario.projections.length === 0) {
        notifyError('No projections to save as budget. Generate projections first.');
        return;
      }

      const confirmed = confirm('Save current projection as Budget? This will replace any existing budget.');
      if (!confirmed) return;

      saveBudgetButton.textContent = 'Saving...';
      saveBudgetButton.disabled = true;

      await BudgetManager.createFromProjections(currentScenario.id, currentScenario.projections);

      const refreshed = await getScenario(currentScenario.id);
      scenarioState?.set?.(refreshed);

      await callbacks?.loadBudgetGrid?.(callbacks?.getEl?.('budgetTable'));

      notifySuccess('Budget saved successfully!');
    } catch (err) {
      notifyError('Failed to save budget: ' + err.message);
    } finally {
      saveBudgetButton.textContent = 'Save as Budget';
      saveBudgetButton.disabled = false;
    }
  });
  window.add(buttonContainer, saveBudgetButton);

  window.add(toolbar, buttonContainer);

  const accountFilter = document.createElement('div');
  accountFilter.className = 'toolbar-item account-filter';
  accountFilter.innerHTML = `
    <label for="projections-account-filter-select" class="text-muted control-label">Account:</label>
    <select id="projections-account-filter-select" class="input-select control-select">
      <option value="">-- All Accounts --</option>
    </select>
  `;
  window.add(toolbar, accountFilter);

  const groupingControl = document.createElement('div');
  groupingControl.className = 'toolbar-item grouping-control';
  groupingControl.innerHTML = `
    <label for="projections-grouping-select" class="text-muted control-label">Group By:</label>
    <select id="projections-grouping-select" class="input-select control-select">
      <option value="">None</option>
      <option value="account">Account</option>
    </select>
  `;
  window.add(toolbar, groupingControl);

  const periodTypeControl = document.createElement('div');
  periodTypeControl.className = 'toolbar-item period-type-control';
  periodTypeControl.innerHTML = `
    <label for="projections-period-type-select" class="text-muted control-label">View By:</label>
    <select id="projections-period-type-select" class="input-select control-select">
      <option value="Day">Day</option>
      <option value="Week">Week</option>
      <option value="Month">Month</option>
      <option value="Quarter">Quarter</option>
      <option value="Year">Year</option>
    </select>
  `;
  window.add(toolbar, periodTypeControl);

  const periodFilter = document.createElement('div');
  periodFilter.className = 'toolbar-item period-filter';
  periodFilter.innerHTML = `
    <label for="projections-period-select" class="text-muted control-label">Period:</label>
    <select id="projections-period-select" class="input-select control-select"></select>
    <button id="projections-prev-period-btn" class="btn btn-ghost control-button" title="Previous Period">&#9664;</button>
    <button id="projections-next-period-btn" class="btn btn-ghost control-button" title="Next Period">&#9654;</button>
  `;
  window.add(toolbar, periodFilter);

  const totalsInline = document.createElement('div');
  totalsInline.className = 'toolbar-item toolbar-totals';
  toolbar.appendChild(totalsInline);

  window.add(container, toolbar);

  const periodTypeSelect = document.getElementById('projections-period-type-select');
  if (periodTypeSelect) {
    periodTypeSelect.value = state?.getProjectionPeriodType?.();
  }

  const projectionPeriodType = state?.getProjectionPeriodType?.();
  const projectionPeriods = await getScenarioPeriods(currentScenario.id, projectionPeriodType);
  state?.setProjectionPeriods?.(projectionPeriods);

  const periodSelect = document.getElementById('projections-period-select');
  if (periodSelect) {
    periodSelect.innerHTML = '<option value="">-- All Periods --</option>';
    projectionPeriods.forEach((period) => {
      const option = document.createElement('option');
      option.value = period.id;
      option.textContent =
        period.label || `${formatDateOnly(period.startDate) || ''} to ${formatDateOnly(period.endDate) || ''}`;
      periodSelect.appendChild(option);
    });

    periodSelect.value = state?.getProjectionPeriod?.() || '';

    periodSelect.addEventListener('change', async (e) => {
      state?.setProjectionPeriod?.(e.target.value);
      await loadProjectionsGrid({
        container: document.getElementById('projectionsGrid'),
        scenarioState,
        state,
        tables,
        callbacks,
        logger
      });
      callbacks?.updateProjectionTotals?.(container);
    });

    document.getElementById('projections-prev-period-btn')?.addEventListener('click', async () => {
      const currentPeriod = state?.getProjectionPeriod?.();
      const currentIndex = projectionPeriods.findIndex((p) => p.id === currentPeriod);
      if (currentIndex > 0) {
        state?.setProjectionPeriod?.(projectionPeriods[currentIndex - 1].id);
        await loadProjectionsGrid({
          container: document.getElementById('projectionsGrid'),
          scenarioState,
          state,
          tables,
          callbacks,
          logger
        });
        callbacks?.updateProjectionTotals?.(container);
      }
    });

    document.getElementById('projections-next-period-btn')?.addEventListener('click', async () => {
      const currentPeriod = state?.getProjectionPeriod?.();
      const currentIndex = projectionPeriods.findIndex((p) => p.id === currentPeriod);
      if (currentIndex >= 0 && currentIndex < projectionPeriods.length - 1) {
        state?.setProjectionPeriod?.(projectionPeriods[currentIndex + 1].id);
        await loadProjectionsGrid({
          container: document.getElementById('projectionsGrid'),
          scenarioState,
          state,
          tables,
          callbacks,
          logger
        });
        callbacks?.updateProjectionTotals?.(container);
      }
    });

    document.getElementById('projections-period-type-select')?.addEventListener('change', async (e) => {
      state?.setProjectionPeriodType?.(e.target.value);
      state?.setProjectionPeriod?.(null);
      await loadProjectionsSection({
        container,
        scenarioState,
        getScenarioTypeConfig,
        state,
        tables,
        callbacks,
        logger
      });
    });
  }

  const projectionsAccountFilterSelect = document.getElementById('projections-account-filter-select');
  if (projectionsAccountFilterSelect) {
    (currentScenario.accounts || []).forEach((account) => {
      const option = document.createElement('option');
      option.value = account.id;
      option.textContent = account.name;
      projectionsAccountFilterSelect.appendChild(option);
    });

    const firstAccountId = currentScenario.accounts?.[0]?.id;
    const currentTxFilter = state?.getTransactionFilterAccountId?.();

    projectionsAccountFilterSelect.value = currentTxFilter || firstAccountId || '';

    if (!currentTxFilter && firstAccountId) {
      state?.setTransactionFilterAccountId?.(firstAccountId);
    }

    projectionsAccountFilterSelect.addEventListener('change', async (e) => {
      const nextId = e.target.value ? Number(e.target.value) : null;
      state?.setTransactionFilterAccountId?.(nextId);

      const masterTransactionsTable = tables?.getMasterTransactionsTable?.();
      if (masterTransactionsTable) {
        if (nextId) {
          masterTransactionsTable.setFilter((data) => {
            if (!data.perspectiveAccountId) return true;
            return Number(data.perspectiveAccountId) === nextId;
          });
        } else {
          masterTransactionsTable.setFilter((data) => {
            return !String(data.id).includes('_flipped');
          });
        }
        callbacks?.updateTransactionTotals?.();
      }

      const masterBudgetTable = tables?.getMasterBudgetTable?.();
      if (masterBudgetTable) {
        if (nextId) {
          masterBudgetTable.setFilter((data) => {
            if (!data.perspectiveAccountId) return true;
            return Number(data.perspectiveAccountId) === nextId;
          });
        } else {
          masterBudgetTable.setFilter((data) => {
            return !String(data.id).includes('_flipped');
          });
        }
        callbacks?.updateBudgetTotals?.();
      }

      const gridContainer = document.getElementById('projectionsGrid');
      if (gridContainer) {
        await loadProjectionsGrid({
          container: gridContainer,
          scenarioState,
          state,
          tables,
          callbacks,
          logger
        });
        callbacks?.updateProjectionTotals?.(container);
      }
    });
  }

  const projectionsGridContainer = document.createElement('div');
  projectionsGridContainer.id = 'projectionsGrid';
  projectionsGridContainer.className = 'grid-container projections-grid';
  window.add(container, projectionsGridContainer);

  await loadProjectionsGrid({
    container: projectionsGridContainer,
    scenarioState,
    state,
    tables,
    callbacks,
    logger
  });
}

export async function loadProjectionsGrid({ container, scenarioState, state, tables, callbacks, logger }) {
  const currentScenario = scenarioState?.get?.();
  if (!currentScenario) return;

  container.innerHTML = '';

  try {
    const filteredProjections = callbacks?.getFilteredProjections?.();

    const accountMap = new Map((currentScenario.accounts || []).map((a) => [a.id, a]));

    const transformedData = (filteredProjections || []).map((p) => ({
      date: p.date,
      account: accountMap.get(p.accountId)?.name || '',
      balance: p.balance || 0,
      income: p.income || 0,
      expenses: -Math.abs(p.expenses || 0),
      netChange: p.netChange || 0
    }));

    const projectionsTable = await createGrid(container, {
      data: transformedData,
      layout: 'fitColumns',
      columns: [
        createDateColumn('Date', 'date', { widthGrow: 1 }),
        createTextColumn('Account', 'account', { widthGrow: 2 }),
        createMoneyColumn('Projected Balance', 'balance', { widthGrow: 2 }),
        createMoneyColumn('Projected Income', 'income', { widthGrow: 2 }),
        createMoneyColumn('Projected Expenses', 'expenses', { widthGrow: 2 }),
        {
          title: 'Net Change',
          field: 'netChange',
          widthGrow: 2,
          formatter: function (cell) {
            const value = cell.getValue();
            const formatted = new Intl.NumberFormat('en-ZA', {
              style: 'currency',
              currency: 'ZAR',
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }).format(value);

            const cls = value >= 0 ? 'status-netchange positive' : 'status-netchange negative';
            return `<span class="${cls}">${formatted}</span>`;
          },
          headerHozAlign: 'right',
          hozAlign: 'right'
        }
      ]
    });

    const projectionsGroupingSelect = document.getElementById('projections-grouping-select');
    if (projectionsGroupingSelect) {
      const formatGroupLabel = (val) => {
        if (val === null || val === undefined || val === '') return 'Unspecified';
        if (typeof val === 'object') return val.name || val.label || val.description || 'Unspecified';
        return String(val);
      };

      projectionsGroupingSelect.addEventListener('change', (e) => {
        const groupField = e.target.value;
        if (groupField) {
          projectionsTable.setGroupBy(groupField);
          projectionsTable.setGroupHeader((value, count, data, group) => {
            const totalBalance = data.reduce((sum, row) => sum + Number(row.balance || 0), 0);
            const label = formatGroupLabel(value);
            const formatted = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(totalBalance);
            return `${label} (${count} periods, Total Balance: ${formatted})`;
          });
        } else {
          projectionsTable.setGroupBy(false);
        }
      });
    }

    callbacks?.updateProjectionTotals?.(callbacks?.getEl?.('projectionsContent'), filteredProjections);
  } catch (err) {
    logger?.error?.('[Forecast] loadProjectionsGrid failed', err);
  }
}
