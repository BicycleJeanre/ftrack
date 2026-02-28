// forecast-controller.js
// Manages the Forecast page with scenario-centric model
// Displays accounts, transactions, budgets, and projections based on the selected workflow


import { createGrid, refreshGridData, formatMoneyDisplay, formatNumberDisplay } from '../components/grids/grid-factory.js';
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
import { notifyError, notifySuccess, confirmDialog } from '../../shared/notifications.js';
import { getScenarioProjectionRows, mapPeriodTypeNameToId } from '../../shared/app-data-utils.js';
import { DEFAULT_WORKFLOW_ID, WORKFLOWS, getWorkflowById } from '../../shared/workflow-registry.js';
import * as UiStateManager from '../../app/managers/ui-state-manager.js';
import { normalizeCanonicalTransaction, transformTransactionToRows, mapEditToCanonical } from '../transforms/transaction-row-transformer.js';
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

import { loadGeneratePlanSection as loadGeneratePlanSectionCore } from '../components/forecast/forecast-generate-plan.js';
import {
  buildAccountsGridColumns as buildAccountsGridColumnsCore,
  loadAccountsGrid as loadAccountsGridCore
} from '../components/grids/accounts-grid.js';
import { loadMasterTransactionsGrid as loadMasterTransactionsGridCore } from '../components/grids/transactions-grid.js';
import { loadBudgetGrid as loadBudgetGridCore } from '../components/grids/budget-grid.js';
import {
  loadProjectionsSection as loadProjectionsSectionCore
} from '../components/forecast/forecast-projections-section.js';

const logger = createLogger('ForecastController');

import { formatDateOnly, parseDateOnly } from '../../shared/date-utils.js';

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
  getTransactions,
  createTransaction,
  createAccount,
  getScenarioPeriods,
  getBudget
} from '../../app/services/data-service.js';
import { generateProjections, clearProjections } from '../../domain/calculations/projection-engine.js';

let currentScenario = null;
let uiState = null;
let currentWorkflowId = DEFAULT_WORKFLOW_ID;
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

const PERIOD_TYPE_ID_TO_NAME = {
  1: 'Day',
  2: 'Week',
  3: 'Month',
  4: 'Quarter',
  5: 'Year'
};

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

function getWorkflowConfig() {
  return getWorkflowById(currentWorkflowId);
}

function isDebtWorkflow(workflowConfig) {
  return workflowConfig?.summaryMode === 'debt';
}

function isGeneralWorkflow(workflowConfig) {
  return workflowConfig?.summaryMode === 'general';
}

function isFundsWorkflow(workflowConfig) {
  return workflowConfig?.summaryMode === 'funds';
}

async function patchUiState(nextPartial) {
  try {
    uiState = await UiStateManager.patch(nextPartial);
  } catch (err) {
    logger.error('[UiState] Failed to persist uiState:', err);
  }
  return uiState;
}

async function loadUiState() {
  uiState = await UiStateManager.get();

  currentWorkflowId = getWorkflowById(uiState?.lastWorkflowId)?.id || DEFAULT_WORKFLOW_ID;

  const view = uiState?.viewPeriodTypeIds || {};
  actualPeriodType = PERIOD_TYPE_ID_TO_NAME[Number(view.transactions) || 3] || 'Month';
  budgetPeriodType = PERIOD_TYPE_ID_TO_NAME[Number(view.budgets) || 3] || 'Month';
  projectionPeriodType = PERIOD_TYPE_ID_TO_NAME[Number(view.projections) || 3] || 'Month';
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

async function setCurrentScenarioById(scenarioId) {
  const idNum = scenarioId != null ? Number(scenarioId) : null;
  if (!Number.isFinite(idNum)) return;
  if (currentScenario && Number(currentScenario.id) === idNum) return;

  const next = await getScenario(idNum);
  if (!next) return;

  currentScenario = next;
  transactionFilterAccountId = null;
  projectionsAccountFilterId = null;

  await patchUiState({
    lastScenarioId: currentScenario.id,
    lastScenarioVersion: currentScenario.version
  });

  await loadScenarioData();
}

async function buildScenarioGrid(container) {
  try {
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
      try {
        await ScenarioManager.create({
          name: 'New Scenario',
          description: ''
        });
        await buildScenarioGrid(container);
      } catch (err) {
        notifyError('Failed to create scenario: ' + (err?.message || 'Unknown error'));
      }
    });
    window.add(container, addScenarioBtn);

    // Create/reuse list container
    let listContainer = container.querySelector('#scenariosList');
    if (!listContainer) {
      listContainer = document.createElement('div');
      listContainer.id = 'scenariosList';
      listContainer.className = 'scenarios-list';
      window.add(container, listContainer);
    }

    // Load all scenarios
    const scenarios = await ScenarioManager.getAll();

    const selectedScenarioIdSnapshot = currentScenario?.id ?? null;

    // Clear and rebuild list
    listContainer.innerHTML = '';

    if (!scenarios || scenarios.length === 0) {
      const placeholder = document.createElement('div');
      placeholder.className = 'scenarios-list-placeholder';
      placeholder.textContent = 'No scenarios yet. Click + Add New to create your first scenario.';
      listContainer.appendChild(placeholder);
    } else {
      scenarios.forEach((scenario) => {
        const item = document.createElement('div');
        item.className = 'grid-summary-card scenario-list-item';
        item.setAttribute('data-scenario-id', scenario.id);

        const content = document.createElement('div');
        content.className = 'grid-summary-content';
        
        const nameEl = document.createElement('div');
        nameEl.className = 'grid-summary-title';
        nameEl.textContent = scenario.name || 'Untitled';

        const descEl = document.createElement('div');
        descEl.className = 'grid-summary-meta';
        descEl.textContent = scenario.description || '';

        content.appendChild(nameEl);
        if (descEl.textContent) {
          content.appendChild(descEl);
        }

        const actions = document.createElement('div');
        actions.className = 'grid-summary-actions';

        const dupBtn = document.createElement('button');
        dupBtn.className = 'icon-btn scenarios-list-dup';
        dupBtn.title = 'Duplicate Scenario';
        dupBtn.innerHTML = '⧉';
        dupBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await ScenarioManager.duplicate(scenario.id);
            await buildScenarioGrid(container);
          } catch (err) {
            notifyError('Failed to duplicate scenario: ' + (err?.message || 'Unknown error'));
          }
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn scenarios-list-del';
        delBtn.title = 'Delete Scenario';
        delBtn.innerHTML = '⨉';
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (await confirmDialog(`Delete scenario: ${scenario.name}?`)) {
            try {
              await ScenarioManager.remove(scenario.id);
              await buildScenarioGrid(container);
            } catch (err) {
              notifyError('Failed to delete scenario: ' + (err?.message || 'Unknown error'));
            }
          }
        });

        actions.appendChild(dupBtn);
        actions.appendChild(delBtn);

        // Edit form - same pattern as account-card and grid-summary-card
        const form = document.createElement('div');
        form.className = 'grid-summary-form';
        form.style.display = 'none';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'grid-summary-input';
        nameInput.value = scenario.name || '';
        nameInput.placeholder = 'Scenario name';

        const descInput = document.createElement('input');
        descInput.type = 'text';
        descInput.className = 'grid-summary-input';
        descInput.value = scenario.description || '';
        descInput.placeholder = 'Description (optional)';

        const addFormField = (label, inputEl) => {
          const field = document.createElement('div');
          field.className = 'grid-summary-field';
          const labelEl = document.createElement('label');
          labelEl.className = 'grid-summary-label';
          labelEl.textContent = label;
          field.appendChild(labelEl);
          field.appendChild(inputEl);
          form.appendChild(field);
        };

        addFormField('Name', nameInput);
        addFormField('Description', descInput);

        const formActions = document.createElement('div');
        formActions.className = 'grid-summary-form-actions';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn btn-primary';
        saveBtn.textContent = 'Save';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn';
        cancelBtn.textContent = 'Cancel';

        formActions.appendChild(saveBtn);
        formActions.appendChild(cancelBtn);
        form.appendChild(formActions);

        const enterEdit = () => {
          form.style.display = 'grid';
          content.style.display = 'none';
          actions.style.display = 'none';
          nameInput.focus();
        };

        const exitEdit = () => {
          form.style.display = 'none';
          content.style.display = 'block';
          actions.style.display = 'flex';
        };

        cancelBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          nameInput.value = scenario.name || '';
          descInput.value = scenario.description || '';
          exitEdit();
        });

        saveBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const nextName = nameInput.value.trim() || 'Untitled';
          const nextDesc = descInput.value.trim() || null;
          try {
            await ScenarioManager.update(scenario.id, { name: nextName, description: nextDesc });
            scenario.name = nextName;
            scenario.description = nextDesc;
            nameEl.textContent = nextName;
            descEl.textContent = nextDesc || '';
            if (descEl.textContent && !content.contains(descEl)) {
              content.appendChild(descEl);
            } else if (!descEl.textContent && content.contains(descEl)) {
              content.removeChild(descEl);
            }
            if (currentScenario && Number(currentScenario.id) === Number(scenario.id)) {
              currentScenario = { ...currentScenario, name: nextName, description: nextDesc };
            }
            exitEdit();
          } catch (err) {
            notifyError('Failed to update scenario: ' + (err?.message || 'Unknown error'));
          }
        });

        item.appendChild(content);
        item.appendChild(actions);
        item.appendChild(form);

        // Handle selection - click selects; click again on selected item enters edit mode
        item.addEventListener('click', async (e) => {
          if (form.style.display === 'grid') return;
          if (e.target.closest('.icon-btn')) return;

          if (item.classList.contains('selected')) {
            enterEdit();
            return;
          }

          // Update UI selection
          listContainer.querySelectorAll('.scenario-list-item').forEach(el => {
            el.classList.remove('selected');
          });
          item.classList.add('selected');

          // Update current scenario
          try {
            await setCurrentScenarioById(scenario.id);
          } catch (err) {
            logger.error('[ScenarioList] selection handler failed:', err);
          }
        });

        listContainer.appendChild(item);
      });
    }

    // Re-establish selection
    const persistedScenarioId = uiState?.lastScenarioId ?? null;
    const persistedScenarioVersion = uiState?.lastScenarioVersion ?? null;

    let desiredScenarioId =
      selectedScenarioIdSnapshot != null ? selectedScenarioIdSnapshot : (persistedScenarioId != null ? persistedScenarioId : null);

    if (desiredScenarioId != null) {
      const match = (scenarios || []).find((s) => Number(s.id) === Number(desiredScenarioId)) || null;
      if (!match) {
        desiredScenarioId = null;
      } else if (Number(match.id) === Number(persistedScenarioId) && persistedScenarioVersion != null) {
        if (Number(match.version) !== Number(persistedScenarioVersion)) {
          desiredScenarioId = null;
        }
      }
    }

    if (desiredScenarioId == null && (scenarios || []).length > 0) {
      desiredScenarioId = scenarios[0].id;
    }

    if (desiredScenarioId != null) {
      await setCurrentScenarioById(desiredScenarioId);
      const selectedItem = listContainer.querySelector(`[data-scenario-id="${desiredScenarioId}"]`);
      if (selectedItem) {
        selectedItem.classList.add('selected');
      }
    }
  } catch (err) {
    logger.error('[ScenarioGrid] failed to render', err);
  }
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
    workflowId: getWorkflowConfig()?.id,
    loadMasterTransactionsGrid,
    loadProjectionsSection,
    logger
  });
}

/**
 * Build accounts grid columns based on workflow configuration
 */
function buildAccountsGridColumns(lookupData, workflowConfig = null) {
  return buildAccountsGridColumnsCore({
    lookupData,
    workflowConfig,
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
    getWorkflowConfig,
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
    getWorkflowConfig,
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
        const nextId = mapPeriodTypeNameToId(nextType) || 3;
        patchUiState({
          viewPeriodTypeIds: {
            ...(uiState?.viewPeriodTypeIds || {}),
            transactions: nextId
          }
        });
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
        const nextId = mapPeriodTypeNameToId(nextType) || 3;
        patchUiState({
          viewPeriodTypeIds: {
            ...(uiState?.viewPeriodTypeIds || {}),
            budgets: nextId
          }
        });
      },
      getPeriods: () => periods,
      setPeriods: (nextPeriods) => {
        periods = nextPeriods;
      },
      bumpBudgetGridLoadToken: () => ++budgetGridLoadToken,
      getBudgetGridLoadToken: () => budgetGridLoadToken,
      getBudgetMode: () => getWorkflowConfig()?.budgetMode
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
async function loadDebtSummaryCards(container, options = {}) {
  if (!container) {
    return;
  }
  if (!currentScenario || !currentScenario.accounts) {
    container.innerHTML = '<div class="empty-message">No accounts added yet.</div>';
    return;
  }

  const accounts = currentScenario.accounts || [];
  const projections = getScenarioProjectionRows(currentScenario);
  if (!accounts.length) {
    container.innerHTML = '<div class="empty-message">No accounts added yet.</div>';
    return;
  }

  const scrollSnapshot = getPageScrollSnapshot();

  // Render account-type selector above the totals card (header refresh handles refresh)
  let filterSelect = container.querySelector('#summary-cards-type-filter');
  if (!options.simple) {
    // Remove any old filter holder or toolbars
    container.querySelectorAll(':scope > .summary-filter-holder, :scope > .summary-cards-toolbar').forEach((el) => el.remove());
    if (!filterSelect) {
      // Clear previous content so we can insert fresh filter/summary
      container.innerHTML = '';

      const filterHolder = document.createElement('div');
      filterHolder.className = 'summary-filter-holder';

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

      filterHolder.appendChild(filterItem);
      container.appendChild(filterHolder);
      filterSelect = filterItem.querySelector('#summary-cards-type-filter');
    }

    if (filterSelect) {
      filterSelect.value = summaryCardsAccountTypeFilter;
      filterSelect.onchange = () => {
        summaryCardsAccountTypeFilter = filterSelect.value;
        loadDebtSummaryCards(container, options);
      };
    }
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
    // Place overall total at the top of the summary container so it uses full width
    try {
      if (groupWrapper && groupWrapper.parentNode === container) {
        container.insertBefore(totalCard, groupWrapper);
      } else {
        container.appendChild(totalCard);
      }
    } catch (e) {
      groupWrapper.appendChild(totalCard);
    }
  }

  restorePageScroll(scrollSnapshot);
}

async function ensureFundSettingsInitialized() {
  const workflowConfig = getWorkflowConfig();
  if (!currentScenario || !isFundsWorkflow(workflowConfig)) {
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

async function loadFundsSummaryCards(container, options = {}) {
  if (!container) return;
  // Ensure local refs exist to avoid accidental global assignments
  let toolbar = null;
  let totalSharesInput = null;

  try {
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

  const scopeOptions = ['All', 'Asset', 'Liability', 'Equity', 'Income', 'Expense'];
  const projectionsIndex = buildProjectionsIndex(getScenarioProjectionRows(currentScenario));
  const scrollSnapshot = getPageScrollSnapshot();

  const accounts = currentScenario.accounts || [];
  const fundSettings = currentScenario.fundSettings || getDefaultFundSettings();

  // Ensure no stale grid toolbars remain for summary (we'll use header icon instead)
  container.querySelectorAll(':scope > .grid-toolbar, :scope > .summary-cards-toolbar').forEach((el) => el.remove());



  // No As-of date control.

  // totalSharesInput will be attached after we render the totals card below

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
    <div class="summary-card-row"><span class="label">Total shares:</span><span class="value neutral"><input id="fund-total-shares" class="input control-input" type="number" step="0.0001" min="0" value="${Number.isFinite(totalShares) ? totalShares.toFixed(4) : ''}" /></span></div>
    <div class="summary-card-row"><span class="label">NAV:</span><span class="value">${formatMoneyDisplay(nav)}</span></div>
    <div class="summary-card-row"><span class="label">Share price:</span><span class="value neutral">${sharePrice === null ? 'N/A' : formatMoneyDisplay(sharePrice)}</span></div>
    <div class="summary-card-row"><span class="label">Contributions:</span><span class="value">${formatMoneyDisplay(investorTotals.contributions)}</span></div>
    <div class="summary-card-row"><span class="label">Redemptions:</span><span class="value negative">${formatMoneyDisplay(-Math.abs(investorTotals.redemptions || 0))}</span></div>
    <div class="summary-card-row"><span class="label">Net:</span><span class="value">${formatMoneyDisplay(investorTotals.net)}</span></div>
  `;
  container.appendChild(totalsCard);

  // Attach total shares input handler (moved into totals card)
  totalSharesInput = container.querySelector('#fund-total-shares');
  if (totalSharesInput) {
    const currentTotalShares = Number(fundSettings?.totalShares);
    totalSharesInput.value = Number.isFinite(currentTotalShares) && currentTotalShares > 0 ? String(currentTotalShares) : (Number.isFinite(totalShares) ? totalShares.toFixed(4) : '');
    totalSharesInput.onchange = async () => {
      const nextValue = Number(totalSharesInput.value);
      const next = {
        ...getDefaultFundSettings(),
        ...(currentScenario.fundSettings || {}),
        totalShares: Number.isFinite(nextValue) ? nextValue : null
      };
      await ScenarioManager.update(currentScenario.id, { fundSettings: next });
      currentScenario = await getScenario(currentScenario.id);
      await loadFundsSummaryCards(container, options);
    };
  }

  const detailWrap = document.createElement('div');
  detailWrap.className = 'summary-cards-group';
  const detailTitle = document.createElement('div');
  detailTitle.className = 'summary-cards-group-title';
  // Always render the equity detail grid (filtered equities)
  detailTitle.textContent = 'Equity Accounts';
  detailWrap.appendChild(detailTitle);

  const detailGrid = document.createElement('div');
  detailGrid.className = 'grid-container';
  detailWrap.appendChild(detailGrid);
  container.appendChild(detailWrap);

  // Render equity detail grid only
  {
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
          topCalc: 'sum',
          formatter: (cell) => formatNumberDisplay(cell.getValue() || 0, 4),
          topCalcFormatter: (cell) => formatNumberDisplay(cell.getValue() || 0, 4)
        },
        {
          title: 'Ownership %',
          field: 'ownershipPct',
          headerSort: false,
          hozAlign: 'right',
          formatter: (cell) => (Number(cell.getValue() || 0)).toFixed(2) + '%'
        },
        {
          title: 'Implied Value',
          field: 'impliedValue',
          headerSort: false,
          topCalc: 'sum',
          formatter: (cell) => formatMoneyDisplay(cell.getValue() || 0),
          topCalcFormatter: (cell) => formatMoneyDisplay(cell.getValue() || 0)
        },
        {
          title: 'Net Contributions',
          field: 'contributions',
          headerSort: false,
          topCalc: 'sum',
          formatter: (cell) => formatMoneyDisplay(cell.getValue() || 0),
          topCalcFormatter: (cell) => formatMoneyDisplay(cell.getValue() || 0)
        },
        {
          title: 'Net Redemptions',
          field: 'redemptions',
          headerSort: false,
          topCalc: 'sum',
          formatter: (cell) => formatMoneyDisplay(cell.getValue() || 0),
          topCalcFormatter: (cell) => formatMoneyDisplay(cell.getValue() || 0)
        }
        ]
      });

      fundSummaryTable.__ftrackColumnsKey = columnsKey;
    } else {
      await refreshGridData(fundSummaryTable, rows);
    }
  }
  // end forced equity block

  restorePageScroll(scrollSnapshot);
  } catch (err) {
    console.error('[FundsSummary] failed to render', err);
    try {
      container.innerHTML = '';
      const errEl = document.createElement('div');
      errEl.className = 'empty-message';
      errEl.textContent = 'Failed to load funds summary: ' + (err?.message || String(err));
      container.appendChild(errEl);
    } catch (e) {
      // swallow
    }
  }
}

async function loadGeneralSummaryCards(container, options = {}) {

  if (!container) {
    return;
  }

  if (!currentScenario) {
    container.innerHTML = '';
    return;
  }

  const accounts = currentScenario.accounts || [];
  const scopeOptions = ['All', 'Asset', 'Liability', 'Equity', 'Income', 'Expense'];
  const projectionsIndex = buildProjectionsIndex(getScenarioProjectionRows(currentScenario));
  const scrollSnapshot = getPageScrollSnapshot();
  // no debug messages; show empty state if no accounts
  if (!accounts || !Array.isArray(accounts) || !accounts.length) {
    container.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty-message';
    empty.textContent = 'No accounts found in current scenario.';
    container.appendChild(empty);
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

  // Only render the two static filters (account type and account) and the summary cards grid.
  container.innerHTML = '';

  let toolbar = container.querySelector(':scope > .summary-cards-toolbar');
  if (!options.simple) {
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

    // Populate and wire up the filters
    const typeSelect = toolbar.querySelector('#general-summary-type-filter');
    const accountSelect = toolbar.querySelector('#general-summary-account');
    typeSelect.value = scopeOptions.includes(generalSummaryScope) ? generalSummaryScope : 'All';
    typeSelect.onchange = async () => {
      generalSummaryScope = typeSelect.value;
      await loadGeneralSummaryCards(container, options);
    };

    const selectedId = Number(generalSummaryAccountId) || 0;
    const opts = ['<option value="0">All</option>']
      .concat(
        accounts
          .slice()
          .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')))
          .map((a) => `<option value="${Number(a.id)}">${String(a.name || 'Unnamed')}</option>`)
      )
      .join('');
    accountSelect.innerHTML = opts;
    accountSelect.value = String(selectedId);
    generalSummaryAccountId = Number(accountSelect.value) || 0;
    accountSelect.onchange = async () => {
      generalSummaryAccountId = Number(accountSelect.value) || 0;
      await loadGeneralSummaryCards(container, options);
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
    // Still render an empty summary-cards-groups container for layout consistency
    let groupWrapper = container.querySelector(':scope > .summary-cards-groups');
    if (!groupWrapper) {
      groupWrapper = document.createElement('div');
      groupWrapper.className = 'summary-cards-groups';
      container.appendChild(groupWrapper);
    }

    groupWrapper.innerHTML = '';
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
    // Place overall total at the top of the summary container so it uses full width
    try {
      if (groupWrapper && groupWrapper.parentNode === container) {
        container.insertBefore(totalCard, groupWrapper);
      } else {
        container.appendChild(totalCard);
      }
    } catch (e) {
      groupWrapper.appendChild(totalCard);
    }

  // Repayment goals from Advanced Goal Solver (pay_down_by_date goals).
  const solverGoals = (currentScenario?.advancedGoalSettings?.goals || []).filter(
    (g) => g?.type === 'pay_down_by_date'
  );
  if (solverGoals.length > 0) {
    let repaymentSection = container.querySelector(':scope > .repayment-goals-section');
    if (!repaymentSection) {
      repaymentSection = document.createElement('div');
      repaymentSection.className = 'repayment-goals-section';
      container.appendChild(repaymentSection);
    }
    repaymentSection.innerHTML = '';

    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'summary-cards-group-title';
    sectionTitle.textContent = 'Repayment Goals';
    repaymentSection.appendChild(sectionTitle);

    const grid = document.createElement('div');
    grid.className = 'summary-cards-grid';

    for (const goal of solverGoals) {
      const goalAccount = (currentScenario?.accounts || []).find(
        (a) => Number(a.id) === Number(goal.accountId)
      );
      if (!goalAccount) continue;

      const targetAmount = goal.targetAmount ?? 0;
      const goalEndDate = goal.endDate ? parseDateOnly(goal.endDate) : null;
      const projectedAtDue = getBalanceAsOf({ account: goalAccount, projectionsIndex, asOfDate: goalEndDate });
      const onTrack = projectedAtDue >= targetAmount - 0.01;

      const card = document.createElement('div');
      card.className = 'summary-card';
      card.innerHTML = `
        <div class="summary-card-title">${goalAccount.name || 'Unnamed'}</div>
        <div class="summary-card-row"><span class="label">Type:</span><span class="value">Repayment Goal</span></div>
        <div class="summary-card-row"><span class="label">Target Balance:</span><span class="value">${formatMoneyDisplay(targetAmount)}</span></div>
        <div class="summary-card-row"><span class="label">Due Date:</span><span class="value">${goal.endDate || 'N/A'}</span></div>
        <div class="summary-card-row"><span class="label">Projected at Due:</span><span class="value">${formatMoneyDisplay(projectedAtDue)}</span></div>
        <div class="summary-card-row"><span class="label">Status:</span><span class="value ${onTrack ? 'positive' : 'negative'}">${onTrack ? 'On Track' : 'Off Track'}</span></div>
      `;
      grid.appendChild(card);
    }

    repaymentSection.appendChild(grid);
  }

  // Funds-style detail grid (stable DOM node so Tabulator instance can be reused).
  // Disable detail grid rendering for General workflow summary section.
  // Only show the summary card grid (matches expected UI).
}

async function loadSummaryCards(container, options = {}) {
  // Always declare workflowConfig before any usage
  const workflowConfig = getWorkflowConfig();
  if (!workflowConfig?.showSummaryCards) {
    if (container) container.innerHTML = '';
    return;
  }

  // Always default to summary card grid view on load
  if (typeof window !== 'undefined') {
    if (typeof generalSummaryScope !== 'string' || !generalSummaryScope) generalSummaryScope = 'All';
    if (typeof generalSummaryAccountId !== 'number') generalSummaryAccountId = 0;
  }

  if (isDebtWorkflow(workflowConfig)) {
    // debt workflow branch
    await loadDebtSummaryCards(container, options);
    return;
  }

  if (isGeneralWorkflow(workflowConfig)) {
    // general workflow branch
    await loadGeneralSummaryCards(container, options);
    return;
  }

  if (isFundsWorkflow(workflowConfig)) {
    // funds workflow branch
    await loadFundsSummaryCards(container, options);
    return;
  }

  // no workflow branch matched (silently ignore)
}

async function refreshSummaryCards() {
  const workflowConfig = getWorkflowConfig();
  if (!workflowConfig?.showSummaryCards) {
    return;
  }

  // Minimal plan requirement: General + Funds summaries refresh after edits.
  if (!isGeneralWorkflow(workflowConfig) && !isFundsWorkflow(workflowConfig)) {
    return;
  }

  const useSimple = isGeneralWorkflow(workflowConfig);
  await loadSummaryCards(getEl('summaryCardsContent'), { simple: useSimple });
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
    getWorkflowConfig,
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
        const nextId = mapPeriodTypeNameToId(nextType) || 3;
        patchUiState({
          viewPeriodTypeIds: {
            ...(uiState?.viewPeriodTypeIds || {}),
            projections: nextId
          }
        });
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

// Load all data for current scenario
async function loadScenarioData() {
  const containers = {
    accountsTable: getEl('accountsTable'),
    transactionsTable: getEl('transactionsTable'),
    budgetTable: getEl('budgetTable'),
    projectionsContent: getEl('projectionsContent'),
    summaryCardsContent: getEl('summaryCardsContent')
  };

  const workflowConfig = getWorkflowConfig();

  if (currentScenario && isFundsWorkflow(workflowConfig)) {
    await ensureFundSettingsInitialized();
  }
  
  // Show/hide sections based on workflow
  const accountsSection = getEl('accountsSection');
  const generatePlanSection = getEl('generatePlanSection');
  const txSection = getEl('transactionsSection');
  const budgetSection = getEl('budgetSection');
  const projectionsSection = getEl('projectionsSection');
  const summaryCardsSection = getEl('summaryCardsSection');

  const showAccounts = workflowConfig ? !!workflowConfig.showAccounts : true;
  const showGeneratePlan = workflowConfig ? !!workflowConfig.showGeneratePlan : false;
  const showTransactions = workflowConfig
    ? !!(workflowConfig.showPlannedTransactions || workflowConfig.showActualTransactions)
    : true;
  const showProjections = workflowConfig ? !!workflowConfig.showProjections : true;
  const showBudget = workflowConfig ? workflowConfig.showBudget !== false : true;
  const showSummaryCards = workflowConfig ? !!workflowConfig.showSummaryCards : false;
  
  if (showAccounts) accountsSection.classList.remove('hidden'); else accountsSection.classList.add('hidden');
  if (showGeneratePlan) generatePlanSection.style.display = 'block'; else generatePlanSection.style.display = 'none';
  if (showTransactions) txSection.classList.remove('hidden'); else txSection.classList.add('hidden');
  if (showProjections) projectionsSection.classList.remove('hidden'); else projectionsSection.classList.add('hidden');
  if (showBudget) budgetSection.classList.remove('hidden'); else budgetSection.classList.add('hidden');
  if (showSummaryCards) summaryCardsSection.classList.remove('hidden'); else summaryCardsSection.classList.add('hidden');

  // For the accounts-detail workflow: hide the outer accordion wrapper and expand the
  // body so the Tabulator grid fills all available space.
  const rowMiddle = getEl('row-middle');
  if (rowMiddle) {
    if (workflowConfig?.accountsMode === 'detail') {
      rowMiddle.classList.add('mode-accounts-detail');
      rowMiddle.classList.remove('collapsed');
      rowMiddle.classList.remove('hidden');
    } else {
      rowMiddle.classList.remove('mode-accounts-detail');
      if (showAccounts || showTransactions) {
        rowMiddle.classList.remove('collapsed');
        rowMiddle.classList.remove('hidden');
      } else {
        rowMiddle.classList.add('collapsed');
        rowMiddle.classList.add('hidden');
      }
    }
  }

  // Clear any stale placeholders without destroying stable grid containers.
  containers.accountsTable.querySelectorAll(':scope > .empty-message').forEach((el) => el.remove());
  containers.transactionsTable.querySelectorAll(':scope > .empty-message').forEach((el) => el.remove());
  containers.budgetTable.querySelectorAll(':scope > .empty-message').forEach((el) => el.remove());
  // Load or clear each section based on workflow visibility
  if (showAccounts) {
    await loadAccountsGrid(containers.accountsTable);
  } else {
    containers.accountsTable.innerHTML = '';
  }

  // Load Generate Plan section if applicable
  if (showGeneratePlan) {
    await loadGeneratePlanSection(getEl('generatePlanContent'));
  } else {
    const genEl = getEl('generatePlanContent'); if (genEl) genEl.innerHTML = '';
  }

  // Load transactions grid if visible
  if (showTransactions) {
    await loadMasterTransactionsGrid(containers.transactionsTable);
  } else {
    containers.transactionsTable.innerHTML = '';
  }

  if (showBudget) {
    await loadBudgetGrid(containers.budgetTable);
  } else {
    containers.budgetTable.innerHTML = '';
  }

  if (showProjections) {
    await loadProjectionsSection(containers.projectionsContent);
  } else {
    containers.projectionsContent.innerHTML = '';
  }
  
  // Load summary cards AFTER projections so they have data to work with
  if (showSummaryCards) {
    // Only use simplified summary mode for the General workflow; Funds and Debt get the full UI
    const workflowConfig = getWorkflowConfig();
    const useSimple = isGeneralWorkflow(workflowConfig);
    await loadSummaryCards(containers.summaryCardsContent, { simple: useSimple });
  } else {
    // Clear previous summary content when this workflow hides summaries
    if (containers.summaryCardsContent) containers.summaryCardsContent.innerHTML = '';
  }
}

function renderWorkflowNav(container) {
  if (!container) return;

  container.innerHTML = '';
  const activeId = getWorkflowById(currentWorkflowId)?.id || DEFAULT_WORKFLOW_ID;

  (WORKFLOWS || []).forEach((workflow) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `workflow-nav-item${workflow.id === activeId ? ' active' : ''}`;
    btn.textContent = workflow.name || workflow.id;
    btn.addEventListener('click', async () => {
      const nextId = getWorkflowById(workflow.id)?.id || DEFAULT_WORKFLOW_ID;
      if (nextId === currentWorkflowId) return;

      currentWorkflowId = nextId;
      await patchUiState({ lastWorkflowId: nextId });
      renderWorkflowNav(container);

      try {
        await loadScenarioData();
      } catch (err) {
        logger.error('[WorkflowNav] Failed to reload scenario data after workflow switch:', err);
      }
    });

    container.appendChild(btn);
  });
}

// --- Place all function declarations above init() for hoisting and clarity ---

// ...existing code...

// Initialize the page
async function init() {
  loadGlobals();
  await loadUiState();
  const containers = buildGridContainer();
  renderWorkflowNav(containers.workflowNav);
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

  let refreshInFlight = false;
  document.addEventListener('forecast:refresh', async () => {
    if (refreshInFlight) return;
    if (!currentScenario) return;
    refreshInFlight = true;
    try {
      await loadScenarioData();
    } catch (err) {
      logger.error('[Forecast] Refresh failed:', err);
    } finally {
      refreshInFlight = false;
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

}


init().catch(err => {
  console.error('forecast-controller: init failed', err);
  notifyError('Initialization failed: ' + (err?.message || 'Unknown error'));
});
