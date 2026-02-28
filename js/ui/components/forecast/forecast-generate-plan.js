// forecast-generate-plan.js
// Goal-based "Generate Plan" feature extracted from forecast.js (no behavior change).

import { loadLookup } from '../../../app/services/lookup-service.js';
import { formatMoneyDisplay } from '../grids/grid-factory.js';
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

  const planningWindow = getScenarioPlanningWindow(scenario, 'advancedGoalSolver');

  // --- Single consolidated card header (label + planning window dates + refresh) ---
  const solverHeader = document.createElement('div');
  solverHeader.className = 'dash-panel-header card-header card-header--filters-inline';

  const headerLeft = document.createElement('div');
  headerLeft.className = 'card-header-actions';
  const headerLabel = document.createElement('span');
  headerLabel.className = 'dash-panel-label';
  headerLabel.textContent = 'Advanced Goal Solver';
  headerLeft.appendChild(headerLabel);

  const headerControls = document.createElement('div');
  headerControls.className = 'card-header-controls';

  const startFilterItem = document.createElement('div');
  startFilterItem.className = 'header-filter-item';
  const startLabel = document.createElement('label');
  startLabel.textContent = 'Start:';
  const startInput = document.createElement('input');
  startInput.type = 'date';
  startInput.className = 'input-select';
  startInput.value = planningWindow?.startDate || '';
  startFilterItem.appendChild(startLabel);
  startFilterItem.appendChild(startInput);

  const endFilterItem = document.createElement('div');
  endFilterItem.className = 'header-filter-item';
  const endLabel = document.createElement('label');
  endLabel.textContent = 'End:';
  const endInput = document.createElement('input');
  endInput.type = 'date';
  endInput.className = 'input-select';
  endInput.value = planningWindow?.endDate || '';
  endFilterItem.appendChild(endLabel);
  endFilterItem.appendChild(endInput);

  headerControls.appendChild(startFilterItem);
  headerControls.appendChild(endFilterItem);

  const headerIconActions = document.createElement('div');
  headerIconActions.className = 'header-icon-actions';
  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'icon-btn';
  refreshBtn.title = 'Refresh';
  refreshBtn.textContent = '⟳';
  refreshBtn.addEventListener('click', async () => {
    try {
      refreshBtn.disabled = true;
      const current = scenarioState?.get?.();
      if (current?.id) {
        const refreshed = await getScenario(current.id);
        scenarioState?.set?.(refreshed);
      }
      await loadGeneratePlanSection({ container, scenarioState, workflowId, loadMasterTransactionsGrid, loadProjectionsSection, logger });
    } finally {
      if (refreshBtn.isConnected) refreshBtn.disabled = false;
    }
  });
  headerIconActions.appendChild(refreshBtn);

  solverHeader.appendChild(headerLeft);
  solverHeader.appendChild(headerControls);
  solverHeader.appendChild(headerIconActions);
  container.appendChild(solverHeader);

  let planWindowTimer = null;
  const schedulePlanWindowPersist = () => {
    clearTimeout(planWindowTimer);
    planWindowTimer = setTimeout(async () => {
      const next = normalizeDateRange({ startDate: startInput.value, endDate: endInput.value });
      if (next.startDate && next.endDate) {
        if (next.startDate !== startInput.value) startInput.value = next.startDate;
        if (next.endDate !== endInput.value) endInput.value = next.endDate;
        try {
          await persistPlanningWindow({ scenarioId: scenario.id, planningKey: 'advancedGoalSolver', nextWindow: next, scenarioState });
          await loadGeneratePlanSection({ container, scenarioState, workflowId, loadMasterTransactionsGrid, loadProjectionsSection, logger });
        } catch (err) {
          notifyError('Failed to save planning window: ' + (err?.message || String(err)));
        }
      }
    }, 200);
  };
  startInput.addEventListener('change', schedulePlanWindowPersist);
  endInput.addEventListener('change', schedulePlanWindowPersist);

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

  // --- Side-by-side panels for Constraints + Goals ---
  const solverPanels = document.createElement('div');
  solverPanels.className = 'middle-panels solver-panels';

  // Constraints panel
  const constraintsPanel = document.createElement('div');
  constraintsPanel.className = 'dash-panel forecast-card';
  const constraintsPanelHeader = document.createElement('div');
  constraintsPanelHeader.className = 'dash-panel-header card-header';
  const constraintsPanelLeft = document.createElement('div');
  constraintsPanelLeft.className = 'card-header-actions';
  const constraintsPanelLabel = document.createElement('span');
  constraintsPanelLabel.className = 'dash-panel-label';
  constraintsPanelLabel.textContent = 'Constraints';
  constraintsPanelLeft.appendChild(constraintsPanelLabel);
  const constraintsHeaderActions = document.createElement('div');
  constraintsHeaderActions.className = 'header-icon-actions';
  const addConstraintBtn = document.createElement('button');
  addConstraintBtn.className = 'icon-btn';
  addConstraintBtn.title = 'Add Constraint (start with Funding Account)';
  addConstraintBtn.textContent = '+';
  constraintsHeaderActions.appendChild(addConstraintBtn);
  constraintsPanelHeader.appendChild(constraintsPanelLeft);
  constraintsPanelHeader.appendChild(constraintsHeaderActions);
  const constraintsPanelBody = document.createElement('div');
  constraintsPanelBody.className = 'dash-panel-body';
  const constraintsGridEl = document.createElement('div');
  constraintsGridEl.id = 'adv-constraints-grid';
  constraintsPanelBody.appendChild(constraintsGridEl);
  constraintsPanel.appendChild(constraintsPanelHeader);
  constraintsPanel.appendChild(constraintsPanelBody);

  // Goals panel
  const goalsPanel = document.createElement('div');
  goalsPanel.className = 'dash-panel forecast-card';
  const goalsPanelHeader = document.createElement('div');
  goalsPanelHeader.className = 'dash-panel-header card-header';
  const goalsPanelLeft = document.createElement('div');
  goalsPanelLeft.className = 'card-header-actions';
  const goalsPanelLabel = document.createElement('span');
  goalsPanelLabel.className = 'dash-panel-label';
  goalsPanelLabel.textContent = 'Goals';
  goalsPanelLeft.appendChild(goalsPanelLabel);
  const goalsHeaderActions = document.createElement('div');
  goalsHeaderActions.className = 'header-icon-actions';
  const addBtn = document.createElement('button');
  addBtn.className = 'icon-btn';
  addBtn.title = 'Add Goal';
  addBtn.textContent = '+';
  goalsHeaderActions.appendChild(addBtn);
  goalsPanelHeader.appendChild(goalsPanelLeft);
  goalsPanelHeader.appendChild(goalsHeaderActions);
  const goalsPanelBody = document.createElement('div');
  goalsPanelBody.className = 'dash-panel-body';
  const goalsGridEl = document.createElement('div');
  goalsGridEl.id = 'adv-goals-grid';
  goalsPanelBody.appendChild(goalsGridEl);
  goalsPanel.appendChild(goalsPanelHeader);
  goalsPanel.appendChild(goalsPanelBody);

  solverPanels.appendChild(constraintsPanel);
  solverPanels.appendChild(goalsPanel);
  container.appendChild(solverPanels);

  // --- Solution card ---
  const solutionCard = document.createElement('div');
  solutionCard.className = 'forecast-card';
  solutionCard.style.width = '100%';
  const solutionHeader = document.createElement('div');
  solutionHeader.className = 'dash-panel-header card-header';
  const solutionHeaderLeft = document.createElement('div');
  solutionHeaderLeft.className = 'card-header-actions';
  const solutionLabel = document.createElement('span');
  solutionLabel.className = 'dash-panel-label';
  solutionLabel.textContent = 'Solution';
  solutionHeaderLeft.appendChild(solutionLabel);
  const solutionHeaderActions = document.createElement('div');
  solutionHeaderActions.className = 'header-icon-actions';
  const solveBtn = document.createElement('button');
  solveBtn.className = 'icon-btn';
  solveBtn.title = 'Solve — calculate suggested transactions';
  solveBtn.textContent = '▶';
  const applyBtn = document.createElement('button');
  applyBtn.className = 'icon-btn';
  applyBtn.title = 'Apply — write transactions into this scenario';
  applyBtn.textContent = '✓';
  applyBtn.disabled = true;
  solutionHeaderActions.appendChild(solveBtn);
  solutionHeaderActions.appendChild(applyBtn);
  solutionHeader.appendChild(solutionHeaderLeft);
  solutionHeader.appendChild(solutionHeaderActions);
  const solutionBody = document.createElement('div');
  solutionBody.className = 'section-content';
  solutionBody.style.padding = '12px';
  const solutionTotalsEl = document.createElement('div');
  solutionTotalsEl.id = 'adv-goal-solution-totals';
  const solutionEl = document.createElement('div');
  solutionEl.id = 'adv-goal-solution';
  solutionEl.className = 'text-muted';
  solutionEl.textContent = 'Configure goals and click Solve.';
  solutionBody.appendChild(solutionTotalsEl);
  solutionBody.appendChild(solutionEl);
  solutionCard.appendChild(solutionHeader);
  solutionCard.appendChild(solutionBody);
  container.appendChild(solutionCard);

  restoreWindowScroll(scrollSnapshot);

  let lastSolve = null;

  const goalTypeOptions = buildGoalTypeOptions();
  const constraintTypeOptions = buildConstraintTypeOptions();

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

  // In-memory card rows (replaces Tabulator grids)
  let goalsRows = goals.map(normalizeGoalRow);
  let constraintsRows = buildConstraintRowsFromObject().map(normalizeConstraintRow);

  let persistTimer = null;
  const schedulePersist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(async () => {
      try { await persistNow(); } catch (err) { logger?.error?.('[AdvancedGoalSolver] Persist failed', err); }
    }, 250);
  };

  // ---- Constraint card builder ----
  const buildConstraintCard = (row, idx) => {
    const card = document.createElement('div');
    card.className = 'grid-summary-card';
    const rowEl = document.createElement('div');
    rowEl.style.cssText = 'display:flex;align-items:flex-start;gap:8px;width:100%;';

    const content = document.createElement('div');
    content.className = 'grid-summary-content';
    const form = document.createElement('div');
    form.className = 'grid-summary-form';
    form.style.marginTop = '0';

    const typeSelect = document.createElement('select');
    typeSelect.className = 'grid-summary-input';
    constraintTypeOptions.forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o.value; opt.textContent = o.label;
      typeSelect.appendChild(opt);
    });
    typeSelect.value = row.type;

    const accountSelect = document.createElement('select');
    accountSelect.className = 'grid-summary-input';
    const cNoneOpt = document.createElement('option');
    cNoneOpt.value = ''; cNoneOpt.textContent = '— None —';
    accountSelect.appendChild(cNoneOpt);
    accounts.forEach((a) => {
      const opt = document.createElement('option');
      opt.value = String(Number(a.id)); opt.textContent = a.name;
      accountSelect.appendChild(opt);
    });
    accountSelect.value = row.accountId != null ? String(Number(row.accountId)) : '';

    const amountInput = document.createElement('input');
    amountInput.type = 'number'; amountInput.className = 'grid-summary-input';
    amountInput.step = '0.01'; amountInput.placeholder = '0.00';
    amountInput.value = row.amount != null ? String(row.amount) : '';

    const makeCField = (label, el, full = false) => {
      const f = document.createElement('div');
      f.className = 'grid-summary-field' + (full ? ' form-field--full' : '');
      const lbl = document.createElement('label');
      lbl.className = 'grid-summary-label'; lbl.textContent = label;
      f.appendChild(lbl); f.appendChild(el); return f;
    };

    const accountField = makeCField('Account', accountSelect);
    const amountField = makeCField('Amount', amountInput);
    form.appendChild(makeCField('Type', typeSelect, true));
    form.appendChild(accountField);
    form.appendChild(amountField);
    content.appendChild(form);

    const updateCVisibility = () => {
      const t = typeSelect.value;
      accountField.style.display = t !== 'maxOutflow' ? '' : 'none';
      amountField.style.display = (t === 'maxOutflow' || t === 'accountCap' || t === 'minBalanceFloor') ? '' : 'none';
    };
    updateCVisibility();

    const toNumOrNull = (v) => (v === '' || v == null ? null : Number(v));
    const updateConstraintRow = () => {
      constraintsRows[idx] = normalizeConstraintRow({
        ...constraintsRows[idx],
        type: typeSelect.value,
        accountId: accountSelect.value !== '' ? Number(accountSelect.value) : null,
        amount: toNumOrNull(amountInput.value)
      });
      lastSolve = null; applyBtn.disabled = true; schedulePersist();
    };
    typeSelect.addEventListener('change', () => { updateCVisibility(); updateConstraintRow(); });
    accountSelect.addEventListener('change', updateConstraintRow);
    amountInput.addEventListener('input', updateConstraintRow);

    const actions = document.createElement('div');
    actions.className = 'grid-summary-actions';
    const cDeleteBtn = document.createElement('button');
    cDeleteBtn.className = 'icon-btn'; cDeleteBtn.title = 'Remove'; cDeleteBtn.textContent = '⨉';
    cDeleteBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      constraintsRows.splice(idx, 1); renderConstraintCards();
      lastSolve = null; applyBtn.disabled = true; await persistNow();
    });
    actions.appendChild(cDeleteBtn);
    rowEl.appendChild(content); rowEl.appendChild(actions);
    card.appendChild(rowEl); return card;
  };

  const renderConstraintCards = () => {
    constraintsGridEl.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'grid-summary-list';
    constraintsGridEl.appendChild(list);
    if (constraintsRows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'scenarios-list-placeholder';
      empty.textContent = 'No constraints. Add a Funding Account to start.';
      list.appendChild(empty); return;
    }
    constraintsRows.forEach((row, idx) => list.appendChild(buildConstraintCard(row, idx)));
  };

  // ---- Goal card builder ----
  const buildGoalCard = (row, idx) => {
    const card = document.createElement('div');
    card.className = 'grid-summary-card';
    const rowEl = document.createElement('div');
    rowEl.style.cssText = 'display:flex;align-items:flex-start;gap:8px;width:100%;';

    const content = document.createElement('div');
    content.className = 'grid-summary-content';
    const form = document.createElement('div');
    form.className = 'grid-summary-form';
    form.style.marginTop = '0';

    const toNumOrNull = (v) => (v === '' || v == null ? null : Number(v));

    const priorityInput = document.createElement('input');
    priorityInput.type = 'number'; priorityInput.className = 'grid-summary-input';
    priorityInput.min = '1'; priorityInput.step = '1'; priorityInput.value = String(row.priority);

    const accountSelect = document.createElement('select');
    accountSelect.className = 'grid-summary-input';
    const gNoneOpt = document.createElement('option');
    gNoneOpt.value = ''; gNoneOpt.textContent = '— Account —';
    accountSelect.appendChild(gNoneOpt);
    accounts.forEach((a) => {
      const opt = document.createElement('option');
      opt.value = String(Number(a.id)); opt.textContent = a.name;
      accountSelect.appendChild(opt);
    });
    accountSelect.value = row.accountId != null ? String(Number(row.accountId)) : '';

    const typeSelect = document.createElement('select');
    typeSelect.className = 'grid-summary-input';
    goalTypeOptions.forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o.value; opt.textContent = o.label;
      typeSelect.appendChild(opt);
    });
    typeSelect.value = row.type;

    const targetInput = document.createElement('input');
    targetInput.type = 'number'; targetInput.className = 'grid-summary-input';
    targetInput.step = '0.01'; targetInput.placeholder = '0.00';
    targetInput.value = row.targetAmount != null ? String(row.targetAmount) : '';

    const deltaInput = document.createElement('input');
    deltaInput.type = 'number'; deltaInput.className = 'grid-summary-input';
    deltaInput.step = '0.01'; deltaInput.placeholder = '0.00';
    deltaInput.value = row.deltaAmount != null ? String(row.deltaAmount) : '';

    const floorInput = document.createElement('input');
    floorInput.type = 'number'; floorInput.className = 'grid-summary-input';
    floorInput.step = '0.01'; floorInput.placeholder = '0.00';
    floorInput.value = row.floorAmount != null ? String(row.floorAmount) : '';

    const startDateInput = document.createElement('input');
    startDateInput.type = 'date'; startDateInput.className = 'grid-summary-input';
    startDateInput.value = row.startDate || '';

    const endDateInput = document.createElement('input');
    endDateInput.type = 'date'; endDateInput.className = 'grid-summary-input';
    endDateInput.value = row.endDate || '';

    const makeGField = (label, el, full = false) => {
      const f = document.createElement('div');
      f.className = 'grid-summary-field' + (full ? ' form-field--full' : '');
      const lbl = document.createElement('label');
      lbl.className = 'grid-summary-label'; lbl.textContent = label;
      f.appendChild(lbl); f.appendChild(el); return f;
    };

    const targetField = makeGField('Target', targetInput);
    const deltaField = makeGField('Delta', deltaInput);
    const floorField = makeGField('Floor', floorInput);
    form.appendChild(makeGField('Priority', priorityInput));
    form.appendChild(makeGField('Account', accountSelect));
    form.appendChild(makeGField('Type', typeSelect, true));
    form.appendChild(targetField);
    form.appendChild(deltaField);
    form.appendChild(floorField);
    form.appendChild(makeGField('Start', startDateInput));
    form.appendChild(makeGField('End', endDateInput));
    content.appendChild(form);

    const updateGAmountVisibility = () => {
      const t = typeSelect.value;
      targetField.style.display = (t === 'reach_balance_by_date' || t === 'pay_down_by_date') ? '' : 'none';
      deltaField.style.display = t === 'increase_by_delta' ? '' : 'none';
      floorField.style.display = t === 'maintain_floor' ? '' : 'none';
    };
    updateGAmountVisibility();

    const updateGoalRow = () => {
      goalsRows[idx] = normalizeGoalRow({
        ...goalsRows[idx],
        priority: Math.max(1, Number(priorityInput.value) || 1),
        accountId: accountSelect.value !== '' ? Number(accountSelect.value) : null,
        type: typeSelect.value,
        targetAmount: toNumOrNull(targetInput.value),
        deltaAmount: toNumOrNull(deltaInput.value),
        floorAmount: toNumOrNull(floorInput.value),
        startDate: startDateInput.value || null,
        endDate: endDateInput.value || null
      });
      lastSolve = null; applyBtn.disabled = true; schedulePersist();
    };
    typeSelect.addEventListener('change', () => { updateGAmountVisibility(); updateGoalRow(); });
    [priorityInput, accountSelect, targetInput, deltaInput, floorInput, startDateInput, endDateInput]
      .forEach((el) => el.addEventListener('change', updateGoalRow));
    [priorityInput, targetInput, deltaInput, floorInput]
      .forEach((el) => el.addEventListener('input', updateGoalRow));

    const actions = document.createElement('div');
    actions.className = 'grid-summary-actions';
    const gDeleteBtn = document.createElement('button');
    gDeleteBtn.className = 'icon-btn'; gDeleteBtn.title = 'Remove'; gDeleteBtn.textContent = '⨉';
    gDeleteBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      goalsRows.splice(idx, 1); renderGoalCards();
      lastSolve = null; applyBtn.disabled = true; await persistNow();
    });
    actions.appendChild(gDeleteBtn);
    rowEl.appendChild(content); rowEl.appendChild(actions);
    card.appendChild(rowEl); return card;
  };

  const renderGoalCards = () => {
    goalsGridEl.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'grid-summary-list';
    goalsGridEl.appendChild(list);
    if (goalsRows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'scenarios-list-placeholder';
      empty.textContent = 'No goals yet.';
      list.appendChild(empty); return;
    }
    goalsRows.forEach((row, idx) => list.appendChild(buildGoalCard(row, idx)));
  };

  renderConstraintCards();
  renderGoalCards();

  const persistNow = async () => {
    const nextConstraints = buildConstraintsObjectFromRows(constraintsRows);
    const nextSettings = {
      goals: goalsRows,
      constraints: { ...constraints, ...nextConstraints }
    };
    await persistAdvancedSettings({ scenarioId: scenario.id, nextSettings, scenarioState });
  };

  addBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    goalsRows.push(normalizeGoalRow({
      id: makeId(),
      priority: 1,
      accountId: null,
      type: 'reach_balance_by_date',
      targetAmount: null,
      deltaAmount: null,
      floorAmount: null,
      startDate: planningWindow?.startDate || null,
      endDate: planningWindow?.endDate || null
    }));
    renderGoalCards();
    await persistNow();
  });

  addConstraintBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    constraintsRows.push(normalizeConstraintRow({
      id: makeId(),
      type: 'lockedAccount',
      accountId: null,
      amount: null
    }));
    renderConstraintCards();
    await persistNow();
  });

  solveBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const latest = await persistAdvancedSettings({
        scenarioId: scenario.id,
        nextSettings: {
          goals: goalsRows,
          constraints: {
            ...constraints,
            ...buildConstraintsObjectFromRows(constraintsRows)
          }
        },
        scenarioState
      });

      const result = await solveAdvancedGoals({ scenario: latest, settings: latest.advancedGoalSettings });
      lastSolve = result;

      const lines = (result.explanation || []).map((l) => `<div>${escapeHtml(l)}</div>`).join('');
      const txCount = result.suggestedTransactions?.length || 0;
      const feasible = result.isFeasible;
      solutionTotalsEl.innerHTML = `
        <div class="grid-totals" style="grid-template-columns: repeat(2, 1fr);">
          <div class="grid-total-item">
            <div class="label">Transactions</div>
            <div class="value${txCount > 0 ? ' positive' : ' zero'}">${txCount}</div>
          </div>
          <div class="grid-total-item">
            <div class="label">Feasible</div>
            <div class="value${feasible ? ' positive' : ' negative'}">${feasible ? 'Yes' : 'No'}</div>
          </div>
        </div>
      `;
      solutionEl.className = 'solver-explanation';
      solutionEl.innerHTML = (result.explanation || []).map((l) => `<div class="solver-explanation-line">${escapeHtml(l)}</div>`).join('') || '<div class="solver-explanation-line">No explanation available.</div>';

      applyBtn.disabled = !feasible || txCount === 0;
    } catch (err) {
      logger?.error?.('[AdvancedGoalSolver] Solve failed', err);

      const message = err?.message ? String(err.message) : String(err || 'Unknown error');
      solutionTotalsEl.innerHTML = '';
      solutionEl.innerHTML = `
        <div class="error-message"><strong>Solve failed:</strong> ${escapeHtml(message)}</div>
        <div class="text-muted" style="margin-top:4px;">Check DevTools Console for more details.</div>
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
