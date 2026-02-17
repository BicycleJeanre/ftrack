// forecast-controller.js
// Manages the Forecast page with scenario-centric model
// Displays accounts, planned transactions, actual transactions, and projections based on scenario type


import { createGrid, refreshGridData, createSelectorColumn, createTextColumn, createObjectColumn, createDateColumn, createMoneyColumn, createListEditor, formatMoneyDisplay, createDeleteColumn, createDuplicateColumn } from '../components/grids/grid-factory.js';
import { attachGridHandlers } from '../components/grids/grid-handlers.js';
import * as ScenarioManager from '../../app/managers/scenario-manager.js';
import * as AccountManager from '../../app/managers/account-manager.js';
import * as TransactionManager from '../../app/managers/transaction-manager.js';
import * as BudgetManager from '../../app/managers/budget-manager.js';
import { openRecurrenceModal } from '../components/modals/recurrence-modal.js';
import { openPeriodicChangeModal } from '../components/modals/periodic-change-modal.js';
import { getPeriodicChangeDescription } from '../../domain/calculations/periodic-change-utils.js';
import { openTextInputModal } from '../components/modals/text-input-modal.js';
import keyboardShortcuts from '../../shared/keyboard-shortcuts.js';
import { loadGlobals } from '../../global-app.js';
import { createLogger } from '../../shared/logger.js';
import { notifyError, notifySuccess } from '../../shared/notifications.js';
import { normalizeCanonicalTransaction, transformTransactionToRows, mapEditToCanonical } from '../transforms/transaction-row-transformer.js';
import { renderMoneyTotals, renderBudgetTotals } from '../components/widgets/toolbar-totals.js';
import { loadLookup } from '../../app/services/lookup-service.js';
import { buildGridContainer } from '../components/forecast/forecast-layout.js';
import {
  updateTransactionTotals as updateTransactionTotalsCore,
  updateBudgetTotals as updateBudgetTotalsCore
} from '../components/forecast/forecast-totals.js';
import {
  getFilteredProjections as getFilteredProjectionsCore,
  updateProjectionTotals as updateProjectionTotalsCore
} from '../components/forecast/forecast-projections.js';
import {
  transformPlannedTxForUI as transformPlannedTxForUICore,
  transformActualTxForUI as transformActualTxForUICore,
  mapTxToUI as mapTxToUICore
} from '../components/forecast/forecast-tx-ui.js';
import { loadGeneratePlanSection as loadGeneratePlanSectionCore } from '../components/forecast/forecast-generate-plan.js';
import {
  buildAccountsGridColumns as buildAccountsGridColumnsCore,
  loadAccountsGrid as loadAccountsGridCore
} from '../components/grids/accounts-grid.js';
import { loadMasterTransactionsGrid as loadMasterTransactionsGridCore } from '../components/grids/transactions-grid.js';
import { loadBudgetGrid as loadBudgetGridCore } from '../components/grids/budget-grid.js';
import {
  loadProjectionsSection as loadProjectionsSectionCore,
  loadProjectionsGrid as loadProjectionsGridCore
} from '../components/forecast/forecast-projections-section.js';

const logger = createLogger('ForecastController');

import { formatDateOnly, parseDateOnly } from '../../shared/date-utils.js';
import { generateRecurrenceDates } from '../../domain/calculations/calculation-engine.js';
import { expandTransactions } from '../../domain/calculations/transaction-expander.js';
import { getRecurrenceDescription } from '../../domain/calculations/recurrence-utils.js';
import { calculateCategoryTotals, calculateBudgetTotals } from '../transforms/data-aggregators.js';
import { calculateContributionAmount, calculateMonthsToGoal, calculateFutureValue, calculateMonthsBetweenDates, getFrequencyName, getFrequencyInMonths, convertContributionFrequency, getGoalSummary } from '../../domain/calculations/goal-calculations.js';
import {
  getDefaultFundSettings,
  buildProjectionsIndex,
  getBalanceAsOf,
  computeNav,
  computeContributionRedemptionTotals,
  computeFixedSharesReport,
  computeInvestorFlows
} from '../../domain/utils/fund-utils.js';

import {
  getScenarios,
  getScenario,
  saveAccounts,
  getTransactions,
  createTransaction,
  createAccount,
  getScenarioPeriods,
  getBudget,
  saveBudget
} from '../../app/services/data-service.js';
import { generateProjections, clearProjections } from '../../domain/calculations/projection-engine.js';

let currentScenario = null;
let scenarioTypes = null;
let transactionFilterAccountId = null; // Track account filter for transactions view (independent of account grid selection)
let projectionsAccountFilterId = null; // Track account filter for projections view (independent of transactions filter)
let actualPeriod = null; // Selected period for actual transactions
let actualPeriodType = 'Month'; // Selected period type for transactions view
let projectionPeriod = null; // Selected period for projections view
let projectionPeriodType = 'Month'; // Selected period type for projections view
let budgetPeriod = null; // Selected period for budget view
let budgetPeriodType = 'Month'; // Selected period type for budget view
let periods = []; // Calculated periods for current scenario
let projectionPeriods = []; // Calculated periods for projections view
let budgetGridLoadToken = 0; // Prevent stale budget renders
let scenariosTable = null; // Store scenarios table instance to preserve selection/scroll
let masterTransactionsTable = null; // Store transactions table instance for filtering
let masterBudgetTable = null; // Store budget table instance for filtering
let fundSummaryTable = null; // Store fund summary table instance to reduce jumping
let generalSummaryTable = null; // Store general summary table instance to reduce jumping
let summaryCardsAccountTypeFilter = 'All';
let generalSummaryScope = 'All';
let generalSummaryAccountId = 0;

function getPageScrollSnapshot() {
  try {
    return {
      x: window.scrollX || 0,
      y: window.scrollY || 0
    };
  } catch (_) {
    return { x: 0, y: 0 };
  }
}

function restorePageScroll(snapshot) {
  if (!snapshot) return;
  try {
    requestAnimationFrame(() => {
      try {
        window.scrollTo(snapshot.x || 0, snapshot.y || 0);
      } catch (_) {
        // ignore
      }
    });
  } catch (_) {
    // ignore
  }
}

function isDebtScenario(typeConfig) {
  return typeConfig?.id === 4; // Debt Repayment scenario type
}

function isGeneralScenario(typeConfig) {
  return typeConfig?.id === 2; // General scenario type
}

function isFundsScenario(typeConfig) {
  return typeConfig?.id === 3; // Funds scenario type
}

let fundSummaryScope = 'All';

// Update transaction totals in toolbar based on current filtered data
function updateTransactionTotals(filteredRows = null) {
  updateTransactionTotalsCore(masterTransactionsTable, filteredRows);
}

// Update budget totals in toolbar based on current filtered data
function updateBudgetTotals(filteredRows = null) {
  updateBudgetTotalsCore(masterBudgetTable, filteredRows);
}

function getFilteredProjections() {
  return getFilteredProjectionsCore({
    currentScenario,
    projectionsAccountFilterId,
    projectionPeriod,
    projectionPeriods
  });
}

function updateProjectionTotals(container, projections = null) {
  const data = projections || getFilteredProjections();
  updateProjectionTotalsCore(container, data);
}
async function buildScenarioGrid(container) {
  try {
    const lookupData = await loadLookup('lookup-data.json');

    const pad2 = (n) => String(n).padStart(2, '0');

    const parseDateOnlySafe = (value) => {
      if (!value || typeof value !== 'string') return null;
      const d = new Date(`${value}T00:00:00`);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const startOfYear = (year) => new Date(year, 0, 1);
    const endOfYear = (year) => new Date(year, 11, 31);

    const startOfQuarter = (year, quarter) => new Date(year, (quarter - 1) * 3, 1);
    const endOfQuarter = (year, quarter) => new Date(year, quarter * 3, 0);

    const startOfMonth = (year, month1Based) => new Date(year, month1Based - 1, 1);
    const endOfMonth = (year, month1Based) => new Date(year, month1Based, 0);

    const previousOrSameMonday = (date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = (day + 6) % 7; // Mon=0 ... Sun=6
      d.setDate(d.getDate() - diff);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const startOfWeekMonday = (date) => previousOrSameMonday(date);
    const endOfWeekSunday = (date) => {
      const monday = previousOrSameMonday(date);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return sunday;
    };

    const getPeriodTypeName = (rowData) => {
      const p = rowData?.projectionPeriod;
      if (!p) return null;
      if (typeof p === 'string') return p;
      if (typeof p === 'number') {
        const found = lookupData.periodTypes.find((pt) => pt.id === p);
        return found?.name || null;
      }
      return p?.name || null;
    };

    const getOptionYearBounds = (rowData) => {
      const now = new Date();
      const currentYear = now.getFullYear();
      const start = parseDateOnlySafe(rowData?.startDate);
      const end = parseDateOnlySafe(rowData?.endDate);
      const years = [
        currentYear - 5,
        currentYear + 5,
        start ? start.getFullYear() : currentYear,
        end ? end.getFullYear() : currentYear
      ];
      const minYear = Math.min(...years);
      const maxYear = Math.max(...years);
      return { minYear, maxYear };
    };

    const parseIsoWeekInput = (value) => {
      if (!value || typeof value !== 'string') return null;
      const match = value.match(/^(\d{4})-W(\d{2})$/);
      if (!match) return null;
      const year = Number(match[1]);
      const week = Number(match[2]);
      if (!Number.isFinite(year) || !Number.isFinite(week)) return null;
      if (week < 1 || week > 53) return null;
      return { year, week };
    };

    const getIsoWeekStartMonday = (isoYear, isoWeek) => {
      // ISO week 1 is the week containing Jan 4. Weeks start on Monday.
      const jan4 = new Date(Date.UTC(isoYear, 0, 4));
      const jan4Day = jan4.getUTCDay() || 7; // 1..7 (Mon..Sun)
      const mondayWeek1 = new Date(jan4);
      mondayWeek1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
      const monday = new Date(mondayWeek1);
      monday.setUTCDate(mondayWeek1.getUTCDate() + (isoWeek - 1) * 7);
      return new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate());
    };

    const getIsoWeekInputValue = (date) => {
      // Returns YYYY-Www for the ISO week containing `date`.
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - day); // shift to Thursday
      const isoYear = d.getUTCFullYear();
      const yearStart = new Date(Date.UTC(isoYear, 0, 1));
      const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      return `${isoYear}-W${String(weekNo).padStart(2, '0')}`;
    };

    const createScenarioBoundaryEditor = (mode) => {
      return function(cell, onRendered, success, cancel) {
        const rowData = cell.getRow().getData();
        const periodType = getPeriodTypeName(rowData);
        if (!periodType) {
          cancel();
          return;
        }

        const currentRaw = cell.getValue();
        const currentDate = parseDateOnlySafe(currentRaw);
        const now = new Date();
        const currentYear = (currentDate || now).getFullYear();

        const input = document.createElement('input');
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        input.className = 'tabulator-editing';

        const { minYear, maxYear } = getOptionYearBounds(rowData);

        if (periodType === 'Week') {
          input.type = 'week';
          const base = currentDate || new Date(currentYear, 0, 1);
          input.value = getIsoWeekInputValue(base);
        } else if (periodType === 'Quarter') {
          // Use the same native month picker UI as Month, but restrict selection to quarter-start months.
          // Many browsers honor step for month inputs.
          input.type = 'month';
          input.step = '3';
          input.min = `${minYear}-01`;
          input.max = `${maxYear}-10`;

          const base = currentDate || (mode === 'start' ? startOfYear(currentYear) : endOfYear(currentYear));
          const quarterStartMonth = Math.floor(base.getMonth() / 3) * 3 + 1; // 1,4,7,10
          input.value = `${base.getFullYear()}-${pad2(quarterStartMonth)}`;
        } else if (periodType === 'Month') {
          input.type = 'month';
          const base = currentDate || (mode === 'start' ? startOfYear(currentYear) : endOfYear(currentYear));
          input.value = `${base.getFullYear()}-${pad2(base.getMonth() + 1)}`;
        } else if (periodType === 'Year') {
          // Use the same native month picker UI, but restrict to January so it behaves like a year picker.
          input.type = 'month';
          input.step = '12';
          input.min = `${minYear}-01`;
          input.max = `${maxYear}-01`;
          input.value = `${currentYear}-01`;
        } else {
          // Day (and any unknown types) use a standard date picker.
          input.type = 'date';
          const fallback = mode === 'start' ? formatDateOnly(startOfYear(currentYear)) : formatDateOnly(endOfYear(currentYear));
          input.value = typeof currentRaw === 'string' && currentRaw ? currentRaw : fallback;
        }

        const commit = () => {
          try {
            if (periodType === 'Week') {
              const parsed = parseIsoWeekInput(input.value);
              if (!parsed) {
                cancel();
                return;
              }
              const monday = getIsoWeekStartMonday(parsed.year, parsed.week);
              const boundary = mode === 'start' ? monday : new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
              success(formatDateOnly(boundary));
              return;
            }

            if (periodType === 'Month') {
              const match = String(input.value || '').match(/^(\d{4})-(\d{2})$/);
              if (!match) {
                cancel();
                return;
              }
              const year = Number(match[1]);
              const month = Number(match[2]);
              if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
                cancel();
                return;
              }
              const boundary = mode === 'start' ? startOfMonth(year, month) : endOfMonth(year, month);
              success(formatDateOnly(boundary));
              return;
            }

            if (periodType === 'Quarter') {
              const match = String(input.value || '').match(/^(\d{4})-(\d{2})$/);
              if (!match) {
                cancel();
                return;
              }
              const year = Number(match[1]);
              const month = Number(match[2]);
              if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
                cancel();
                return;
              }
              if (year < minYear || year > maxYear) {
                cancel();
                return;
              }
              const quarter = Math.floor((month - 1) / 3) + 1;
              const boundary = mode === 'start' ? startOfQuarter(year, quarter) : endOfQuarter(year, quarter);
              success(formatDateOnly(boundary));
              return;
            }

            if (periodType === 'Year') {
              const match = String(input.value || '').match(/^(\d{4})-(\d{2})$/);
              if (!match) {
                cancel();
                return;
              }
              const year = Number(match[1]);
              if (!Number.isFinite(year)) {
                cancel();
                return;
              }
              if (year < minYear || year > maxYear) {
                cancel();
                return;
              }
              const boundary = mode === 'start' ? startOfYear(year) : endOfYear(year);
              success(formatDateOnly(boundary));
              return;
            }

            // Day
            if (!input.value) {
              cancel();
              return;
            }
            success(input.value);
          } catch (err) {
            cancel();
          }
        };

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') cancel();
        });

        input.addEventListener('blur', commit);

        onRendered(() => {
          input.focus();
          try { input.select(); } catch (e) { /* noop */ }
        });

        return input;
      };
    };

    const formatPeriodLabel = (dateOnly, periodType, mode) => {
      const d = parseDateOnlySafe(dateOnly);
      if (!d || !periodType) return dateOnly || '';

      if (periodType === 'Year') return String(d.getFullYear());
      if (periodType === 'Quarter') return `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`;
      if (periodType === 'Month') return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      if (periodType === 'Week') {
        const monday = mode === 'start' ? startOfWeekMonday(d) : startOfWeekMonday(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6));
        return `Week of ${formatDateOnly(monday)}`;
      }
      return formatDateOnly(d);
    };

    const snapToPeriodBoundary = (dateOnly, periodType, mode) => {
      const d = parseDateOnlySafe(dateOnly);
      if (!d || !periodType) return dateOnly;

      if (periodType === 'Year') {
        return formatDateOnly(mode === 'start' ? startOfYear(d.getFullYear()) : endOfYear(d.getFullYear()));
      }
      if (periodType === 'Quarter') {
        const q = Math.floor(d.getMonth() / 3) + 1;
        return formatDateOnly(mode === 'start' ? startOfQuarter(d.getFullYear(), q) : endOfQuarter(d.getFullYear(), q));
      }
      if (periodType === 'Month') {
        const m = d.getMonth() + 1;
        return formatDateOnly(mode === 'start' ? startOfMonth(d.getFullYear(), m) : endOfMonth(d.getFullYear(), m));
      }
      if (periodType === 'Week') {
        return formatDateOnly(mode === 'start' ? startOfWeekMonday(d) : endOfWeekSunday(d));
      }
      // Day
      return formatDateOnly(d);
    };

    // Keep the scenario grid container stable to reduce scroll jumps.
    // Remove any existing add buttons (defensive)
    const existingScenarioAdds = container.querySelectorAll('.btn-add');
    existingScenarioAdds.forEach(el => el.remove());

    const addScenarioBtn = document.createElement('button');
    addScenarioBtn.className = 'btn btn-primary btn-add';
    addScenarioBtn.textContent = '+ Add New';
    addScenarioBtn.addEventListener('click', async () => {
      const now = new Date();
      const defaultPeriod = lookupData.periodTypes.find((p) => p.name === 'Year') || lookupData.periodTypes[0] || null;
      const defaultStart = formatDateOnly(startOfYear(now.getFullYear()));
      const defaultEnd = formatDateOnly(endOfYear(now.getFullYear()));
      const newScenario = await ScenarioManager.create({
        name: 'New Scenario',
        type: null,
        description: '',
        startDate: defaultStart,
        endDate: defaultEnd,
        projectionPeriod: defaultPeriod
      });
      await buildScenarioGrid(container);
    });
    window.add(container, addScenarioBtn);

    // Create/reuse grid container
    let gridContainer = container.querySelector('#scenariosTable');
    if (!gridContainer) {
      gridContainer = document.createElement('div');
      gridContainer.id = 'scenariosTable'; // explicit ID for logging and testing
      gridContainer.className = 'grid-container scenarios-grid';
      window.add(container, gridContainer);
    }

    // Load all scenarios
    const scenarios = await ScenarioManager.getAll();

    const selectedScenarioIdSnapshot =
      scenariosTable?.getSelectedData?.()?.[0]?.id ??
      currentScenario?.id ??
      null;

    const shouldRebuildTable = !scenariosTable || scenariosTable?.element !== gridContainer;
    let didCreateNewTable = false;

    if (shouldRebuildTable) {
      didCreateNewTable = true;
      try {
        scenariosTable?.destroy?.();
      } catch (_) {
        // ignore
      }

      scenariosTable = await createGrid(gridContainer, {
        data: scenarios,
        selectable: 1, // Only allow single row selection
        columns: [
        createDuplicateColumn(async (cell) => {
          const rowData = cell.getRow().getData();
          await ScenarioManager.duplicate(rowData.id);
          await buildScenarioGrid(container);
        }, { headerTooltip: 'Duplicate Scenario' }),
        createDeleteColumn(async (cell) => {
          const rowData = cell.getRow().getData();
          await ScenarioManager.remove(rowData.id);
          await buildScenarioGrid(container);
        }, { confirmMessage: (rowData) => `Delete scenario: ${rowData.name}?` }),
        createTextColumn('Scenario Name', 'name', { widthGrow: 3, editor: "input", editable: true }),
        {
          title: "Type",
          field: "type",
          widthGrow: 2,
          responsive: 0,
          editor: "list",
          editorParams: {
            values: lookupData.scenarioTypes.map(t => ({ label: t.name, value: t })),
            listItemFormatter: function(value, title) {
              return title;
            }
          },
          formatter: function(cell) {
            const value = cell.getValue();
            return value?.name || '';
          },
          headerFilter: "input",
          headerFilterFunc: "like",
          headerFilterPlaceholder: "Filter...",
          headerHozAlign: "left"
        },
        createTextColumn('Description', 'description', { widthGrow: 3, editor: "input", editable: true, responsive: 3 }),
        {
          title: 'Start',
          field: 'startDate',
          widthGrow: 2,
          responsive: 1,
          editable: (cell) => !!getPeriodTypeName(cell.getRow().getData()),
          editor: createScenarioBoundaryEditor('start'),
          formatter: (cell) => {
            const rowData = cell.getRow().getData();
            const periodType = getPeriodTypeName(rowData);
            return formatPeriodLabel(cell.getValue(), periodType, 'start');
          },
          headerTooltip: 'Start of the selected period'
        },
        {
          title: 'End',
          field: 'endDate',
          widthGrow: 2,
          responsive: 2,
          editable: (cell) => !!getPeriodTypeName(cell.getRow().getData()),
          editor: createScenarioBoundaryEditor('end'),
          formatter: (cell) => {
            const rowData = cell.getRow().getData();
            const periodType = getPeriodTypeName(rowData);
            return formatPeriodLabel(cell.getValue(), periodType, 'end');
          },
          headerTooltip: 'End of the selected period'
        },
        {
          title: "Period Type",
          field: "projectionPeriod",
          widthGrow: 2,
          responsive: 0,
          editor: "list",
          editorParams: {
            values: lookupData.periodTypes.map(p => ({ label: p.name, value: p })),
            listItemFormatter: function(value, title) {
              return title;
            }
          },
          formatter: function(cell) {
            const value = cell.getValue();
            return value?.name || '';
          },
          headerHozAlign: "left"
        }
        ],
        rowSelectionChanged: async function(data, rows) {
          // logger.debug('[Forecast] scenarios.rowSelectionChanged fired. data length:', data && data.length, 'rows length:', rows && rows.length);
          if (rows.length > 0) {
            const scenario = rows[0].getData();
            if (currentScenario && currentScenario.id === scenario.id) return;

            currentScenario = await getScenario(scenario.id);
            transactionFilterAccountId = null; // Clear transaction filter when switching scenarios
            projectionsAccountFilterId = null; // Clear projections filter when switching scenarios
            await loadScenarioData();
          }
        }
      });
    } else {
      await refreshGridData(scenariosTable, scenarios);
    }

    const handleScenarioRowSelectedPrimary = async function(row) {
      try {
        const scenario = row.getData();
        if (currentScenario && currentScenario.id === scenario.id) return;
        currentScenario = await getScenario(scenario.id);
        transactionFilterAccountId = null;
        await loadScenarioData();
      } catch (err) {
        logger.error('[ScenarioGrid] rowSelected handler failed:', err);
      }
    };

    const handleScenarioRowSelectedEnforce = function(row) {
      try {
        const table = row.getTable();
        const selected = table.getSelectedRows();
        if (selected.length > 1) {
          // Deselect others, keep this one
          selected.forEach(r => { if (r.getData().id !== row.getData().id) r.deselect(); });
        }
      } catch (err) {
        logger.error('[ScenarioGrid] rowSelected enforcement failed:', err);
      }
      // Debounce reload to avoid re-render races
      setTimeout(async () => {
        try {
          const scenario = row.getData();
          if (currentScenario && currentScenario.id === scenario.id) return; // already set
          currentScenario = await getScenario(scenario.id);
          transactionFilterAccountId = null;
          await loadScenarioData();
        } catch (err) {
          logger.error('[ScenarioGrid] rowSelected handler failed (delayed):', err);
        }
      }, 40);
    };

    const handleScenarioRowClick = function(e, row) {
      // Ensure single-selection by deselecting others then selecting this row
      try {
        const table = row.getTable();
        // If clicking an already selected row, toggle it off
        if (row.isSelected()) {
          table.deselectRow(row);
          return;
        }
        table.deselectRow();
        row.select();
        // Safety check after a tiny delay
        setTimeout(() => {
          const selected = table.getSelectedRows();
          if (!row.isSelected()) {
            table.deselectRow();
            row.select();
          } else if (selected.length > 1) {
            // enforce single selection
            selected.forEach(r => { if (r.getData().id !== row.getData().id) r.deselect(); });
          }
        }, 20);
      } catch (err) {
        logger.error('[ScenarioGrid] rowClick fallback failed:', err);
      }
    };

    const handleScenarioCellEdited = async function(cell) {
      const row = cell.getRow();
      const scenario = row.getData();
      
      try {
        const field = cell.getColumn()?.getField?.();
        const periodType = getPeriodTypeName(scenario);

        // Snap boundaries when the period type changes, and keep ranges valid.
        if (field === 'projectionPeriod' && periodType) {
          const nextStart = snapToPeriodBoundary(scenario.startDate, periodType, 'start');
          const nextEnd = snapToPeriodBoundary(scenario.endDate, periodType, 'end');
          scenario.startDate = nextStart;
          scenario.endDate = nextEnd;
          row.update({ startDate: nextStart, endDate: nextEnd });
        }

        // Keep start/end aligned and ordered.
        if ((field === 'startDate' || field === 'endDate') && periodType) {
          const snappedStart = snapToPeriodBoundary(scenario.startDate, periodType, 'start');
          const snappedEnd = snapToPeriodBoundary(scenario.endDate, periodType, 'end');
          scenario.startDate = snappedStart;
          scenario.endDate = snappedEnd;

          if (snappedStart && snappedEnd && snappedStart > snappedEnd) {
            if (field === 'startDate') {
              // Move end forward to the end of the start period.
              const inferredEnd = snapToPeriodBoundary(snappedStart, periodType, 'end');
              scenario.endDate = inferredEnd;
              row.update({ endDate: inferredEnd });
            } else {
              // Move start back to the start of the end period.
              const inferredStart = snapToPeriodBoundary(snappedEnd, periodType, 'start');
              scenario.startDate = inferredStart;
              row.update({ startDate: inferredStart });
            }
          }
        }

        // Extract only the fields that should be saved (exclude Tabulator-specific fields)
        const updates = {
          name: scenario.name,
          type: scenario.type,
          description: scenario.description,
          startDate: scenario.startDate,
          endDate: scenario.endDate,
          projectionPeriod: scenario.projectionPeriod
        };
        
        // Update just the edited scenario
        await ScenarioManager.update(scenario.id, updates);
      } catch (err) {
        notifyError('Failed to save scenario: ' + err.message);
      }
    };

    if (didCreateNewTable) {
      attachGridHandlers(scenariosTable, {
        rowSelected: [handleScenarioRowSelectedPrimary, handleScenarioRowSelectedEnforce],
        rowClick: handleScenarioRowClick,
        cellEdited: handleScenarioCellEdited
      });
    }

    if (selectedScenarioIdSnapshot != null) {
      try {
        scenariosTable.selectRow(selectedScenarioIdSnapshot);
      } catch (_) {
        // ignore
      }
    }

    // Set initial scenario if not set and load its data
    if (!currentScenario && scenarios.length > 0) {
      currentScenario = await getScenario(scenarios[0].id);
      await loadScenarioData();
      // Select the first row visually after grid is fully initialized
      // Use a small delay to ensure the grid is ready
      setTimeout(() => {
        const firstRow = scenariosTable.getRows()[0];
        if (firstRow && !firstRow.isSelected()) {
          firstRow.select();
        }
      }, 100);
    }
  } catch (err) {
  }
}

// Load scenario type configuration
async function loadScenarioTypes() {
  try {
    const data = await loadLookup('lookup-data.json');
    scenarioTypes = data.scenarioTypes;
  } catch (err) {
    scenarioTypes = [];
  }
}

// Get current scenario type configuration
function getScenarioTypeConfig() {
  if (!currentScenario || !scenarioTypes) return null;
  if (!currentScenario.type) return null;
  
  const typeId = typeof currentScenario.type === 'number' 
    ? currentScenario.type 
    : currentScenario.type?.id;
  
  return scenarioTypes.find(st => st.id === typeId);
}

/**
 * Transform planned transactions to UI format (transactionType/secondaryAccount) filtered by selected account
 */
function transformPlannedTxForUI(plannedTxs, transactionFilterAccountId) {
  return transformPlannedTxForUICore({
    currentScenario,
    plannedTxs,
    transactionFilterAccountId
  });
}



/**
 * Transform actual transactions for UI (same as planned transactions)
 */
function transformActualTxForUI(actualTxs, transactionFilterAccountId) {
  return transformActualTxForUICore({
    currentScenario,
    actualTxs,
    transactionFilterAccountId
  });
}

/**
 * Map a backend transaction to UI representation for a selected account.
 * Returns null if the transaction does not involve the selected account.
 */
function mapTxToUI(tx, transactionFilterAccountId) {
  return mapTxToUICore({
    currentScenario,
    tx,
    transactionFilterAccountId
  });
}

/**
 * Load the Generate Plan section for goal-based scenarios
 */
async function loadGeneratePlanSection(container) {
  return loadGeneratePlanSectionCore({
    container,
    scenarioState: {
      get: () => currentScenario,
      set: (nextScenario) => {
        currentScenario = nextScenario;
      }
    },
    loadMasterTransactionsGrid,
    loadProjectionsSection,
    logger
  });
}

/**
 * Build accounts grid columns based on scenario type configuration
 */
function buildAccountsGridColumns(lookupData, typeConfig = null) {
  return buildAccountsGridColumnsCore({
    lookupData,
    typeConfig,
    scenarioState: {
      get: () => currentScenario,
      set: (nextScenario) => {
        currentScenario = nextScenario;
      }
    },
    reloadAccountsGrid: loadAccountsGrid,
    reloadMasterTransactionsGrid: loadMasterTransactionsGrid,
    logger
  });
}

// Load accounts grid
async function loadAccountsGrid(container) {
  return loadAccountsGridCore({
    container,
    scenarioState: {
      get: () => currentScenario,
      set: (nextScenario) => {
        currentScenario = nextScenario;
      }
    },
    getScenarioTypeConfig,
    reloadMasterTransactionsGrid: loadMasterTransactionsGrid,
    logger
  });
}

// Load master transactions grid (unified planned and actual)
async function loadMasterTransactionsGrid(container) {
  return loadMasterTransactionsGridCore({
    container,
    scenarioState: {
      get: () => currentScenario,
      set: (nextScenario) => {
        currentScenario = nextScenario;
      }
    },
    getScenarioTypeConfig,
    state: {
      getTransactionFilterAccountId: () => transactionFilterAccountId,
      setTransactionFilterAccountId: (nextId) => {
        transactionFilterAccountId = nextId;
      },
      getActualPeriod: () => actualPeriod,
      setActualPeriod: (nextPeriod) => {
        actualPeriod = nextPeriod;
      },
      getActualPeriodType: () => actualPeriodType,
      setActualPeriodType: (nextType) => {
        actualPeriodType = nextType;
      },
      getPeriods: () => periods,
      setPeriods: (nextPeriods) => {
        periods = nextPeriods;
      }
    },
    tables: {
      getMasterTransactionsTable: () => masterTransactionsTable,
      setMasterTransactionsTable: (nextTable) => {
        masterTransactionsTable = nextTable;
      },
      getMasterBudgetTable: () => masterBudgetTable
    },
    callbacks: {
      updateTransactionTotals,
      updateBudgetTotals,
      loadProjectionsSection,
      refreshSummaryCards,
      getEl
    },
    logger
  });
}

// Load budget grid
async function loadBudgetGrid(container) {
  return loadBudgetGridCore({
    container,
    scenarioState: {
      get: () => currentScenario,
      set: (nextScenario) => {
        currentScenario = nextScenario;
      }
    },
    state: {
      getTransactionFilterAccountId: () => transactionFilterAccountId,
      setTransactionFilterAccountId: (nextId) => {
        transactionFilterAccountId = nextId;
      },
      getBudgetPeriod: () => budgetPeriod,
      setBudgetPeriod: (nextPeriod) => {
        budgetPeriod = nextPeriod;
      },
      getBudgetPeriodType: () => budgetPeriodType,
      setBudgetPeriodType: (nextType) => {
        budgetPeriodType = nextType;
      },
      getPeriods: () => periods,
      setPeriods: (nextPeriods) => {
        periods = nextPeriods;
      },
      bumpBudgetGridLoadToken: () => ++budgetGridLoadToken,
      getBudgetGridLoadToken: () => budgetGridLoadToken
    },
    tables: {
      getMasterBudgetTable: () => masterBudgetTable,
      setMasterBudgetTable: (nextTable) => {
        masterBudgetTable = nextTable;
      },
      getMasterTransactionsTable: () => masterTransactionsTable
    },
    callbacks: {
      updateBudgetTotals,
      updateTransactionTotals,
      loadProjectionsSection,
      getEl
    },
    logger
  });
}

// Load debt summary cards (per-account + overall total)
async function loadDebtSummaryCards(container) {
  if (!container) {
    return;
  }
  if (!currentScenario || !currentScenario.accounts) {
    container.innerHTML = '<div class="empty-message">No accounts added yet.</div>';
    return;
  }

  const { accounts, projections } = currentScenario;
  if (!accounts.length) {
    container.innerHTML = '<div class="empty-message">No accounts added yet.</div>';
    return;
  }

  const scrollSnapshot = getPageScrollSnapshot();

  // Keep toolbar stable (avoid losing focus/scroll between refreshes).
  // If a different summary type was previously rendered, rebuild once.
  let toolbar = container.querySelector(':scope > .summary-cards-toolbar');
  let filterSelect = container.querySelector('#summary-cards-type-filter');
  const isDebtToolbar = !!filterSelect;
  if (!toolbar || !isDebtToolbar) {
    container.innerHTML = '';
    toolbar = document.createElement('div');
    toolbar.className = 'grid-toolbar summary-cards-toolbar';

    const filterItem = document.createElement('div');
    filterItem.className = 'toolbar-item';
    filterItem.innerHTML = `
      <label for="summary-cards-type-filter" class="text-muted control-label">Account Type:</label>
      <select id="summary-cards-type-filter" class="input-select control-select">
        <option value="All">All</option>
        <option value="Liability">Liability</option>
        <option value="Asset">Asset</option>
      </select>
    `;
    toolbar.appendChild(filterItem);
    container.appendChild(toolbar);
    filterSelect = filterItem.querySelector('#summary-cards-type-filter');
  }

  if (filterSelect) {
    filterSelect.value = summaryCardsAccountTypeFilter;
    filterSelect.onchange = () => {
      summaryCardsAccountTypeFilter = filterSelect.value;
      loadDebtSummaryCards(container);
    };
  }

  // Clear any previous empty message
  container.querySelectorAll(':scope > .empty-message').forEach((el) => el.remove());

  const getAccountTypeName = (account) => account?.type?.name || 'Unknown';
  const filteredAccounts = summaryCardsAccountTypeFilter === 'All'
    ? accounts
    : accounts.filter(account => getAccountTypeName(account) === summaryCardsAccountTypeFilter);

  if (!filteredAccounts.length) {
    let emptyMessage = container.querySelector(':scope > .empty-message');
    if (!emptyMessage) {
      emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-message';
      container.appendChild(emptyMessage);
    }
    emptyMessage.textContent = 'No accounts match this filter.';

    const existingGroups = container.querySelector(':scope > .summary-cards-groups');
    if (existingGroups) existingGroups.remove();

    restorePageScroll(scrollSnapshot);
    return;
  }

  // Create per-account cards
  let totalStarting = 0;
  let totalProjectedEnd = 0;
  let totalInterestEarned = 0;
  let totalInterestPaid = 0;

  const groupedAccounts = filteredAccounts.reduce((groups, account) => {
    const typeName = getAccountTypeName(account);
    if (!groups[typeName]) {
      groups[typeName] = [];
    }
    groups[typeName].push(account);
    return groups;
  }, {});

  const orderedGroupKeys = (() => {
    const preferredOrder = ['Liability', 'Asset'];
    const remaining = Object.keys(groupedAccounts).filter(key => !preferredOrder.includes(key)).sort();
    if (summaryCardsAccountTypeFilter !== 'All') {
      return Object.keys(groupedAccounts);
    }
    return [...preferredOrder.filter(key => groupedAccounts[key]), ...remaining];
  })();

  let groupWrapper = container.querySelector(':scope > .summary-cards-groups');
  if (!groupWrapper) {
    groupWrapper = document.createElement('div');
    groupWrapper.className = 'summary-cards-groups';
    container.appendChild(groupWrapper);
  }

  groupWrapper.innerHTML = '';

  for (const groupKey of orderedGroupKeys) {
    const groupContainer = document.createElement('div');
    groupContainer.className = 'summary-cards-group';

    const groupTitle = document.createElement('div');
    groupTitle.className = 'summary-cards-group-title';
    groupTitle.textContent = groupKey;
    groupContainer.appendChild(groupTitle);

    const grid = document.createElement('div');
    grid.className = 'summary-cards-grid';

    for (const account of groupedAccounts[groupKey]) {
    const startingBalance = account.startingBalance ?? 0;
    totalStarting += startingBalance;

    // Find projections for this account
    const accountProjections = projections ? projections.filter(p => p.accountId === account.id) : [];
    
    // Calculate metrics
    const projectedEnd = accountProjections.length ? (accountProjections[accountProjections.length - 1].balance || 0) : startingBalance;
    totalProjectedEnd += projectedEnd;

    // Sum interest earned and paid from projection records
    let interestEarned = 0;
    let interestPaid = 0;
    
    accountProjections.forEach(p => {
      const interest = Number(p.interest || 0);
      if (interest >= 0) {
        interestEarned += interest;
      } else {
        interestPaid += interest; // Keep as negative
      }
    });
    
    totalInterestEarned += interestEarned;
    totalInterestPaid += interestPaid;

    // Find zero crossing date (when balance goes from negative to positive)
    let zeroCrossingDate = null;
    let previousBalance = startingBalance;
    for (const p of accountProjections) {
      const currentBalance = Number(p.balance || 0);
      if (previousBalance < 0 && currentBalance >= 0) {
        zeroCrossingDate = p.date;
        break;
      }
      previousBalance = currentBalance;
    }

    // Format values for display
    const startingStr = formatMoneyDisplay(startingBalance);
    const projectedStr = formatMoneyDisplay(projectedEnd);
    const interestEarnedStr = formatMoneyDisplay(interestEarned);
    const interestPaidStr = formatMoneyDisplay(interestPaid);
    const zeroCrossingStr = zeroCrossingDate ? formatDateOnly(parseDateOnly(zeroCrossingDate)) : 'N/A';

    // Create card
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.innerHTML = `
      <div class="summary-card-title">${account.name || 'Unnamed'}</div>
      <div class="summary-card-row">
        <span class="label">Starting Balance:</span>
        <span class="value">${startingStr}</span>
      </div>
      <div class="summary-card-row">
        <span class="label">Projected End:</span>
        <span class="value">${projectedStr}</span>
      </div>
      <div class="summary-card-row">
        <span class="label">Interest Earned:</span>
        <span class="value interest-earned">${interestEarnedStr}</span>
      </div>
      <div class="summary-card-row">
        <span class="label">Interest Paid:</span>
        <span class="value interest-paid">${interestPaidStr}</span>
      </div>
      <div class="summary-card-row">
        <span class="label">Zero Date:</span>
        <span class="value">${zeroCrossingStr}</span>
      </div>
    `;
    grid.appendChild(card);
    }

    groupContainer.appendChild(grid);
    groupWrapper.appendChild(groupContainer);
  }

  // Create overall total card (only when multiple accounts exist)
  if (filteredAccounts.length > 1) {
    const totalCard = document.createElement('div');
    totalCard.className = 'summary-card overall-total';
    totalCard.innerHTML = `
      <div class="summary-card-title">OVERALL TOTAL</div>
      <div class="summary-card-row">
        <span class="label">Starting Balance:</span>
        <span class="value">${formatMoneyDisplay(totalStarting)}</span>
      </div>
      <div class="summary-card-row">
        <span class="label">Projected End:</span>
        <span class="value">${formatMoneyDisplay(totalProjectedEnd)}</span>
      </div>
      <div class="summary-card-row">
        <span class="label">Interest Earned:</span>
        <span class="value interest-earned">${formatMoneyDisplay(totalInterestEarned)}</span>
      </div>
      <div class="summary-card-row">
        <span class="label">Interest Paid:</span>
        <span class="value interest-paid">${formatMoneyDisplay(totalInterestPaid)}</span>
      </div>
      <div class="summary-card-row">
        <span class="label">Accounts:</span>
        <span class="value">${filteredAccounts.length}</span>
      </div>
    `;
    groupWrapper.appendChild(totalCard);
  }

  restorePageScroll(scrollSnapshot);
}

async function ensureFundSettingsInitialized() {
  const typeConfig = getScenarioTypeConfig();
  if (!isFundsScenario(typeConfig)) {
    return;
  }

  const current = currentScenario?.fundSettings;
  const hasAutoDate = current && (current.automaticEffectiveDate === null || typeof current.automaticEffectiveDate === 'string');
  if (hasAutoDate) return;

  const nextFundSettings = {
    ...getDefaultFundSettings(),
    ...(current || {})
  };

  await ScenarioManager.update(currentScenario.id, { fundSettings: nextFundSettings });
  currentScenario = await getScenario(currentScenario.id);
}

async function loadFundsSummaryCards(container) {
  if (!container) {
    return;
  }

  if (!currentScenario) {
    container.innerHTML = '';
    return;
  }

  await ensureFundSettingsInitialized();

  const lookupData = await loadLookup('lookup-data.json');
  const accountTypeNameById = new Map((lookupData?.accountTypes || []).map((t) => [Number(t.id), t.name]));
  const getAccountTypeId = (account) => {
    const raw = account?.type;
    if (raw && typeof raw === 'object') {
      const id = Number(raw?.id);
      return Number.isFinite(id) ? id : 0;
    }
    const id = Number(raw);
    return Number.isFinite(id) ? id : 0;
  };
  const getAccountTypeName = (account) => accountTypeNameById.get(getAccountTypeId(account)) || '';
  const scopeTypeId = (scopeName) => {
    if (!scopeName || scopeName === 'All') return 0;
    const found = (lookupData?.accountTypes || []).find((t) => t.name === scopeName);
    return found ? Number(found.id) : 0;
  };

  const accounts = currentScenario.accounts || [];
  const projectionsIndex = buildProjectionsIndex(currentScenario.projections || []);
  const fundSettings = currentScenario.fundSettings || getDefaultFundSettings();

  const scopeOptions = ['All', 'Asset', 'Liability', 'Equity', 'Income', 'Expense'];

  const scrollSnapshot = getPageScrollSnapshot();

  // Keep toolbar stable. If a different summary type was previously rendered, rebuild once.
  let toolbar = container.querySelector(':scope > .summary-cards-toolbar');
  let scopeSelect = container.querySelector('#fund-summary-scope');
  const isFundsToolbar = !!scopeSelect;
  if (!toolbar || !isFundsToolbar) {
    container.innerHTML = '';

    toolbar = document.createElement('div');
    toolbar.className = 'grid-toolbar summary-cards-toolbar';

    const scopeItem = document.createElement('div');
    scopeItem.className = 'toolbar-item';
    scopeItem.innerHTML = `
      <label for="fund-summary-scope" class="text-muted control-label">Scope:</label>
      <select id="fund-summary-scope" class="input-select control-select">
        ${scopeOptions.map(o => `<option value="${o}">${o}</option>`).join('')}
      </select>
    `;

    const sharesItem = document.createElement('div');
    sharesItem.className = 'toolbar-item';
    sharesItem.innerHTML = `
      <label for="fund-total-shares" class="text-muted control-label">Total shares:</label>
      <input id="fund-total-shares" class="input control-input" type="number" step="0.0001" min="0" />
    `;

    const refreshItem = document.createElement('div');
    refreshItem.className = 'toolbar-item';
    const refreshButton = document.createElement('button');
    refreshButton.className = 'btn btn-primary';
    refreshButton.textContent = 'Refresh';
    refreshButton.onclick = async () => {
      await loadFundsSummaryCards(container);
    };
    refreshItem.appendChild(refreshButton);

    toolbar.appendChild(scopeItem);
    toolbar.appendChild(sharesItem);
    toolbar.appendChild(refreshItem);
    container.appendChild(toolbar);
  }

  scopeSelect = container.querySelector('#fund-summary-scope');
  const totalSharesInput = container.querySelector('#fund-total-shares');

  if (scopeSelect) {
    scopeSelect.value = scopeOptions.includes(fundSummaryScope) ? fundSummaryScope : 'All';
    scopeSelect.onchange = async () => {
      fundSummaryScope = scopeSelect.value;
      await loadFundsSummaryCards(container);
    };
  }


  // No As-of date control.

  if (totalSharesInput) {
    const currentTotalShares = Number(fundSettings?.totalShares);
    totalSharesInput.value = Number.isFinite(currentTotalShares) && currentTotalShares > 0 ? String(currentTotalShares) : '';
    totalSharesInput.onchange = async () => {
      const nextValue = Number(totalSharesInput.value);
      const next = {
        ...getDefaultFundSettings(),
        ...(currentScenario.fundSettings || {}),
        totalShares: Number.isFinite(nextValue) ? nextValue : null
      };
      await ScenarioManager.update(currentScenario.id, { fundSettings: next });
      currentScenario = await getScenario(currentScenario.id);
      await loadFundsSummaryCards(container);
    };
  }

  // Shares are always automatic; no share mode or manual share editing.

  const asOfDate = null;
  const { nav } = computeNav({ accounts, projectionsIndex, asOfDate: null });

  const equityAccounts = accounts.filter((a) => getAccountTypeId(a) === 3);
  const sharesReport = computeFixedSharesReport({ scenario: currentScenario, accounts, projectionsIndex, asOfDate, fundSettings });
  const sharesById = sharesReport.sharesById;

  const totalShares = Object.values(sharesById).reduce((sum, v) => sum + Number(v || 0), 0);
  const sharePrice = totalShares > 0 ? (nav / totalShares) : null;

  const investorTotals = computeContributionRedemptionTotals({
    scenario: currentScenario,
    accounts,
    asOfDate
  });

  // Clear any previous content below toolbar, but keep the toolbar itself stable.
  Array.from(container.children)
    .filter((child) => child !== toolbar)
    .forEach((child) => child.remove());

  const totalsCard = document.createElement('div');
  totalsCard.className = 'summary-card overall-total';
  totalsCard.innerHTML = `
    <div class="summary-card-title">FUND TOTALS</div>
    <div class="summary-card-row"><span class="label">NAV:</span><span class="value">${formatMoneyDisplay(nav)}</span></div>
    <div class="summary-card-row"><span class="label">Total shares:</span><span class="value neutral">${Number.isFinite(totalShares) ? totalShares.toFixed(4) : '0.0000'}</span></div>
    <div class="summary-card-row"><span class="label">Share price:</span><span class="value neutral">${sharePrice === null ? 'N/A' : formatMoneyDisplay(sharePrice)}</span></div>
    <div class="summary-card-row"><span class="label">Contributions:</span><span class="value">${formatMoneyDisplay(investorTotals.contributions)}</span></div>
    <div class="summary-card-row"><span class="label">Redemptions:</span><span class="value negative">${formatMoneyDisplay(-Math.abs(investorTotals.redemptions || 0))}</span></div>
    <div class="summary-card-row"><span class="label">Net:</span><span class="value">${formatMoneyDisplay(investorTotals.net)}</span></div>
  `;
  container.appendChild(totalsCard);

  const detailWrap = document.createElement('div');
  detailWrap.className = 'summary-cards-group';
  const detailTitle = document.createElement('div');
  detailTitle.className = 'summary-cards-group-title';
  detailTitle.textContent = fundSummaryScope === 'All' ? 'All Accounts' : `${fundSummaryScope} Accounts`;
  detailWrap.appendChild(detailTitle);

  const detailGrid = document.createElement('div');
  detailGrid.className = 'grid-container';
  detailWrap.appendChild(detailGrid);
  container.appendChild(detailWrap);

  if (fundSummaryScope === 'Equity') {
    const flows = computeInvestorFlows({ scenario: currentScenario, accounts, asOfDate });
    const rows = equityAccounts.map(a => {
      const shares = Number(sharesById[a.id] || 0);
      const ownership = totalShares > 0 ? (shares / totalShares) : 0;
      const impliedValue = sharePrice === null ? 0 : shares * sharePrice;
      const f = flows[a.id] || { contributions: 0, redemptions: 0 };
      return {
        accountId: a.id,
        name: a.name || 'Unnamed',
        shares,
        ownershipPct: ownership * 100,
        impliedValue,
        contributions: f.contributions,
        redemptions: f.redemptions
      };
    });

    const columnsKey = 'funds-equity';
    const shouldRebuild = !fundSummaryTable || fundSummaryTable?.element !== detailGrid || fundSummaryTable?.__ftrackColumnsKey !== columnsKey;
    if (shouldRebuild) {
      try {
        fundSummaryTable?.destroy?.();
      } catch (_) {
        // ignore
      }

      fundSummaryTable = await createGrid(detailGrid, {
        data: rows,
        headerWordWrap: false,
        columns: [
        { title: 'Investor', field: 'name', headerSort: false },
        {
          title: 'Shares',
          field: 'shares',
          headerSort: false,
          hozAlign: 'right',
          bottomCalc: 'sum',
          formatter: (cell) => {
            const v = Number(cell.getValue() || 0);
            return v.toFixed(4);
          },
          bottomCalcFormatter: (cell) => {
            const v = Number(cell.getValue() || 0);
            return v.toFixed(4);
          }
        },
        {
          title: 'Ownership %',
          field: 'ownershipPct',
          headerSort: false,
          hozAlign: 'right',
          formatter: (cell) => {
            const v = Number(cell.getValue() || 0);
            return v.toFixed(2) + '%';
          }
        },
        {
          title: 'Implied Value',
          field: 'impliedValue',
          headerSort: false,
          bottomCalc: 'sum',
          formatter: (cell) => formatMoneyDisplay(cell.getValue() || 0),
          bottomCalcFormatter: (cell) => formatMoneyDisplay(cell.getValue() || 0)
        },
        {
          title: 'Net Contributions',
          field: 'contributions',
          headerSort: false,
          bottomCalc: 'sum',
          formatter: (cell) => formatMoneyDisplay(cell.getValue() || 0),
          bottomCalcFormatter: (cell) => formatMoneyDisplay(cell.getValue() || 0)
        },
        {
          title: 'Net Redemptions',
          field: 'redemptions',
          headerSort: false,
          bottomCalc: 'sum',
          formatter: (cell) => formatMoneyDisplay(cell.getValue() || 0),
          bottomCalcFormatter: (cell) => formatMoneyDisplay(cell.getValue() || 0)
        }
        ]
      });

      fundSummaryTable.__ftrackColumnsKey = columnsKey;
    } else {
      await refreshGridData(fundSummaryTable, rows);
    }
  } else {
    const selectedScopeTypeId = scopeTypeId(fundSummaryScope);
    const filteredAccounts = fundSummaryScope === 'All'
      ? accounts
      : accounts.filter((a) => getAccountTypeId(a) === selectedScopeTypeId);

    const data = filteredAccounts.map(a => {
      const balance = getBalanceAsOf({ account: a, projectionsIndex, asOfDate });
      return {
        name: a.name || 'Unnamed',
        type: getAccountTypeName(a),
        balance
      };
    });

    const columnsKey = fundSummaryScope === 'All' ? 'funds-accounts-grouped' : 'funds-accounts-flat';
    const shouldRebuild = !fundSummaryTable || fundSummaryTable?.element !== detailGrid || fundSummaryTable?.__ftrackColumnsKey !== columnsKey;
    if (shouldRebuild) {
      try {
        fundSummaryTable?.destroy?.();
      } catch (_) {
        // ignore
      }

      fundSummaryTable = await createGrid(detailGrid, {
        data,
        headerWordWrap: false,
        ...(fundSummaryScope === 'All' ? { groupBy: 'type' } : {}),
        columns: [
        { title: 'Account', field: 'name', headerSort: false },
        ...(fundSummaryScope === 'All' ? [{ title: 'Type', field: 'type', headerSort: false }] : []),
        {
          title: 'Balance',
          field: 'balance',
          headerSort: false,
          bottomCalc: 'sum',
          formatter: (cell) => formatMoneyDisplay(cell.getValue() || 0),
          bottomCalcFormatter: (cell) => formatMoneyDisplay(cell.getValue() || 0)
        }
        ]
      });

      fundSummaryTable.__ftrackColumnsKey = columnsKey;
    } else {
      await refreshGridData(fundSummaryTable, data);
    }

    if (fundSummaryScope === 'All' && fundSummaryTable?.setGroupHeader) {
      fundSummaryTable.setGroupHeader((value, count, data) => {
        const subtotal = (data || []).reduce((sum, row) => sum + Number(row?.balance || 0), 0);
        return `${value} (${count} items, Subtotal: ${formatMoneyDisplay(subtotal)})`;
      });
    }
  }

  restorePageScroll(scrollSnapshot);
}

async function loadGeneralSummaryCards(container) {
  if (!container) {
    return;
  }

  if (!currentScenario || !currentScenario.type) {
    container.innerHTML = '';
    return;
  }

  const accounts = currentScenario.accounts || [];
  if (!accounts.length) {
    container.innerHTML = '<div class="empty-message">No accounts to summarize yet.</div>';
    return;
  }

  const lookupData = await loadLookup('lookup-data.json');
  const accountTypeNameById = new Map((lookupData?.accountTypes || []).map((t) => [Number(t.id), t.name]));
  const getAccountTypeId = (account) => {
    const raw = account?.type;
    if (raw && typeof raw === 'object') {
      const id = Number(raw?.id);
      return Number.isFinite(id) ? id : 0;
    }
    const id = Number(raw);
    return Number.isFinite(id) ? id : 0;
  };
  const getAccountTypeName = (account) => accountTypeNameById.get(getAccountTypeId(account)) || '';
  const scopeTypeId = (scopeName) => {
    if (!scopeName || scopeName === 'All') return 0;
    const found = (lookupData?.accountTypes || []).find((t) => t.name === scopeName);
    return found ? Number(found.id) : 0;
  };

  const projectionsIndex = buildProjectionsIndex(currentScenario.projections || []);
  const scrollSnapshot = getPageScrollSnapshot();

  const scopeOptions = ['All', 'Asset', 'Liability', 'Equity', 'Income', 'Expense'];

  // Keep toolbar stable (avoid losing focus/scroll between refreshes).
  // If a different summary type was previously rendered, rebuild once.
  let toolbar = container.querySelector(':scope > .summary-cards-toolbar');
  let typeSelect = container.querySelector('#general-summary-type-filter');
  let accountSelect = container.querySelector('#general-summary-account');
  const isGeneralToolbar = !!typeSelect && !!accountSelect;
  if (!toolbar || !isGeneralToolbar) {
    container.innerHTML = '';

    toolbar = document.createElement('div');
    toolbar.className = 'grid-toolbar summary-cards-toolbar';

    const typeItem = document.createElement('div');
    typeItem.className = 'toolbar-item';
    typeItem.innerHTML = `
      <label for="general-summary-type-filter" class="text-muted control-label">Account Type:</label>
      <select id="general-summary-type-filter" class="input-select control-select">
        ${scopeOptions.map(o => `<option value="${o}">${o}</option>`).join('')}
      </select>
    `;

    const accountItem = document.createElement('div');
    accountItem.className = 'toolbar-item';
    accountItem.innerHTML = `
      <label for="general-summary-account" class="text-muted control-label">Account:</label>
      <select id="general-summary-account" class="input-select control-select"></select>
    `;

    toolbar.appendChild(typeItem);
    toolbar.appendChild(accountItem);
    container.appendChild(toolbar);
  }

  typeSelect = container.querySelector('#general-summary-type-filter');
  accountSelect = container.querySelector('#general-summary-account');

  if (typeSelect) {
    typeSelect.value = scopeOptions.includes(generalSummaryScope) ? generalSummaryScope : 'All';
    typeSelect.onchange = async () => {
      generalSummaryScope = typeSelect.value;
      await loadGeneralSummaryCards(container);
    };
  }

  if (accountSelect) {
    const selectedId = Number(generalSummaryAccountId) || 0;
    const options = ['<option value="0">All</option>']
      .concat(
        accounts
          .slice()
          .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')))
          .map((a) => `<option value="${Number(a.id)}">${String(a.name || 'Unnamed')}</option>`)
      )
      .join('');

    if (accountSelect.__ftrackLastOptions !== options) {
      accountSelect.innerHTML = options;
      accountSelect.__ftrackLastOptions = options;
    }

    const currentHasSelected = Array.from(accountSelect.options || []).some((o) => Number(o.value) === selectedId);
    accountSelect.value = currentHasSelected ? String(selectedId) : '0';
    generalSummaryAccountId = Number(accountSelect.value) || 0;

    accountSelect.onchange = async () => {
      generalSummaryAccountId = Number(accountSelect.value) || 0;
      await loadGeneralSummaryCards(container);
    };
  }

  // Clear any previous empty messages.
  container.querySelectorAll(':scope > .empty-message').forEach((el) => el.remove());

  const selectedScopeTypeId = scopeTypeId(generalSummaryScope);
  let filteredAccounts = generalSummaryScope === 'All'
    ? accounts
    : accounts.filter((a) => getAccountTypeId(a) === selectedScopeTypeId);

  if (Number(generalSummaryAccountId) > 0) {
    filteredAccounts = filteredAccounts.filter((a) => Number(a.id) === Number(generalSummaryAccountId));
  }

  if (!filteredAccounts.length) {
    let emptyMessage = container.querySelector(':scope > .empty-message');
    if (!emptyMessage) {
      emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-message';
      container.appendChild(emptyMessage);
    }
    emptyMessage.textContent = 'No accounts match this filter.';

    const existingGroups = container.querySelector(':scope > .summary-cards-groups');
    if (existingGroups) existingGroups.innerHTML = '';

    const existingDetail = container.querySelector(':scope > .general-summary-details');
    if (existingDetail) existingDetail.remove();

    restorePageScroll(scrollSnapshot);
    return;
  }

  // Build Debt-style grouped account cards (excluding Zero Date).
  let groupWrapper = container.querySelector(':scope > .summary-cards-groups');
  if (!groupWrapper) {
    groupWrapper = document.createElement('div');
    groupWrapper.className = 'summary-cards-groups';

    // Insert after toolbar, before the detail grid.
    if (toolbar && toolbar.parentNode === container) {
      if (toolbar.nextSibling) container.insertBefore(groupWrapper, toolbar.nextSibling);
      else container.appendChild(groupWrapper);
    } else {
      container.appendChild(groupWrapper);
    }
  }

  groupWrapper.innerHTML = '';

  const groupedAccounts = filteredAccounts.reduce((groups, account) => {
    const typeName = getAccountTypeName(account) || 'Unknown';
    if (!groups[typeName]) {
      groups[typeName] = [];
    }
    groups[typeName].push(account);
    return groups;
  }, {});

  const orderedGroupKeys = (() => {
    const preferredOrder = ['Liability', 'Asset', 'Equity', 'Income', 'Expense'];
    const remaining = Object.keys(groupedAccounts).filter(key => !preferredOrder.includes(key)).sort();
    if (generalSummaryScope !== 'All') {
      return Object.keys(groupedAccounts);
    }
    return [...preferredOrder.filter(key => groupedAccounts[key]), ...remaining];
  })();

  let totalStarting = 0;
  let totalProjectedEnd = 0;
  let totalInterestEarned = 0;
  let totalInterestPaid = 0;

  const getAccountProjections = (accountId) => projectionsIndex?.byAccountId?.get?.(accountId) || [];

  for (const groupKey of orderedGroupKeys) {
    const groupContainer = document.createElement('div');
    groupContainer.className = 'summary-cards-group';

    const groupTitle = document.createElement('div');
    groupTitle.className = 'summary-cards-group-title';
    groupTitle.textContent = groupKey;
    groupContainer.appendChild(groupTitle);

    const grid = document.createElement('div');
    grid.className = 'summary-cards-grid';

    for (const account of groupedAccounts[groupKey] || []) {
      const startingBalance = account?.startingBalance ?? account?.balance ?? 0;
      totalStarting += Number(startingBalance || 0);

      const accountProjections = getAccountProjections(account?.id);
      const projectedEnd = accountProjections.length
        ? (accountProjections[accountProjections.length - 1]?.balance ?? startingBalance)
        : startingBalance;
      totalProjectedEnd += Number(projectedEnd || 0);

      let interestEarned = 0;
      let interestPaid = 0;
      for (const p of accountProjections) {
        const interest = Number(p?.interest || 0);
        if (interest >= 0) interestEarned += interest;
        else interestPaid += interest;
      }
      totalInterestEarned += interestEarned;
      totalInterestPaid += interestPaid;

      const card = document.createElement('div');
      card.className = 'summary-card';
      card.innerHTML = `
        <div class="summary-card-title">${account?.name || 'Unnamed'}</div>
        <div class="summary-card-row"><span class="label">Starting Balance:</span><span class="value">${formatMoneyDisplay(startingBalance)}</span></div>
        <div class="summary-card-row"><span class="label">Projected End:</span><span class="value">${formatMoneyDisplay(projectedEnd)}</span></div>
        <div class="summary-card-row"><span class="label">Interest Earned:</span><span class="value interest-earned">${formatMoneyDisplay(interestEarned)}</span></div>
        <div class="summary-card-row"><span class="label">Interest Paid:</span><span class="value interest-paid">${formatMoneyDisplay(interestPaid)}</span></div>
      `;
      grid.appendChild(card);
    }

    groupContainer.appendChild(grid);
    groupWrapper.appendChild(groupContainer);
  }

  const { nav, totalAssets, totalLiabilities } = computeNav({ accounts: filteredAccounts, projectionsIndex, asOfDate: null });
  const totalCard = document.createElement('div');
  totalCard.className = 'summary-card overall-total';
  totalCard.innerHTML = `
    <div class="summary-card-title">OVERALL TOTAL</div>
    <div class="summary-card-row"><span class="label">Starting Balance:</span><span class="value">${formatMoneyDisplay(totalStarting)}</span></div>
    <div class="summary-card-row"><span class="label">Projected End:</span><span class="value">${formatMoneyDisplay(totalProjectedEnd)}</span></div>
    <div class="summary-card-row"><span class="label">Interest Earned:</span><span class="value interest-earned">${formatMoneyDisplay(totalInterestEarned)}</span></div>
    <div class="summary-card-row"><span class="label">Interest Paid:</span><span class="value interest-paid">${formatMoneyDisplay(totalInterestPaid)}</span></div>
    <div class="summary-card-row"><span class="label">Net Worth:</span><span class="value">${formatMoneyDisplay(nav)}</span></div>
    <div class="summary-card-row"><span class="label">Total Assets:</span><span class="value positive">${formatMoneyDisplay(totalAssets)}</span></div>
    <div class="summary-card-row"><span class="label">Total Liabilities:</span><span class="value negative">${formatMoneyDisplay(-Math.abs(totalLiabilities || 0))}</span></div>
    <div class="summary-card-row"><span class="label">Accounts:</span><span class="value">${filteredAccounts.length}</span></div>
  `;
  groupWrapper.appendChild(totalCard);

  // Funds-style detail grid (stable DOM node so Tabulator instance can be reused).
  let detailWrap = container.querySelector(':scope > .general-summary-details');
  let detailTitle = detailWrap?.querySelector(':scope > .summary-cards-group-title') || null;
  let detailGrid = detailWrap?.querySelector(':scope > .grid-container') || null;

  if (!detailWrap || !detailTitle || !detailGrid) {
    if (detailWrap) detailWrap.remove();

    detailWrap = document.createElement('div');
    detailWrap.className = 'summary-cards-group general-summary-details';
    detailTitle = document.createElement('div');
    detailTitle.className = 'summary-cards-group-title';
    detailWrap.appendChild(detailTitle);

    detailGrid = document.createElement('div');
    detailGrid.className = 'grid-container';
    detailWrap.appendChild(detailGrid);

    container.appendChild(detailWrap);
  }

  const selectedAccountName = Number(generalSummaryAccountId) > 0
    ? (accounts.find((a) => Number(a.id) === Number(generalSummaryAccountId))?.name || 'Account')
    : null;
  detailTitle.textContent = selectedAccountName
    ? selectedAccountName
    : (generalSummaryScope === 'All' ? 'All Accounts' : `${generalSummaryScope} Accounts`);

  const data = filteredAccounts.map((a) => {
    const balance = getBalanceAsOf({ account: a, projectionsIndex, asOfDate: null });
    return {
      accountId: Number(a.id) || 0,
      name: a.name || 'Unnamed',
      type: getAccountTypeName(a),
      balance
    };
  });

  const shouldGroup = generalSummaryScope === 'All' && Number(generalSummaryAccountId) === 0;
  const columnsKey = shouldGroup ? 'general-accounts-grouped' : 'general-accounts-flat';
  const shouldRebuild = !generalSummaryTable || generalSummaryTable?.element !== detailGrid || generalSummaryTable?.__ftrackColumnsKey !== columnsKey;

  if (shouldRebuild) {
    try {
      generalSummaryTable?.destroy?.();
    } catch (_) {
      // ignore
    }

    generalSummaryTable = await createGrid(detailGrid, {
      data,
      headerWordWrap: false,
      ...(shouldGroup ? { groupBy: 'type' } : {}),
      columns: [
        { title: 'Account', field: 'name', headerSort: false },
        ...(shouldGroup ? [{ title: 'Type', field: 'type', headerSort: false }] : []),
        {
          title: 'Balance',
          field: 'balance',
          headerSort: false,
          bottomCalc: 'sum',
          formatter: (cell) => formatMoneyDisplay(cell.getValue() || 0),
          bottomCalcFormatter: (cell) => formatMoneyDisplay(cell.getValue() || 0)
        }
      ]
    });

    generalSummaryTable.__ftrackColumnsKey = columnsKey;
  } else {
    await refreshGridData(generalSummaryTable, data);
  }

  if (shouldGroup && generalSummaryTable?.setGroupHeader) {
    generalSummaryTable.setGroupHeader((value, count, rows) => {
      const subtotal = (rows || []).reduce((sum, row) => sum + Number(row?.balance || 0), 0);
      return `${value} (${count} items, Subtotal: ${formatMoneyDisplay(subtotal)})`;
    });
  }

  restorePageScroll(scrollSnapshot);
}

async function loadSummaryCards(container) {
  const typeConfig = getScenarioTypeConfig();
  if (!typeConfig?.showSummaryCards) {
    if (container) container.innerHTML = '';
    return;
  }

  if (isDebtScenario(typeConfig)) {
    await loadDebtSummaryCards(container);
    return;
  }

  if (isGeneralScenario(typeConfig)) {
    await loadGeneralSummaryCards(container);
    return;
  }

  if (isFundsScenario(typeConfig)) {
    await loadFundsSummaryCards(container);
    return;
  }
}

async function refreshSummaryCards() {
  const typeConfig = getScenarioTypeConfig();
  if (!typeConfig?.showSummaryCards) {
    return;
  }

  // Minimal plan requirement: General + Funds summaries refresh after edits.
  if (!isGeneralScenario(typeConfig) && !isFundsScenario(typeConfig)) {
    return;
  }

  await loadSummaryCards(getEl('summaryCardsContent'));
}

// Load projections section (buttons and grid)
async function loadProjectionsSection(container) {
  return loadProjectionsSectionCore({
    container,
    scenarioState: {
      get: () => currentScenario,
      set: (nextScenario) => {
        currentScenario = nextScenario;
      }
    },
    getScenarioTypeConfig,
    state: {
      getProjectionAccountFilterId: () => projectionsAccountFilterId,
      setProjectionAccountFilterId: (nextId) => {
        projectionsAccountFilterId = nextId;
      },
      getProjectionPeriod: () => projectionPeriod,
      setProjectionPeriod: (nextPeriod) => {
        projectionPeriod = nextPeriod;
      },
      getProjectionPeriodType: () => projectionPeriodType,
      setProjectionPeriodType: (nextType) => {
        projectionPeriodType = nextType;
      },
      getProjectionPeriods: () => projectionPeriods,
      setProjectionPeriods: (nextPeriods) => {
        projectionPeriods = nextPeriods;
      }
    },
    tables: {
      getMasterTransactionsTable: () => masterTransactionsTable,
      getMasterBudgetTable: () => masterBudgetTable
    },
    callbacks: {
      loadBudgetGrid,
      loadSummaryCards,
      updateTransactionTotals,
      updateBudgetTotals,
      updateProjectionTotals,
      getFilteredProjections,
      getEl
    },
    logger
  });
}

// Load projections grid
async function loadProjectionsGrid(container) {
  return loadProjectionsGridCore({
    container,
    scenarioState: {
      get: () => currentScenario,
      set: (nextScenario) => {
        currentScenario = nextScenario;
      }
    },
    state: {
      getProjectionAccountFilterId: () => projectionsAccountFilterId,
      setProjectionAccountFilterId: (nextId) => {
        projectionsAccountFilterId = nextId;
      },
      getProjectionPeriod: () => projectionPeriod,
      setProjectionPeriod: (nextPeriod) => {
        projectionPeriod = nextPeriod;
      },
      getProjectionPeriodType: () => projectionPeriodType,
      setProjectionPeriodType: (nextType) => {
        projectionPeriodType = nextType;
      },
      getProjectionPeriods: () => projectionPeriods,
      setProjectionPeriods: (nextPeriods) => {
        projectionPeriods = nextPeriods;
      }
    },
    tables: {
      getMasterTransactionsTable: () => masterTransactionsTable,
      getMasterBudgetTable: () => masterBudgetTable
    },
    callbacks: {
      getFilteredProjections,
      updateProjectionTotals,
      getEl
    },
    logger
  });
}

// Load all data for current scenario
async function loadScenarioData() {
  const containers = {
    accountsTable: getEl('accountsTable'),
    transactionsTable: getEl('transactionsTable'),
    budgetTable: getEl('budgetTable'),
    projectionsContent: getEl('projectionsContent'),
    summaryCardsContent: getEl('summaryCardsContent')
  };

  const typeConfig = getScenarioTypeConfig();

  if (typeConfig?.id === 3) { // Funds scenario type
    await ensureFundSettingsInitialized();
  }
  
  // Show/hide sections based on scenario type
  const accountsSection = getEl('accountsTable').closest('.bg-main');
  const generatePlanSection = getEl('generatePlanSection');
  const txSection = getEl('transactionsTable').closest('.bg-main');
  const budgetSection = getEl('budgetSection');
  const projectionsSection = getEl('projectionsSection');
  const summaryCardsSection = getEl('summaryCardsSection');
  
  if (typeConfig) {
    if (typeConfig.showAccounts) accountsSection.classList.remove('hidden'); else accountsSection.classList.add('hidden');
    if (typeConfig.showGeneratePlan) generatePlanSection.style.display = 'block'; else generatePlanSection.style.display = 'none';
    if (typeConfig.showPlannedTransactions || typeConfig.showActualTransactions) txSection.classList.remove('hidden'); else txSection.classList.add('hidden');
    if (typeConfig.showProjections) projectionsSection.classList.remove('hidden'); else projectionsSection.classList.add('hidden');
    if (typeConfig.showBudget !== false) budgetSection.classList.remove('hidden'); else budgetSection.classList.add('hidden');
    if (typeConfig.showSummaryCards) summaryCardsSection.classList.remove('hidden'); else summaryCardsSection.classList.add('hidden');
  }

  // Clear any stale placeholders without destroying stable grid containers.
  containers.transactionsTable.querySelectorAll(':scope > .empty-message').forEach((el) => el.remove());
  containers.budgetTable.querySelectorAll(':scope > .empty-message').forEach((el) => el.remove());

  await loadAccountsGrid(containers.accountsTable);
  
  // Load Generate Plan section if applicable
  if (typeConfig && typeConfig.showGeneratePlan) {
    await loadGeneratePlanSection(getEl('generatePlanContent'));
  }
  
  // Load transactions grid initially (filtering will be applied by account selection)
  // Period calculation happens inside each grid load function
  await loadMasterTransactionsGrid(containers.transactionsTable);

  if (typeConfig.showBudget !== false) {
    await loadBudgetGrid(containers.budgetTable);
  } else {
    containers.budgetTable.innerHTML = '';
  }
  await loadProjectionsSection(containers.projectionsContent);
  
  // Load summary cards AFTER projections so they have data to work with
  if (typeConfig.showSummaryCards) {
    await loadSummaryCards(containers.summaryCardsContent);
  }
}

// Initialize the page
async function init() {
  
  loadGlobals();
  
  // Run data migration if needed
  try {
    const { needsMigration, migrateAllScenarios } = await import('../../app/services/migration-service.js');
    if (await needsMigration()) {
      await migrateAllScenarios();
    }
  } catch (error) {
    notifyError('Data migration failed: ' + (error?.message || 'Unknown error'));
  }
  
  const containers = buildGridContainer();
  
  await loadScenarioTypes();
  
  await buildScenarioGrid(containers.scenarioSelector);
  
  // loadScenarioData is now called from buildScenarioGrid when initial scenario is set
  
  initializeKeyboardShortcuts();

  document.addEventListener('forecast:accountsUpdated', async () => {
    try {
      await refreshSummaryCards();
    } catch (e) {
      // keep existing behavior: ignore
    }
  });
  
}

/**
 * Initialize keyboard shortcut event listeners
 */
function initializeKeyboardShortcuts() {
  // Listen for shortcut events
  document.addEventListener('shortcut:generateProjections', async () => {
    if (currentScenario) {
      const projectionsContainer = document.getElementById('projectionsContent');
      if (projectionsContainer) {
        await loadProjectionsSection(projectionsContainer);
      }
    }
  });

  document.addEventListener('shortcut:save', async () => {
    // Save is automatic on cell edit, so just show feedback
  });

  // Add visual indicator for keyboard shortcuts
  const shortcutsBtn = document.createElement('button');
  shortcutsBtn.className = 'btn btn-secondary';
  shortcutsBtn.innerHTML = '⌨️ Shortcuts';
  shortcutsBtn.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 100; padding: 10px 16px; border-radius: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);';
  shortcutsBtn.title = 'View keyboard shortcuts (or press ?)';
  shortcutsBtn.addEventListener('click', () => {
    keyboardShortcuts.showHelp();
  });
  document.body.appendChild(shortcutsBtn);
}

init().catch(err => {
  notifyError('Initialization failed: ' + (err?.message || 'Unknown error'));
});
