// forecast-generate-plan.js
// Goal-based "Generate Plan" feature extracted from forecast.js (no behavior change).

import { loadLookup } from '../../../app/services/lookup-service.js';
import {
  createGrid,
  createDateColumn,
  createMoneyColumn,
  createNumberColumn,
  formatMoneyDisplay
} from '../grids/grid-factory.js';
import { formatDateOnly, parseDateOnly } from '../../../shared/date-utils.js';
import {
  calculateContributionAmount,
  calculateMonthsToGoal,
  calculateFutureValue,
  calculateMonthsBetweenDates,
  getFrequencyName,
  convertContributionFrequency
} from '../../../domain/calculations/goal-calculations.js';
import * as TransactionManager from '../../../app/managers/transaction-manager.js';
import * as ScenarioManager from '../../../app/managers/scenario-manager.js';
import { getScenario } from '../../../app/services/data-service.js';
import { notifyError, notifySuccess } from '../../../shared/notifications.js';
import { formatCurrency } from '../../../shared/format-utils.js';
import { solveAdvancedGoals } from '../../../domain/utils/advanced-goal-solver.js';

function isAdvancedGoalSolverWorkflow(workflowId) {
  return String(workflowId || '').toLowerCase() === 'advanced-goal-solver';
}

function normalizeDateRange({ startDate, endDate }) {
  const start = typeof startDate === 'string' && startDate ? startDate : null;
  const end = typeof endDate === 'string' && endDate ? endDate : null;
  if (!start && !end) return { startDate: null, endDate: null };
  if (!start) return { startDate: end, endDate: end };
  if (!end) return { startDate: start, endDate: start };
  return start <= end ? { startDate: start, endDate: end } : { startDate: end, endDate: start };
}

function getScenarioPlanningWindow(scenario, key) {
  const projectionConfig = scenario?.projection?.config || {};
  const fallback = normalizeDateRange({
    startDate: projectionConfig.startDate || formatDateOnly(new Date()),
    endDate: projectionConfig.endDate || projectionConfig.startDate || formatDateOnly(new Date())
  });

  const planning = scenario?.planning && typeof scenario.planning === 'object' ? scenario.planning : {};
  const raw = planning?.[key] && typeof planning[key] === 'object' ? planning[key] : {};

  const planWindow = normalizeDateRange({
    startDate: raw.startDate || fallback.startDate,
    endDate: raw.endDate || fallback.endDate
  });

  return {
    startDate: planWindow.startDate || fallback.startDate,
    endDate: planWindow.endDate || fallback.endDate
  };
}

async function persistPlanningWindow({ scenarioId, planningKey, nextWindow, scenarioState }) {
  const existingScenario = scenarioState?.get?.() || (scenarioId ? await getScenario(scenarioId) : null);
  const currentPlanning = existingScenario?.planning && typeof existingScenario.planning === 'object' ? existingScenario.planning : {};

  const normalizedWindow = normalizeDateRange(nextWindow);
  if (!normalizedWindow.startDate || !normalizedWindow.endDate) {
    throw new Error('Planning window requires both start and end dates.');
  }

  const nextPlanning = {
    ...currentPlanning,
    [planningKey]: {
      startDate: normalizedWindow.startDate,
      endDate: normalizedWindow.endDate
    }
  };

  await ScenarioManager.update(scenarioId, { planning: nextPlanning });
  const refreshed = await getScenario(scenarioId);
  scenarioState?.set?.(refreshed);
  return refreshed;
}

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getDefaultAdvancedGoalSettings(scenario) {
  const accounts = scenario?.accounts || [];
  const defaultFunding = accounts.find((a) => a.type === 1)?.id || null;
  return {
    goals: [],
    constraints: {
      fundingAccountId: defaultFunding,
      maxOutflowPerMonth: null,
      lockedAccountIds: [],
      maxMovementByAccountId: {},
      minBalanceFloorsByAccountId: {}
    }
  };
}

async function persistAdvancedSettings({ scenarioId, nextSettings, scenarioState }) {
  await ScenarioManager.update(scenarioId, { advancedGoalSettings: nextSettings });
  const refreshed = await getScenario(scenarioId);
  scenarioState?.set?.(refreshed);
  return refreshed;
}

function buildGoalTypeOptions() {
  return [
    { value: 'reach_balance_by_date', label: 'Reach balance target' },
    { value: 'pay_down_by_date', label: 'Pay down to target' },
    { value: 'increase_by_delta', label: 'Increase by delta' },
    { value: 'maintain_floor', label: 'Maintain floor' }
  ];
}

function buildConstraintTypeOptions() {
  return [
    { value: 'fundingAccount', label: 'Funding account' },
    { value: 'maxOutflow', label: 'Max outflow per month' },
    { value: 'lockedAccount', label: 'Locked account' },
    { value: 'accountCap', label: 'Account movement cap per month' },
    { value: 'minBalanceFloor', label: 'Min balance floor' }
  ];
}

function makeId() {
  return `g_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function snapshotWindowScroll() {
  try {
    return { x: window.scrollX || 0, y: window.scrollY || 0 };
  } catch (_) {
    return { x: 0, y: 0 };
  }
}

function restoreWindowScroll(snapshot) {
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

function renderGeneratePlanToolbar({ container, onRefresh }) {
  if (!container) return;

  // Keep a single toolbar at the top of the accordion content.
  container.querySelectorAll(':scope > .grid-toolbar').forEach((el) => el.remove());

  const toolbar = document.createElement('div');
  toolbar.className = 'grid-toolbar';

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'toolbar-item';

  const refreshButton = document.createElement('button');
  refreshButton.className = 'btn';
  refreshButton.textContent = 'Refresh';
  refreshButton.addEventListener('click', async () => {
    const prevText = refreshButton.textContent;
    try {
      refreshButton.textContent = 'Refreshing...';
      refreshButton.disabled = true;
      await onRefresh?.();
    } finally {
      if (refreshButton.isConnected) {
        refreshButton.textContent = prevText;
        refreshButton.disabled = false;
      }
    }
  });

  window.add(buttonContainer, refreshButton);
  window.add(toolbar, buttonContainer);

  // Insert toolbar at the very top.
  container.insertBefore(toolbar, container.firstChild);
}

function renderPlanningWindowToolbar({ container, title, planningWindow, onWindowChange }) {
  if (!container) return;

  container.querySelectorAll(':scope > .planning-window-toolbar').forEach((el) => el.remove());

  const toolbar = document.createElement('div');
  toolbar.className = 'grid-toolbar planning-window-toolbar';

  const titleItem = document.createElement('div');
  titleItem.className = 'toolbar-item';
  titleItem.innerHTML = `<span class="text-muted">${escapeHtml(title || 'Planning Window')}</span>`;
  window.add(toolbar, titleItem);

  const startItem = document.createElement('div');
  startItem.className = 'toolbar-item';
  startItem.innerHTML = `
    <label class="text-muted control-label" style="margin-right:6px;">Start:</label>
  `;
  const startInput = document.createElement('input');
  startInput.type = 'date';
  startInput.className = 'input-select control-select';
  startInput.value = planningWindow?.startDate || '';
  window.add(startItem, startInput);
  window.add(toolbar, startItem);

  const endItem = document.createElement('div');
  endItem.className = 'toolbar-item';
  endItem.innerHTML = `
    <label class="text-muted control-label" style="margin-right:6px;">End:</label>
  `;
  const endInput = document.createElement('input');
  endInput.type = 'date';
  endInput.className = 'input-select control-select';
  endInput.value = planningWindow?.endDate || '';
  window.add(endItem, endInput);
  window.add(toolbar, endItem);

  let persistTimer = null;
  const schedulePersist = () => {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(async () => {
      const next = normalizeDateRange({
        startDate: startInput.value,
        endDate: endInput.value
      });

      if (next.startDate && next.endDate) {
        if (next.startDate !== startInput.value) startInput.value = next.startDate;
        if (next.endDate !== endInput.value) endInput.value = next.endDate;
        await onWindowChange?.(next);
      }
    }, 200);
  };

  startInput.addEventListener('change', schedulePersist);
  endInput.addEventListener('change', schedulePersist);

  const existingTopToolbars = Array.from(container.querySelectorAll(':scope > .grid-toolbar'));
  const insertAfter = existingTopToolbars.length > 0 ? existingTopToolbars[existingTopToolbars.length - 1] : null;
  container.insertBefore(toolbar, insertAfter?.nextSibling || null);
}

async function loadAdvancedGoalSolverSection({
  container,
  scenarioState,
  workflowId,
  loadMasterTransactionsGrid,
  loadProjectionsSection,
  logger
}) {
  const scenario = scenarioState?.get?.();
  if (!scenario) {
    container.innerHTML = '';
    renderGeneratePlanToolbar({
      container,
      onRefresh: async () => {
        const current = scenarioState?.get?.();
        if (current?.id) {
          const refreshed = await getScenario(current.id);
          scenarioState?.set?.(refreshed);
        }
        await loadGeneratePlanSection({ container, scenarioState, workflowId, loadMasterTransactionsGrid, loadProjectionsSection, logger });
      }
    });
    const msg = document.createElement('div');
    msg.className = 'empty-message';
    msg.textContent = 'No scenario selected';
    container.appendChild(msg);
    return;
  }

  const scrollSnapshot = snapshotWindowScroll();
  container.innerHTML = '';

  renderGeneratePlanToolbar({
    container,
    onRefresh: async () => {
      const current = scenarioState?.get?.();
      if (current?.id) {
        const refreshed = await getScenario(current.id);
        scenarioState?.set?.(refreshed);
      }
      await loadGeneratePlanSection({ container, scenarioState, workflowId, loadMasterTransactionsGrid, loadProjectionsSection, logger });
    }
  });

  const planningWindow = getScenarioPlanningWindow(scenario, 'advancedGoalSolver');
  renderPlanningWindowToolbar({
    container,
    title: 'Advanced Goal Solver Window',
    planningWindow,
    onWindowChange: async (nextWindow) => {
      try {
        await persistPlanningWindow({
          scenarioId: scenario.id,
          planningKey: 'advancedGoalSolver',
          nextWindow,
          scenarioState
        });
        await loadGeneratePlanSection({ container, scenarioState, workflowId, loadMasterTransactionsGrid, loadProjectionsSection, logger });
      } catch (err) {
        notifyError('Failed to save planning window: ' + (err?.message || String(err)));
      }
    }
  });

  const accounts = (scenario.accounts || []).filter((a) => a.name !== 'Select Account');
  if (accounts.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'empty-message';
    msg.textContent = 'Create accounts first to configure goals.';
    container.appendChild(msg);
    return;
  }

  const settings = scenario.advancedGoalSettings || getDefaultAdvancedGoalSettings(scenario);
  const goals = Array.isArray(settings.goals) ? settings.goals : [];
  const constraints = settings.constraints || {};

  const formContainer = document.createElement('div');
  formContainer.className = 'generate-plan-form';

  const constraintsDiv = document.createElement('div');
  constraintsDiv.innerHTML = `
    <h3 class="section-title text-main">Constraints</h3>
    <div class="text-muted" style="margin-top:4px;">
      Add limits and rules for the solver. Start with <strong>Funding account</strong> so the solver knows where payments come from.
      Optional constraints can cap monthly outflow, lock accounts, or enforce minimum balances.
    </div>
    <div id="adv-constraints-grid" style="margin-top:8px;"></div>
    <div class="generate-plan-buttons" style="margin-top:8px;">
      <button id="adv-constraint-add" class="btn btn-secondary">+ Add Constraint</button>
    </div>
  `;
  window.add(formContainer, constraintsDiv);

  const goalsDiv = document.createElement('div');
  goalsDiv.innerHTML = `
    <h3 class="section-title text-main">Goals</h3>
    <div class="text-muted" style="margin-top:4px;">
      Add one or more goals for specific accounts. The solver tries to satisfy lower <strong>Priority</strong> numbers first.
      For a home loan payoff, use <strong>Pay down to target</strong> with target amount <strong>0</strong> and set the end date to your desired payoff date.
    </div>
    <div id="adv-goals-grid" style="margin-top:8px;"></div>
    <div class="generate-plan-buttons">
      <button id="adv-goal-add" class="btn btn-secondary">+ Add Goal</button>
    </div>
  `;
  window.add(formContainer, goalsDiv);

  const resultsDiv = document.createElement('div');
  resultsDiv.innerHTML = `
    <h3 class="section-title text-main">Solution</h3>
    <div class="text-muted" style="margin-top:4px;">
      Click <strong>Solve</strong> to calculate suggested monthly planned transactions.
      Click <strong>Apply</strong> to write those transactions into this scenario (replacing any previous solver-generated transactions).
    </div>
    <div id="adv-goal-solution" class="text-muted" style="margin-top:8px;">Configure goals and click Solve.</div>
    <div class="generate-plan-buttons">
      <button id="adv-goal-solve" class="btn btn-primary">Solve</button>
      <button id="adv-goal-apply" class="btn btn-secondary" disabled>Apply</button>
    </div>
  `;
  window.add(formContainer, resultsDiv);

  window.add(container, formContainer);

  restoreWindowScroll(scrollSnapshot);

  const constraintsGridEl = document.getElementById('adv-constraints-grid');
  const addConstraintBtn = document.getElementById('adv-constraint-add');
  const goalsGridEl = document.getElementById('adv-goals-grid');
  const solveBtn = document.getElementById('adv-goal-solve');
  const applyBtn = document.getElementById('adv-goal-apply');
  const addBtn = document.getElementById('adv-goal-add');
  const solutionEl = document.getElementById('adv-goal-solution');

  let lastSolve = null;

  const goalTypeOptions = buildGoalTypeOptions();
  const constraintTypeOptions = buildConstraintTypeOptions();

  const accountIdToName = new Map(accounts.map((a) => [Number(a.id), a.name]));
  const goalTypeToLabel = new Map(goalTypeOptions.map((g) => [g.value, g.label]));
  const constraintTypeToLabel = new Map(constraintTypeOptions.map((c) => [c.value, c.label]));

  const normalizeGoalRow = (row) => {
    const toNumOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

    return {
      id: row.id || makeId(),
      priority: Math.max(1, Number(row.priority || 1)),
      accountId: row.accountId === '' || row.accountId == null ? null : Number(row.accountId),
      type: row.type || 'reach_balance_by_date',
      targetAmount: toNumOrNull(row.targetAmount),
      deltaAmount: toNumOrNull(row.deltaAmount),
      floorAmount: toNumOrNull(row.floorAmount),
      startDate: row.startDate || null,
      endDate: row.endDate || null
    };
  };

  const buildConstraintRowsFromObject = () => {
    const rows = [];
    if (constraints.fundingAccountId != null) {
      rows.push({ id: 'c_funding', type: 'fundingAccount', accountId: Number(constraints.fundingAccountId), amount: null });
    }
    if (constraints.maxOutflowPerMonth != null) {
      rows.push({ id: 'c_maxOutflow', type: 'maxOutflow', accountId: null, amount: Number(constraints.maxOutflowPerMonth) });
    }
    (constraints.lockedAccountIds || []).forEach((id) => {
      rows.push({ id: makeId(), type: 'lockedAccount', accountId: Number(id), amount: null });
    });
    Object.entries(constraints.maxMovementByAccountId || {}).forEach(([accountId, cap]) => {
      rows.push({ id: makeId(), type: 'accountCap', accountId: Number(accountId), amount: Number(cap) });
    });
    Object.entries(constraints.minBalanceFloorsByAccountId || {}).forEach(([accountId, floor]) => {
      rows.push({ id: makeId(), type: 'minBalanceFloor', accountId: Number(accountId), amount: Number(floor) });
    });
    return rows;
  };

  const normalizeConstraintRow = (row) => {
    const toNumOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

    return {
      id: row.id || makeId(),
      type: row.type || 'lockedAccount',
      accountId: row.accountId === '' || row.accountId == null ? null : Number(row.accountId),
      amount: toNumOrNull(row.amount)
    };
  };

  const buildConstraintsObjectFromRows = (rows) => {
    const normalized = (rows || []).map(normalizeConstraintRow);

    const fundingRow = normalized.find((r) => r.type === 'fundingAccount' && r.accountId != null);
    const maxOutflowRow = normalized.find((r) => r.type === 'maxOutflow' && r.amount != null);

    const lockedAccountIds = normalized
      .filter((r) => r.type === 'lockedAccount' && r.accountId != null)
      .map((r) => Number(r.accountId));

    const maxMovementByAccountId = {};
    normalized
      .filter((r) => r.type === 'accountCap' && r.accountId != null && r.amount != null)
      .forEach((r) => {
        maxMovementByAccountId[String(Number(r.accountId))] = Number(r.amount);
      });

    const minBalanceFloorsByAccountId = {};
    normalized
      .filter((r) => r.type === 'minBalanceFloor' && r.accountId != null && r.amount != null)
      .forEach((r) => {
        minBalanceFloorsByAccountId[String(Number(r.accountId))] = Number(r.amount);
      });

    return {
      fundingAccountId: fundingRow ? Number(fundingRow.accountId) : null,
      maxOutflowPerMonth: maxOutflowRow ? Number(maxOutflowRow.amount) : null,
      lockedAccountIds,
      maxMovementByAccountId,
      minBalanceFloorsByAccountId
    };
  };

  let persistTimer = null;
  const schedulePersistNow = () => {
    if (persistTimer) window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(async () => {
      try {
        await persistNow();
      } catch (err) {
        logger?.error?.('[AdvancedGoalSolver] Persist failed', err);
      }
    }, 250);
  };

  const moneyCellFormatterOrBlank = (cell) => {
    const v = cell.getValue();
    if (v === '' || v === null || v === undefined) return '';
    return formatMoneyDisplay(v);
  };

  const goalsTable = await createGrid(goalsGridEl, {
    data: goals.map(normalizeGoalRow),
    index: 'id',
    reactiveData: true,
    placeholder: 'No goals yet.',
    columns: [
      createNumberColumn('Priority', 'priority', { minWidth: 90, widthGrow: 0.6, bottomCalc: null, editorParams: { step: 1, min: 1 } }),
      {
        title: 'Account',
        field: 'accountId',
        minWidth: 200,
        widthGrow: 1.5,
        editor: 'list',
        editorParams: {
          values: accounts.map((a) => ({ label: a.name, value: Number(a.id) })),
          listItemFormatter: function (value, title) {
            return title;
          }
        },
        formatter: function (cell) {
          const id = cell.getValue();
          return id != null ? escapeHtml(accountIdToName.get(Number(id)) || '') : '';
        }
      },
      {
        title: 'Type',
        field: 'type',
        minWidth: 180,
        widthGrow: 1.2,
        editor: 'list',
        editorParams: {
          values: goalTypeOptions.map((t) => ({ label: t.label, value: t.value })),
          listItemFormatter: function (value, title) {
            return title;
          }
        },
        formatter: function (cell) {
          const v = cell.getValue();
          return escapeHtml(goalTypeToLabel.get(v) || v || '');
        }
      },
      createMoneyColumn('Target', 'targetAmount', { minWidth: 130, widthGrow: 1, bottomCalc: null, formatter: moneyCellFormatterOrBlank }),
      createMoneyColumn('Delta', 'deltaAmount', { minWidth: 130, widthGrow: 1, bottomCalc: null, formatter: moneyCellFormatterOrBlank }),
      createMoneyColumn('Floor', 'floorAmount', { minWidth: 130, widthGrow: 1, bottomCalc: null, formatter: moneyCellFormatterOrBlank }),
      createDateColumn('Start', 'startDate', { minWidth: 130, widthGrow: 1, bottomCalc: null }),
      createDateColumn('End', 'endDate', { minWidth: 130, widthGrow: 1, bottomCalc: null }),
      {
        title: '',
        field: '_actions',
        minWidth: 100,
        widthGrow: 0.6,
        headerSort: false,
        formatter: function () {
          return '<button class="btn btn-ghost">Remove</button>';
        },
        cellClick: async function (e, cell) {
          e.preventDefault();
          cell.getRow().delete();
          lastSolve = null;
          applyBtn.disabled = true;
          await persistNow();
        }
      }
    ],
    cellEdited: function () {
      lastSolve = null;
      applyBtn.disabled = true;
      schedulePersistNow();
    }
  });

  let persistConstraintsTimer = null;
  const schedulePersistConstraintsNow = () => {
    if (persistConstraintsTimer) window.clearTimeout(persistConstraintsTimer);
    persistConstraintsTimer = window.setTimeout(async () => {
      try {
        await persistNow();
      } catch (err) {
        logger?.error?.('[AdvancedGoalSolver] Persist constraints failed', err);
      }
    }, 250);
  };

  const constraintsTable = await createGrid(constraintsGridEl, {
    data: buildConstraintRowsFromObject().map(normalizeConstraintRow),
    index: 'id',
    reactiveData: true,
    placeholder: 'No constraints yet.',
    columns: [
      {
        title: 'Type',
        field: 'type',
        minWidth: 210,
        widthGrow: 1.5,
        editor: 'list',
        editorParams: {
          values: constraintTypeOptions.map((t) => ({ label: t.label, value: t.value })),
          listItemFormatter: function (value, title) {
            return title;
          }
        },
        formatter: function (cell) {
          const v = cell.getValue();
          return escapeHtml(constraintTypeToLabel.get(v) || v || '');
        }
      },
      {
        title: 'Account',
        field: 'accountId',
        minWidth: 220,
        widthGrow: 1.6,
        editor: 'list',
        editorParams: {
          values: [{ label: '-- None --', value: null }, ...accounts.map((a) => ({ label: a.name, value: Number(a.id) }))],
          listItemFormatter: function (value, title) {
            return title;
          }
        },
        formatter: function (cell) {
          const id = cell.getValue();
          return id != null ? escapeHtml(accountIdToName.get(Number(id)) || '') : '';
        }
      },
      createMoneyColumn('Amount', 'amount', {
        minWidth: 160,
        widthGrow: 1,
        bottomCalc: null,
        formatter: moneyCellFormatterOrBlank
      }),
      {
        title: '',
        field: '_actions',
        minWidth: 100,
        widthGrow: 0.6,
        headerSort: false,
        formatter: function () {
          return '<button class="btn btn-ghost">Remove</button>';
        },
        cellClick: async function (e, cell) {
          e.preventDefault();
          cell.getRow().delete();
          lastSolve = null;
          applyBtn.disabled = true;
          await persistNow();
        }
      }
    ],
    cellEdited: function () {
      lastSolve = null;
      applyBtn.disabled = true;
      schedulePersistConstraintsNow();
    }
  });

  const persistNow = async () => {
    const gridGoals = goalsTable
      ? goalsTable.getData().map(normalizeGoalRow)
      : (Array.isArray(goals) ? goals.map(normalizeGoalRow) : []);

    const gridConstraints = constraintsTable
      ? constraintsTable.getData().map(normalizeConstraintRow)
      : buildConstraintRowsFromObject().map(normalizeConstraintRow);

    const nextConstraints = buildConstraintsObjectFromRows(gridConstraints);

    const nextSettings = {
      goals: gridGoals,
      constraints: {
        ...constraints,
        ...nextConstraints
      }
    };
    await persistAdvancedSettings({ scenarioId: scenario.id, nextSettings, scenarioState });
  };

  addBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const newGoal = {
      id: makeId(),
      priority: 1,
      accountId: null,
      type: 'reach_balance_by_date',
      targetAmount: null,
      deltaAmount: null,
      floorAmount: null,
      startDate: planningWindow?.startDate || null,
      endDate: planningWindow?.endDate || null
    };
    goalsTable.addRow(newGoal, true);
    await persistNow();
  });

  addConstraintBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    constraintsTable.addRow(
      {
        id: makeId(),
        type: 'lockedAccount',
        accountId: null,
        amount: null
      },
      true
    );
    await persistNow();
  });

  solveBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const latest = await persistAdvancedSettings({
        scenarioId: scenario.id,
        nextSettings: {
          goals: goalsTable.getData().map(normalizeGoalRow),
          constraints: {
            ...constraints,
            ...buildConstraintsObjectFromRows(constraintsTable.getData().map(normalizeConstraintRow))
          }
        },
        scenarioState
      });

      const result = await solveAdvancedGoals({ scenario: latest, settings: latest.advancedGoalSettings });
      lastSolve = result;

      const lines = (result.explanation || []).map((l) => `<div>${escapeHtml(l)}</div>`).join('');
      const txCount = result.suggestedTransactions?.length || 0;
      solutionEl.innerHTML = `
        <div><strong>Suggested transactions:</strong> ${txCount}</div>
        <div style="margin-top:8px;">${lines}</div>
      `;

      applyBtn.disabled = !result.isFeasible || txCount === 0;
    } catch (err) {
      logger?.error?.('[AdvancedGoalSolver] Solve failed', err);

      const message = err?.message ? String(err.message) : String(err || 'Unknown error');
      solutionEl.innerHTML = `
        <div class="error-message"><strong>Solve failed</strong></div>
        <div class="text-muted" style="margin-top:8px;">${escapeHtml(message)}</div>
        <div class="text-muted" style="margin-top:8px;">
          Check DevTools Console for more details.
        </div>
      `;
      notifyError('Failed to solve goals: ' + message);
    }
  });

  applyBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!lastSolve || !Array.isArray(lastSolve.suggestedTransactions) || lastSolve.suggestedTransactions.length === 0) {
      notifyError('Nothing to apply. Click Solve first.');
      return;
    }

    try {
      const refreshedScenario = await getScenario(scenario.id);
      const existing = refreshedScenario?.transactions || [];

      const filtered = existing.filter((tx) => !(tx.tags && tx.tags.includes('adv-goal-generated')));
      const nextTxs = [...filtered, ...lastSolve.suggestedTransactions];

      await TransactionManager.saveAll(refreshedScenario.id, nextTxs);

      const refreshed = await getScenario(refreshedScenario.id);
      scenarioState?.set?.(refreshed);

      await loadMasterTransactionsGrid(document.getElementById('transactionsTable'));
      await loadProjectionsSection(document.getElementById('projectionsContent'));

      notifySuccess('Advanced goal plan applied.');
      applyBtn.disabled = true;
    } catch (err) {
      logger?.error?.('[AdvancedGoalSolver] Apply failed', err);
      notifyError('Failed to apply solution: ' + err.message);
    }
  });

}

export async function loadGeneratePlanSection({
  container,
  scenarioState,
  workflowId = null,
  loadMasterTransactionsGrid,
  loadProjectionsSection,
  logger
}) {
  const currentScenario = scenarioState?.get?.();
  if (!currentScenario) {
    container.innerHTML = '';
    renderGeneratePlanToolbar({
      container,
      onRefresh: async () => {
        const current = scenarioState?.get?.();
        if (current?.id) {
          const refreshed = await getScenario(current.id);
          scenarioState?.set?.(refreshed);
        }
        await loadGeneratePlanSection({ container, scenarioState, workflowId, loadMasterTransactionsGrid, loadProjectionsSection, logger });
      }
    });
    const msg = document.createElement('div');
    msg.className = 'empty-message';
    msg.textContent = 'No scenario selected';
    container.appendChild(msg);
    return;
  }

  if (isAdvancedGoalSolverWorkflow(workflowId)) {
    return loadAdvancedGoalSolverSection({
      container,
      scenarioState,
      workflowId,
      loadMasterTransactionsGrid,
      loadProjectionsSection,
      logger
    });
  }

  const accounts = currentScenario.accounts || [];
  const displayAccounts = accounts.filter(a => a.name !== 'Select Account' && !!a.goalDate);
  const selectableAccounts = accounts.filter(a => a.name !== 'Select Account');

  if (displayAccounts.length === 0) {
    container.innerHTML = '';
    renderGeneratePlanToolbar({
      container,
      onRefresh: async () => {
        const current = scenarioState?.get?.();
      if (current?.id) {
        const refreshed = await getScenario(current.id);
        scenarioState?.set?.(refreshed);
      }
      await loadGeneratePlanSection({ container, scenarioState, workflowId, loadMasterTransactionsGrid, loadProjectionsSection, logger });
    }
  });
    const planningWindow = getScenarioPlanningWindow(currentScenario, 'generatePlan');
    renderPlanningWindowToolbar({
      container,
      title: 'Generate Plan Window',
      planningWindow,
      onWindowChange: async (nextWindow) => {
        try {
          await persistPlanningWindow({
            scenarioId: currentScenario.id,
            planningKey: 'generatePlan',
            nextWindow,
            scenarioState
          });
          await loadGeneratePlanSection({ container, scenarioState, workflowId, loadMasterTransactionsGrid, loadProjectionsSection, logger });
        } catch (err) {
          notifyError('Failed to save planning window: ' + (err?.message || String(err)));
        }
      }
    });
  const msg = document.createElement('div');
  msg.className = 'empty-message';
  msg.textContent = 'No accounts with goals found. Set goal amounts and dates on accounts to generate plans.';
    container.appendChild(msg);
    return;
  }

  const scrollSnapshot = snapshotWindowScroll();
  container.innerHTML = '';

  renderGeneratePlanToolbar({
    container,
    onRefresh: async () => {
      const current = scenarioState?.get?.();
      if (current?.id) {
        const refreshed = await getScenario(current.id);
        scenarioState?.set?.(refreshed);
      }
      await loadGeneratePlanSection({ container, scenarioState, workflowId, loadMasterTransactionsGrid, loadProjectionsSection, logger });
    }
  });

  const planningWindow = getScenarioPlanningWindow(currentScenario, 'generatePlan');
  renderPlanningWindowToolbar({
    container,
    title: 'Generate Plan Window',
    planningWindow,
    onWindowChange: async (nextWindow) => {
      try {
        await persistPlanningWindow({
          scenarioId: currentScenario.id,
          planningKey: 'generatePlan',
          nextWindow,
          scenarioState
        });
        await loadGeneratePlanSection({ container, scenarioState, workflowId, loadMasterTransactionsGrid, loadProjectionsSection, logger });
      } catch (err) {
        notifyError('Failed to save planning window: ' + (err?.message || String(err)));
      }
    }
  });

  const lookupData = await loadLookup('lookup-data.json');

  // Create form container
  const formContainer = document.createElement('div');
  formContainer.className = 'generate-plan-form';

  const introDiv = document.createElement('div');
  introDiv.className = 'text-muted';
  introDiv.style.marginBottom = '10px';
  introDiv.innerHTML = `
    Use this section to estimate a contribution plan for an account goal and then generate planned transactions.
    <br />
    <strong>Prerequisite:</strong> set <strong>Goal Amount</strong> and <strong>Goal Date</strong> on an account in the Accounts grid.
    <br />
    <span class="text-muted">Note: this simple planner uses the account’s base periodic change rate (it does not use a rate schedule).</span>
  `;
  window.add(formContainer, introDiv);

  // Account selector
  const accountRowDiv = document.createElement('div');
  accountRowDiv.innerHTML = `
    <label for="goal-account-select" class="control-label">Goal Account:</label>
    <select id="goal-account-select" class="input-select">
      <option value="">-- Choose an account --</option>
      ${displayAccounts.map(acc => `<option value="${acc.id}">${acc.name} (Goal: ${formatMoneyDisplay(acc.goalAmount)} by ${acc.goalDate})</option>`).join('')}
    </select>
    <div class="text-muted" style="margin-top:4px;">This is the account you want to reach a target balance on by the goal date.</div>
  `;
  window.add(formContainer, accountRowDiv);

  // Income account selector (source)
  const incomeRowDiv = document.createElement('div');
  incomeRowDiv.innerHTML = `
    <label for="goal-income-account-select" class="control-label">Income Account:</label>
    <select id="goal-income-account-select" class="input-select">
      <option value="">-- Choose an account --</option>
      ${selectableAccounts.map(acc => `<option value="${acc.id}">${acc.name}</option>`).join('')}
    </select>
    <div class="text-muted" style="margin-top:4px;">Source account used when generating the planned contribution transactions.</div>
  `;
  window.add(formContainer, incomeRowDiv);

  // Solve For selector
  const solveForDiv = document.createElement('div');
  solveForDiv.innerHTML = `
    <label for="goal-solve-for" class="control-label">Solve For:</label>
    <select id="goal-solve-for" class="input-select">
      <option value="contribution">Contribution Amount</option>
      <option value="date">Goal Date</option>
      <option value="amount">Goal Amount</option>
    </select>
    <div class="text-muted" style="margin-top:4px;">Choose what to calculate. Changing this may enable the Contribution Amount field below.</div>
  `;
  window.add(formContainer, solveForDiv);

  // Frequency selector
  const frequencyDiv = document.createElement('div');
  frequencyDiv.innerHTML = `
    <label for="goal-frequency" class="control-label">Contribution Frequency:</label>
    <select id="goal-frequency" class="input-select">
      <option value="2">Weekly</option>
      <option value="3" selected>Monthly</option>
      <option value="4">Quarterly</option>
      <option value="5">Yearly</option>
    </select>
    <div class="text-muted" style="margin-top:4px;">Controls how often the planned contribution transaction will occur.</div>
  `;
  window.add(formContainer, frequencyDiv);

  // Contribution Amount input (editable when solving for date/amount)
  const contributionDiv = document.createElement('div');
  contributionDiv.innerHTML = `
    <label for="goal-contribution" class="control-label">Contribution Amount:</label>
    <input type="number" id="goal-contribution" class="input-text" placeholder="0.00" step="0.01" />
    <div class="text-muted" style="margin-top:4px;">Used when solving for Goal Date or Goal Amount. Disabled when solving for Contribution Amount.</div>
  `;
  window.add(formContainer, contributionDiv);

  // Results/Summary area
  const summaryDiv = document.createElement('div');
  summaryDiv.id = 'goal-summary';
  summaryDiv.innerHTML = '<p class="text-muted">Select an account and adjust parameters to see calculations</p>';
  window.add(formContainer, summaryDiv);

  // Buttons
  const buttonDiv = document.createElement('div');
  buttonDiv.className = 'generate-plan-buttons';

  const generateBtn = document.createElement('button');
  generateBtn.className = 'btn btn-primary';
  generateBtn.textContent = 'Generate Plan';
  generateBtn.id = 'goal-generate-btn';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn btn-secondary';
  resetBtn.textContent = 'Reset';
  resetBtn.id = 'goal-reset-btn';

  window.add(buttonDiv, generateBtn);
  window.add(buttonDiv, resetBtn);
  window.add(formContainer, buttonDiv);

  window.add(container, formContainer);

  restoreWindowScroll(scrollSnapshot);

  // Store state for generate plan
  let generatePlanState = {
    selectedAccountId: null,
    incomeAccountId: null,
    solveFor: 'contribution',
    frequency: 3, // Monthly
    contribution: 0,
    lookupData: lookupData
  };

  // Attach event listeners
  const accountSelect = document.getElementById('goal-account-select');
  const incomeAccountSelect = document.getElementById('goal-income-account-select');
  const solveForSelect = document.getElementById('goal-solve-for');
  const frequencySelect = document.getElementById('goal-frequency');
  const contributionInput = document.getElementById('goal-contribution');
  const summaryEl = document.getElementById('goal-summary');
  const generateBtnEl = document.getElementById('goal-generate-btn');
  const resetBtnEl = document.getElementById('goal-reset-btn');

  // Recalculate display whenever inputs change
  async function updateSummary() {
    const selectedId = parseInt(accountSelect.value);
    const incomeAccountId = parseInt(incomeAccountSelect.value);

    if (!incomeAccountId) {
      summaryEl.innerHTML = '<p class="text-muted">Select an income account to begin</p>';
      generateBtnEl.disabled = true;
      return;
    }

    if (!selectedId) {
      summaryEl.innerHTML = '<p class="text-muted">Select an account to begin</p>';
      generateBtnEl.disabled = true;
      return;
    }

    const solveFor = solveForSelect.value;
    const selectedAccount = displayAccounts.find(a => a.id === selectedId);
    if (!selectedAccount || !selectedAccount.goalDate) {
      summaryEl.innerHTML = '<p class="error-message">Selected account does not have a goal date set</p>';
      return;
    }

    const rawGoalAmount = selectedAccount.goalAmount;
    const hasGoalAmount = rawGoalAmount !== null && rawGoalAmount !== undefined && rawGoalAmount !== '';
    if ((solveFor === 'contribution' || solveFor === 'date') && !hasGoalAmount) {
      summaryEl.innerHTML = '<p class="error-message">Set Goal Amount to solve for contribution or date</p>';
      return;
    }
    const frequency = parseInt(frequencySelect.value);
    const contribution = parseFloat(contributionInput.value) || 0;

    generatePlanState.selectedAccountId = selectedId;
    generatePlanState.incomeAccountId = incomeAccountId;
    generatePlanState.solveFor = solveFor;
    generatePlanState.frequency = frequency;
    generatePlanState.contribution = contribution;

    // Calculate the requested value
    const planStart = planningWindow?.startDate || formatDateOnly(new Date());
    const planEnd = planningWindow?.endDate || selectedAccount.goalDate || planStart;

    if (selectedAccount.goalDate < planStart) {
      summaryEl.innerHTML = `<p class="error-message">Goal Date must be on/after planning start (${escapeHtml(planStart)})</p>`;
      return;
    }
    if (selectedAccount.goalDate > planEnd) {
      summaryEl.innerHTML = `<p class="error-message">Goal Date (${escapeHtml(selectedAccount.goalDate)}) is after planning end (${escapeHtml(planEnd)})</p>`;
      return;
    }

    const monthsToGoal = calculateMonthsBetweenDates(planStart, selectedAccount.goalDate);
    const startingBalance = selectedAccount.startingBalance || 0;
    const goalAmount = Number(selectedAccount.goalAmount ?? 0);
    const annualRate = selectedAccount.periodicChange?.rateValue || 0;

    let summary = '';
    let error = '';

    if (solveFor === 'contribution') {
      if (monthsToGoal <= 0) {
        error = 'Goal date must be in the future';
      } else {
        const calculatedContribution = calculateContributionAmount(startingBalance, goalAmount, monthsToGoal, annualRate);
        const displayContribution = convertContributionFrequency(calculatedContribution, 3, frequency); // Convert from monthly
        contributionInput.value = displayContribution.toFixed(2);
        summary = `<p><strong>${getFrequencyName(frequency).toLowerCase()}</strong> contribution: <strong>${formatMoneyDisplay(displayContribution)}</strong> · from <strong>${escapeHtml(selectableAccounts.find(a => a.id === incomeAccountId)?.name || '')}</strong> · to reach <strong>${formatMoneyDisplay(goalAmount)}</strong> by <strong>${selectedAccount.goalDate}</strong></p>`;
      }
    } else if (solveFor === 'date') {
      if (contribution <= 0) {
        error = 'Contribution amount must be greater than 0';
      } else {
        const monthlyContribution = convertContributionFrequency(contribution, frequency, 3); // Convert to monthly
        const monthsNeeded = calculateMonthsToGoal(startingBalance, goalAmount, monthlyContribution, annualRate);
        if (monthsNeeded === null) {
          error = 'Goal is not reachable with the given contribution amount';
        } else {
          const daysInMonths = Math.ceil(monthsNeeded);
          const futureDate = new Date();
          futureDate.setMonth(futureDate.getMonth() + daysInMonths);
          const formattedDate = formatDateOnly(futureDate);
          summary = `<p><strong>Target date:</strong> <strong>${formattedDate}</strong> · from <strong>${escapeHtml(selectableAccounts.find(a => a.id === incomeAccountId)?.name || '')}</strong> · at <strong>${getFrequencyName(frequency).toLowerCase()}</strong> contribution of <strong>${formatMoneyDisplay(contribution)}</strong></p>`;
        }
      }
    } else if (solveFor === 'amount') {
      if (monthsToGoal <= 0) {
        error = 'Goal date must be in the future';
      } else if (contribution <= 0) {
        error = 'Contribution amount must be greater than 0';
      } else {
        const monthlyContribution = convertContributionFrequency(contribution, frequency, 3); // Convert to monthly
        const projectedAmount = calculateFutureValue(startingBalance, monthlyContribution, monthsToGoal, annualRate);
        summary = `<p><strong>Projected goal:</strong> <strong>${formatMoneyDisplay(projectedAmount)}</strong> · from <strong>${escapeHtml(selectableAccounts.find(a => a.id === incomeAccountId)?.name || '')}</strong> · with <strong>${getFrequencyName(frequency).toLowerCase()}</strong> contribution of <strong>${formatMoneyDisplay(contribution)}</strong> by <strong>${selectedAccount.goalDate}</strong></p>`;
      }
    }

    if (error) {
      summaryEl.innerHTML = `<p class="error-message">${error}</p>`;
      generateBtnEl.disabled = true;
    } else {
      summaryEl.innerHTML = summary;
      generateBtnEl.disabled = false;
    }
  }

  accountSelect.addEventListener('change', updateSummary);
  incomeAccountSelect.addEventListener('change', updateSummary);
  solveForSelect.addEventListener('change', () => {
    // Reset contribution when changing solve-for
    if (solveForSelect.value !== 'contribution') {
      contributionInput.disabled = false;
      contributionInput.focus();
    } else {
      contributionInput.disabled = true;
    }
    updateSummary();
  });
  frequencySelect.addEventListener('change', updateSummary);
  contributionInput.addEventListener('input', updateSummary);

  // Handle Generate button
  generateBtnEl.addEventListener('click', async () => {
    const selectedId = parseInt(accountSelect.value);
    if (!selectedId) {
      notifyError('Please select an account');
      return;
    }

    const incomeAccountId = parseInt(incomeAccountSelect.value);
    if (!incomeAccountId) {
      notifyError('Please select an income account');
      return;
    }

    const selectedAccount = displayAccounts.find(a => a.id === selectedId);
    const solveFor = solveForSelect.value;
    if (!selectedAccount || !selectedAccount.goalDate) {
      notifyError('Account does not have a goal date set');
      return;
    }

    const rawGoalAmount = selectedAccount.goalAmount;
    const hasGoalAmount = rawGoalAmount !== null && rawGoalAmount !== undefined && rawGoalAmount !== '';
    if ((solveFor === 'contribution' || solveFor === 'date') && !hasGoalAmount) {
      notifyError('Set Goal Amount to solve for contribution or date');
      return;
    }

    const frequency = parseInt(frequencySelect.value);
    const contribution = parseFloat(contributionInput.value) || 0;
    const planStart = planningWindow?.startDate || formatDateOnly(new Date());
    const planEnd = planningWindow?.endDate || selectedAccount.goalDate || planStart;

    if (selectedAccount.goalDate < planStart) {
      notifyError(`Goal Date must be on/after planning start (${planStart}).`);
      return;
    }
    if (selectedAccount.goalDate > planEnd) {
      notifyError(`Goal Date (${selectedAccount.goalDate}) is after planning end (${planEnd}).`);
      return;
    }

    const monthsToGoal = calculateMonthsBetweenDates(planStart, selectedAccount.goalDate);
    const startingBalance = selectedAccount.startingBalance || 0;
    const goalAmount = Number(selectedAccount.goalAmount ?? 0);
    const annualRate = selectedAccount.periodicChange?.rateValue || 0;

    let monthlyContribution = contribution;

    // Calculate contribution amount if not already solved for
    if (solveFor === 'contribution') {
      monthlyContribution = calculateContributionAmount(startingBalance, goalAmount, monthsToGoal, annualRate);
    } else {
      monthlyContribution = convertContributionFrequency(contribution, frequency, 3);
    }

    const scheduledContribution = convertContributionFrequency(monthlyContribution, 3, frequency);

    // Create the transaction
    try {
      const frequencyLookup = lookupData.frequencies.find(f => f.id === frequency);
      const scenario = scenarioState?.get?.();
      const transactions = scenario?.transactions || [];

      // Remove any existing goal-generated transactions for this account
      const filteredTransactions = transactions.filter(tx => {
        const isGoalGenerated = tx.tags && tx.tags.includes('goal-generated');
        const isForThisAccount = tx.primaryAccountId === selectedId;
        return !(isGoalGenerated && isForThisAccount);
      });

      // Map frequency ID to recurrence type
      const frequencyToRecurrenceType = {
        1: { id: 2, name: 'Daily' },
        2: { id: 3, name: 'Weekly' },
        3: { id: 4, name: 'Monthly - Day of Month' },
        4: { id: 6, name: 'Quarterly' },
        5: { id: 7, name: 'Yearly' }
      };

      const startDateStr = planStart;
      const endDateStr = selectedAccount.goalDate;
      const anchor = startDateStr ? parseDateOnly(startDateStr) : new Date();

      // Generate recurring transaction with proper recurrence structure
      const newTransaction = {
        id: 0, // Will be assigned by manager
        primaryAccountId: selectedId,
        secondaryAccountId: incomeAccountId,
        transactionTypeId: 1, // Money In
        amount: Math.abs(scheduledContribution),
        effectiveDate: startDateStr,
        description: `Goal: ${selectedAccount.name}`,
        recurrence: {
          recurrenceType: frequencyToRecurrenceType[frequency] || { id: 3, name: 'Weekly' },
          startDate: startDateStr,
          endDate: endDateStr,
          interval: 1,
          dayOfWeek: frequency === 2 ? { id: anchor.getDay(), name: '' } : null,
          dayOfMonth: frequency === 3 ? anchor.getDate() : null,
          weekOfMonth: null,
          dayOfWeekInMonth: null,
          dayOfQuarter: null,
          month: null,
          dayOfYear: null,
          customDates: null
        },
        periodicChange: selectedAccount.periodicChange || null,
        status: { name: 'planned' },
        tags: ['goal-generated']
      };

      // Use filtered transactions list (without old goal-generated transactions)
      filteredTransactions.push(newTransaction);
      await TransactionManager.saveAll(scenario.id, filteredTransactions);

      // Reload everything
      const refreshed = await getScenario(scenario.id);
      scenarioState?.set?.(refreshed);

      await loadMasterTransactionsGrid(document.getElementById('transactionsTable'));
      await loadProjectionsSection(document.getElementById('projectionsContent'));

      // Format currency for alert message (plain text, no HTML)
      const formattedAmount = formatCurrency(Math.abs(scheduledContribution));

      notifySuccess(`Goal plan generated! ${getFrequencyName(frequency).toLowerCase()} transaction of ${formattedAmount} created.`);

      // Reset form
      accountSelect.value = '';
      incomeAccountSelect.value = '';
      contributionInput.value = '';
      await updateSummary();
    } catch (err) {
      logger?.error?.('[GeneratePlan] Failed to generate plan:', err);
      notifyError('Failed to generate plan: ' + err.message);
    }
  });

  // Handle Reset button
  resetBtnEl.addEventListener('click', () => {
    accountSelect.value = '';
    incomeAccountSelect.value = '';
    solveForSelect.value = 'contribution';
    frequencySelect.value = '3';
    contributionInput.value = '';
    contributionInput.disabled = true;
    summaryEl.innerHTML = '<p class="text-muted">Select an account to begin</p>';
    generateBtnEl.disabled = true;
  });

  // Set initial state
  contributionInput.disabled = true;
  generateBtnEl.disabled = true;
}
