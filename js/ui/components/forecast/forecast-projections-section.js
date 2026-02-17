// forecast-projections-section.js
// Projections section/grid loader extracted from forecast.js (no behavior change).

import { createGrid, refreshGridData, createDateColumn, createTextColumn, createMoneyColumn, formatMoneyDisplay } from '../grids/grid-factory.js';
import { formatDateOnly, parseDateOnly } from '../../../shared/date-utils.js';
import { notifyError, notifySuccess } from '../../../shared/notifications.js';
import { loadLookup } from '../../../app/services/lookup-service.js';
import { GridStateManager } from '../grids/grid-state.js';

import { getScenario, getScenarioPeriods } from '../../../app/services/data-service.js';
import { generateProjections, clearProjections } from '../../../domain/calculations/projection-engine.js';

import { expandTransactions } from '../../../domain/calculations/transaction-expander.js';
import { calculatePeriodicChange } from '../../../domain/calculations/calculation-engine.js';
import { expandPeriodicChangeForCalculation } from '../../../domain/calculations/periodic-change-utils.js';

const projectionsGridState = new GridStateManager('projections');
let lastProjectionsTable = null;

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

  try {
    projectionsGridState.capture(lastProjectionsTable, {
      groupBy: '#projections-grouping-select',
      account: '#projections-account-filter-select'
    });
  } catch (_) {
    // ignore
  }

  // Keep the grid container stable to reduce scroll jumps.
  const existingToolbars = container.querySelectorAll(':scope > .grid-toolbar');
  existingToolbars.forEach((el) => el.remove());

  let projectionsGridContainer = container.querySelector('#projectionsGrid');
  if (!projectionsGridContainer) {
    projectionsGridContainer = document.createElement('div');
    projectionsGridContainer.id = 'projectionsGrid';
    projectionsGridContainer.className = 'grid-container projections-grid';
    window.add(container, projectionsGridContainer);
  }

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
        await callbacks?.loadSummaryCards?.(callbacks?.getEl?.('summaryCardsContent'));
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
      <option value="accountType">Account Type</option>
      <option value="secondaryAccount">Secondary Account</option>
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

  // Insert toolbar above the grid so it doesn't jump to the bottom on refresh.
  container.insertBefore(toolbar, projectionsGridContainer);

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
    const currentProjectionAccountFilter = state?.getProjectionAccountFilterId?.();

    const isValidAccountId = (id) => (currentScenario.accounts || []).some((a) => Number(a.id) === Number(id));
    const initialAccountId = isValidAccountId(currentProjectionAccountFilter)
      ? currentProjectionAccountFilter
      : (firstAccountId || null);

    projectionsAccountFilterSelect.value = initialAccountId || '';

    if (!isValidAccountId(currentProjectionAccountFilter)) {
      state?.setProjectionAccountFilterId?.(initialAccountId);
    }

    projectionsAccountFilterSelect.addEventListener('change', async (e) => {
      const nextId = e.target.value ? Number(e.target.value) : null;
      state?.setProjectionAccountFilterId?.(nextId);

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

  await loadProjectionsGrid({
    container: projectionsGridContainer,
    scenarioState,
    state,
    tables,
    callbacks,
    logger
  });

  try {
    projectionsGridState.restore(lastProjectionsTable, { restoreGroupBy: false });
    projectionsGridState.restoreDropdowns({
      groupBy: '#projections-grouping-select',
      account: '#projections-account-filter-select'
    }, { dispatchChange: false });

    const projectionsAccountFilterSelect = document.getElementById('projections-account-filter-select');
    if (projectionsAccountFilterSelect) {
      const nextId = projectionsAccountFilterSelect.value ? Number(projectionsAccountFilterSelect.value) : null;
      state?.setProjectionAccountFilterId?.(nextId);
    }
  } catch (_) {
    // ignore
  }
}

export async function loadProjectionsGrid({ container, scenarioState, state, tables, callbacks, logger }) {
  const currentScenario = scenarioState?.get?.();
  if (!currentScenario) return;

  // Keep the grid container stable to reduce scroll jumps.
  // (We refresh Tabulator data instead of rebuilding DOM.)

  try {
    const filteredProjections = callbacks?.getFilteredProjections?.();

    const projectionsGroupingSelect = document.getElementById('projections-grouping-select');
    const groupField = projectionsGroupingSelect?.value || '';
    const isCounterpartyMode = groupField === 'secondaryAccount';
    const groupFieldAtBuildTime = groupField;
    const isCounterpartyModeAtBuildTime = isCounterpartyMode;

    const getId = (value) => (typeof value === 'object' ? value?.id : value);
    const getStatusName = (record) => (typeof record?.status === 'object' ? record?.status?.name : record?.status);

    const lookupData = await loadLookup('lookup-data.json');
    const accountTypeIdToName = new Map((lookupData?.accountTypes || []).map((t) => [Number(t.id), String(t.name || '')]));

    const accountMap = new Map((currentScenario.accounts || []).map((a) => [a.id, a]));

    const normalizeDateOnly = (value) => {
      if (!value) return null;
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const d = new Date(value);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      if (typeof value === 'string') return parseDateOnly(value);
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const formatDateKey = (dateValue) => {
      if (!dateValue) return '';
      if (typeof dateValue === 'string') return dateValue;
      const d = new Date(dateValue);
      if (Number.isNaN(d.getTime())) return String(dateValue);
      return formatDateOnly(d);
    };

    const projectionPeriods = state?.getProjectionPeriods?.() || [];
    const normalizedPeriods = (projectionPeriods || [])
      .map((p) => {
        const start = normalizeDateOnly(p?.startDate);
        const end = normalizeDateOnly(p?.endDate);
        if (!start || !end) return null;
        return {
          ...p,
          _start: start,
          _end: end,
          _labelDate: formatDateOnly(start)
        };
      })
      .filter(Boolean);

    const findPeriodLabelForDate = (dateObj) => {
      if (!dateObj) return null;
      for (const period of normalizedPeriods) {
        if (dateObj >= period._start && dateObj <= period._end) return period._labelDate;
      }
      return null;
    };

    const round2 = (value) => {
      const rounded = Math.round(Number(value || 0) * 100) / 100;
      return Object.is(rounded, -0) ? 0 : rounded;
    };

    const formatCurrency = (value) => {
      const safe = round2(value);
      return new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(safe);
    };

    const formatBalanceHtml = (value) => {
      return formatMoneyDisplay(round2(value));
    };

    const formatNetChangeHtml = (value) => {
      return formatMoneyDisplay(round2(value));
    };

    const buildAccountLevelRows = () => {
      return (filteredProjections || []).map((p) => {
        const account = accountMap.get(p.accountId) || null;
        const accountTypeId = typeof account?.type === 'object' ? Number(account?.type?.id) : Number(account?.type);
        const accountType = accountTypeIdToName.get(accountTypeId) || '';

        return {
          date: p.date,
          account: account?.name || '',
          accountType,
          balance: p.balance || 0,
          income: p.income || 0,
          expenses: -Math.abs(p.expenses || 0),
          netChange: p.netChange || 0
        };
      });
    };

    const buildCounterpartyRowsForSelectedAccount = () => {
      const selectedAccountId = state?.getProjectionAccountFilterId?.();
      if (!selectedAccountId) {
        notifyError('Select an Account to group by Secondary Account.');
        return [];
      }

      const selectedAccountProjections = (filteredProjections || []).filter((p) => Number(p.accountId) === Number(selectedAccountId));
      const allowedPeriodLabels = new Set(selectedAccountProjections.map((p) => String(p.date || '')));
      const balanceByPeriodLabel = new Map(selectedAccountProjections.map((p) => [String(p.date || ''), Number(p.balance || 0)]));
      const interestByPeriodLabel = new Map(selectedAccountProjections.map((p) => [String(p.date || ''), Number(p.interest || 0)]));

      const plannedTransactions = (currentScenario.transactions || []).filter((tx) => getStatusName(tx) === 'planned');
      const startDate = normalizeDateOnly(currentScenario.startDate);
      const endDate = normalizeDateOnly(currentScenario.endDate);
      const accounts = currentScenario.accounts || [];

      if (!startDate || !endDate) {
        notifyError('Scenario start/end dates are missing or invalid.');
        return [];
      }

      const expandedTransactions = expandTransactions(plannedTransactions, startDate, endDate, accounts);

      const transactionOccurrences = expandedTransactions.map((txn) => {
        const occDate = txn._occurrenceDate || normalizeDateOnly(txn.effectiveDate);
        let amount = Number(txn.amount || 0);
        if (txn.periodicChange) {
          const expandedPC = expandPeriodicChangeForCalculation(txn.periodicChange, lookupData);
          if (expandedPC) {
            const txnStartDate = txn.recurrence?.startDate ? normalizeDateOnly(txn.recurrence.startDate) : startDate;
            const yearsDiff = (occDate - txnStartDate) / (1000 * 60 * 60 * 24 * 365.25);
            amount = calculatePeriodicChange(amount, expandedPC, yearsDiff);
          }
        }

        return {
          date: occDate,
          periodLabel: findPeriodLabelForDate(occDate),
          primaryAccountId: txn.primaryAccountId,
          secondaryAccountId: txn.secondaryAccountId,
          transactionTypeId: txn.transactionTypeId,
          amount
        };
      });

      const totalsByKey = new Map();

      const getOrCreate = (periodLabel, secondaryAccount) => {
        const key = `${periodLabel}::${secondaryAccount}`;
        let existing = totalsByKey.get(key);
        if (!existing) {
          existing = {
            date: periodLabel,
            secondaryAccount,
            balance: Number(balanceByPeriodLabel.get(periodLabel) || 0),
            _income: 0,
            _expenses: 0
          };
          totalsByKey.set(key, existing);
        }
        return existing;
      };

      transactionOccurrences.forEach((txn) => {
        const periodLabel = txn.periodLabel;
        if (!periodLabel || !allowedPeriodLabels.has(String(periodLabel))) return;

        const absAmount = Math.abs(Number(txn.amount || 0));
        if (!absAmount) return;

        const isMoneyIn = Number(txn.transactionTypeId) === 1;

        let counterpartyAccountId = null;
        let incomeDelta = 0;
        let expenseDelta = 0;

        if (Number(txn.primaryAccountId) === Number(selectedAccountId)) {
          counterpartyAccountId = txn.secondaryAccountId || null;
          if (isMoneyIn) incomeDelta = absAmount;
          else expenseDelta = absAmount;
        } else if (Number(txn.secondaryAccountId) === Number(selectedAccountId)) {
          counterpartyAccountId = txn.primaryAccountId || null;
          if (isMoneyIn) expenseDelta = absAmount;
          else incomeDelta = absAmount;
        } else {
          return;
        }

        const counterpartyAccount = counterpartyAccountId ? accountMap.get(counterpartyAccountId) : null;
        const secondaryAccount = counterpartyAccount?.name || 'Unassigned';

        const row = getOrCreate(periodLabel, secondaryAccount);
        row._income += incomeDelta;
        row._expenses += expenseDelta;
      });

      // Add periodic-change interest as its own counterparty bucket so totals reconcile.
      for (const [periodLabel, interest] of interestByPeriodLabel.entries()) {
        if (!periodLabel || !allowedPeriodLabels.has(String(periodLabel))) continue;
        const interestValue = Number(interest || 0);
        if (!interestValue) continue;

        const row = getOrCreate(periodLabel, 'Interest');
        if (interestValue >= 0) row._income += interestValue;
        else row._expenses += Math.abs(interestValue);
      }

      return Array.from(totalsByKey.values())
        .map((r) => {
          const income = round2(r._income);
          const expensesAbs = round2(r._expenses);
          const netChange = round2(income - expensesAbs);
          return {
            date: r.date,
            secondaryAccount: r.secondaryAccount,
            balance: round2(r.balance),
            income,
            expenses: -Math.abs(expensesAbs),
            netChange
          };
        })
        .filter((r) => r.income !== 0 || r.expenses !== 0 || r.netChange !== 0);
    };

    const transformedData = isCounterpartyMode ? buildCounterpartyRowsForSelectedAccount() : buildAccountLevelRows();

    const computeEndingBalance = (rows) => {
      if (!Array.isArray(rows) || rows.length === 0) return 0;
      let maxDate = null;
      rows.forEach((r) => {
        const key = formatDateKey(r?.date);
        if (!key) return;
        if (!maxDate || key > maxDate) maxDate = key;
      });
      if (!maxDate) return 0;
      return rows
        .filter((r) => formatDateKey(r?.date) === maxDate)
        .reduce((sum, r) => sum + Number(r?.balance || 0), 0);
    };

    const computeEndingBalanceSingleAccount = (rows) => {
      if (!Array.isArray(rows) || rows.length === 0) return 0;
      let maxDate = null;
      rows.forEach((r) => {
        const key = formatDateKey(r?.date);
        if (!key) return;
        if (!maxDate || key > maxDate) maxDate = key;
      });
      if (!maxDate) return 0;
      const row = rows.find((r) => formatDateKey(r?.date) === maxDate);
      return Number(row?.balance || 0);
    };

    const endingBalanceCalc = isCounterpartyMode ? computeEndingBalanceSingleAccount : computeEndingBalance;

    const netChangeBottomCalc = (values) => {
      const sum = (Array.isArray(values) ? values : []).reduce((acc, v) => acc + Number(v || 0), 0);
      return round2(sum);
    };

    const columns = isCounterpartyMode
      ? [
          createDateColumn('Date', 'date', { widthGrow: 1 }),
          createTextColumn('Secondary Account', 'secondaryAccount', { widthGrow: 2 }),
          createMoneyColumn('Projected Balance', 'balance', {
            widthGrow: 2,
            bottomCalc: (values, data) => endingBalanceCalc(data),
            bottomCalcFormatter: (cell) => {
              const value = Number(cell.getValue() || 0);
              return formatBalanceHtml(value);
            }
          }),
          createMoneyColumn('Projected Income', 'income', { widthGrow: 2 }),
          createMoneyColumn('Projected Expenses', 'expenses', { widthGrow: 2 }),
          {
            title: 'Net Change',
            field: 'netChange',
            widthGrow: 2,
            bottomCalc: netChangeBottomCalc,
            bottomCalcFormatter: (cell) => formatNetChangeHtml(cell.getValue()),
            formatter: function (cell) {
              const value = cell.getValue();
              return formatNetChangeHtml(value);
            },
            headerHozAlign: 'right',
            hozAlign: 'right'
          }
        ]
      : [
          createDateColumn('Date', 'date', { widthGrow: 1 }),
          createTextColumn('Account', 'account', { widthGrow: 2 }),
          createMoneyColumn('Projected Balance', 'balance', {
            widthGrow: 2,
            bottomCalc: (values, data) => endingBalanceCalc(data),
            bottomCalcFormatter: (cell) => {
              const value = Number(cell.getValue() || 0);
              return formatBalanceHtml(value);
            }
          }),
          createMoneyColumn('Projected Income', 'income', { widthGrow: 2 }),
          createMoneyColumn('Projected Expenses', 'expenses', { widthGrow: 2 }),
          {
            title: 'Net Change',
            field: 'netChange',
            widthGrow: 2,
            bottomCalc: netChangeBottomCalc,
            bottomCalcFormatter: (cell) => formatNetChangeHtml(cell.getValue()),
            formatter: function (cell) {
              const value = cell.getValue();
              return formatNetChangeHtml(value);
            },
            headerHozAlign: 'right',
            hozAlign: 'right'
          }
        ];

    const columnsKey = isCounterpartyModeAtBuildTime ? 'projections-counterparty' : 'projections-default';

    let projectionsTable = lastProjectionsTable;
    const shouldRebuildTable =
      !projectionsTable ||
      projectionsTable?.element !== container ||
      projectionsTable?.__ftrackColumnsKey !== columnsKey;

    let didCreateNewTable = false;

    if (shouldRebuildTable) {
      didCreateNewTable = true;
      try {
        projectionsTable?.destroy?.();
      } catch (_) {
        // ignore
      }

      projectionsTable = await createGrid(container, {
        data: transformedData,
        layout: 'fitColumns',
        columns
      });

      projectionsTable.__ftrackColumnsKey = columnsKey;
      lastProjectionsTable = projectionsTable;
    } else {
      await refreshGridData(projectionsTable, transformedData);
      lastProjectionsTable = projectionsTable;
    }

    if (projectionsGroupingSelect) {
      const formatGroupLabel = (val) => {
        if (val === null || val === undefined || val === '') return 'Unspecified';
        if (typeof val === 'object') return val.name || val.label || val.description || 'Unspecified';
        return String(val);
      };

      const applyGrouping = () => {
        const nextGroupField = groupFieldAtBuildTime;
        if (!nextGroupField) {
          projectionsTable.setGroupBy(false);
          return;
        }

        projectionsTable.setGroupBy(nextGroupField);
        projectionsTable.setGroupHeader((value, count, data, group) => {
          const netChangeSubtotal = round2(data.reduce((sum, row) => sum + Number(row.netChange || 0), 0));
          const formattedNet = formatNetChangeHtml(netChangeSubtotal);

          const label = formatGroupLabel(value);

          if (isCounterpartyModeAtBuildTime) {
            return `${label} (${count} periods, Net Change: ${formattedNet})`;
          }

          const endingBalance = endingBalanceCalc(data);
          const formattedEnding = formatBalanceHtml(endingBalance);

          let maxDate = null;
          data.forEach((r) => {
            const key = formatDateKey(r?.date);
            if (!key) return;
            if (!maxDate || key > maxDate) maxDate = key;
          });

          const dateSuffix = maxDate ? ` (${maxDate})` : '';
          return `${label} (${count} periods, Ending Balance${dateSuffix}: ${formattedEnding}, Net Change: ${formattedNet})`;
        });
      };

      // Avoid accumulating listeners across reloads.
      projectionsGroupingSelect.onchange = async () => {
        await loadProjectionsGrid({ container, scenarioState, state, tables, callbacks, logger });
      };

      if (didCreateNewTable) {
        // Tabulator isn't guaranteed to be built at this point.
        // Apply grouping after table initialization to avoid initGuard warnings/errors.
        projectionsTable.on('tableBuilt', () => {
          applyGrouping();
        });
      } else {
        applyGrouping();
      }
    }

    callbacks?.updateProjectionTotals?.(callbacks?.getEl?.('projectionsContent'), filteredProjections);
  } catch (err) {
    logger?.error?.('[Forecast] loadProjectionsGrid failed', err);
    notifyError(`Failed to load projections: ${err?.message || String(err)}`);
  }
}
