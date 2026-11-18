// forecast-generate-plan.js
// Workshop scenario setup and goal strategies.

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
import { solveAdvancedGoals } from '../../../domain/utils/advanced-goal-solver.js?v=20260901-strategy-matrix-35';
import { createModal } from '../modals/modal-factory.js';
import { syncSelectionDialog } from '../widgets/account-selector-filter.js?v=20260901-account-group-filter-42';
import { createScenarioAccountSelectors } from '../widgets/scenario-account-select.js?v=workshop-accounts-1';
import { renderBusinessModel } from './forecast-business-model.js?v=workshop-activity-1';
import { WORKSHOP_STRATEGIES, SOLVER_STRATEGIES, resolveWorkshopStrategy, getSolverStrategyFields } from '../../../shared/workshop-strategies.js';


function normalizeDateRange({ startDate, endDate }) {
  const start = typeof startDate === 'string' && startDate ? startDate : null;
  const end = typeof endDate === 'string' && endDate ? endDate : null;
  if (!start && !end) return { startDate: null, endDate: null };
  if (!start) return { startDate: end, endDate: end };
  if (!end) return { startDate: start, endDate: start };
  return start <= end ? { startDate: start, endDate: end } : { startDate: end, endDate: start };
}

function getScenarioPlanningWindow(scenario, key) {
  const scenarioTimeframe = scenario?.timeframe || {};
  const projectionConfig = scenario?.projection?.config || {};
  const fallback = normalizeDateRange({
    startDate: scenarioTimeframe.startDate || projectionConfig.startDate || formatDateOnly(new Date()),
    endDate:
      scenarioTimeframe.endDate ||
      projectionConfig.endDate ||
      scenarioTimeframe.startDate ||
      projectionConfig.startDate ||
      formatDateOnly(new Date())
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
    strategy: 'balanced',
    allocationStrategy: 'parallel',
    payoffOrder: 'priority',
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
    { value: 'maintain_floor', label: 'Maintain floor' },
    { value: 'minimize_payment', label: 'Reach target (min payment)' }
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

function renderGoalWorkshopSimpleHeader({ container, planningWindow, onWindowChange }) {
  if (!container) return;
  container.querySelectorAll(':scope > .goal-workshop-header').forEach((el) => el.remove());

  const header = document.createElement('div');
  header.className = 'dash-panel-header card-header card-header--filters-inline goal-workshop-header';

  const headerLeft = document.createElement('div');
  headerLeft.className = 'card-header-actions';
  const headerLabel = document.createElement('span');
  headerLabel.className = 'dash-panel-label';
  headerLabel.textContent = 'Goal Contribution';
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


  header.appendChild(headerLeft);
  header.appendChild(headerControls);
  container.insertBefore(header, container.firstChild);

  if (onWindowChange) {
    let persistTimer = null;
    const schedulePersist = () => {
      clearTimeout(persistTimer);
      persistTimer = setTimeout(async () => {
        const next = normalizeDateRange({ startDate: startInput.value, endDate: endInput.value });
        if (next.startDate && next.endDate) {
          if (next.startDate !== startInput.value) startInput.value = next.startDate;
          if (next.endDate !== endInput.value) endInput.value = next.endDate;
          await onWindowChange(next);
        }
      }, 200);
    };
    startInput.addEventListener('change', schedulePersist);
    endInput.addEventListener('change', schedulePersist);
  }
}

async function loadAdvancedGoalSolverSection({
  container,
  scenarioState,
  onAccountsCreated,
  refreshAccounts,
  workflowId,
  loadMasterTransactionsGrid,
  loadProjectionsSection,
  isRenderCurrent = () => true,
  logger
}) {
  if (!isRenderCurrent()) return;
  const scenario = scenarioState?.get?.();
  if (!scenario) {
    container.innerHTML = '';
    const msg = document.createElement('div');
    msg.className = 'empty-message';
    msg.textContent = 'No scenario selected';
    container.appendChild(msg);
    return;
  }

  const scrollSnapshot = snapshotWindowScroll();
  container.innerHTML = '';

  const planningWindow = getScenarioPlanningWindow(scenario, 'advancedGoalSolver');
  const storedSettings = scenario.advancedGoalSettings || getDefaultAdvancedGoalSettings(scenario);
  const solverStrategy = resolveWorkshopStrategy(scenario);
  const strategyFields = getSolverStrategyFields(solverStrategy);
  const allocationStrategy = strategyFields.allocationStrategy;
  const payoffOrder = strategyFields.payoffOrder;
  const selectedStrategy = SOLVER_STRATEGIES.find((strategy) => strategy.value === solverStrategy);

  // --- Header with settings modal trigger ---
  const solverHeader = document.createElement('div');
  solverHeader.className = 'dash-panel-header card-header goal-workshop-header';

  const headerLeft = document.createElement('div');
  headerLeft.className = 'card-header-actions';
  const headerLabel = document.createElement('span');
  headerLabel.className = 'dash-panel-label';
  headerLabel.textContent = 'Goal Planning';
  headerLeft.appendChild(headerLabel);
  const strategyBadge = document.createElement('span');
  strategyBadge.className = 'goal-workshop-strategy-badge';
  strategyBadge.textContent = selectedStrategy.label;
  headerLeft.appendChild(strategyBadge);

  const headerIconActions = document.createElement('div');
  headerIconActions.className = 'header-icon-actions';
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'icon-btn';
  settingsBtn.type = 'button';
  settingsBtn.title = 'Settings';
  settingsBtn.setAttribute('aria-label', 'Goal Planning settings');
  settingsBtn.textContent = '⚙';
  headerIconActions.appendChild(settingsBtn);

  solverHeader.appendChild(headerLeft);
  solverHeader.appendChild(headerIconActions);
  container.appendChild(solverHeader);

  let planWindowTimer = null;
  const openHeaderModal = () => {
    const { modal, close } = createModal({ contentClass: 'modal-dialog' });
    modal.innerHTML = `
      <div class="modal-header">
        <h4 class="modal-title">Goal Planning Settings</h4>
        <button type="button" class="modal-close" title="Close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="modal-start-date">Planning Start Date:</label>
          <input type="date" id="modal-start-date" class="input-select" value="${planningWindow?.startDate || ''}" />
        </div>
        <div class="form-group">
          <label for="modal-end-date">Planning End Date:</label>
          <input type="date" id="modal-end-date" class="input-select" value="${planningWindow?.endDate || ''}" />
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn--secondary modal-close-btn">Close</button>
      </div>
    `;

    const startDateInput = modal.querySelector('#modal-start-date');
    const endDateInput = modal.querySelector('#modal-end-date');
    const closeBtn = modal.querySelector('.modal-close');
    const closeBtnFooter = modal.querySelector('.modal-close-btn');

    const schedulePersist = () => {
      clearTimeout(planWindowTimer);
      planWindowTimer = setTimeout(async () => {
        const next = normalizeDateRange({ startDate: startDateInput.value, endDate: endDateInput.value });
        if (next.startDate && next.endDate) {
          try {
            await persistPlanningWindow({ scenarioId: scenario.id, planningKey: 'advancedGoalSolver', nextWindow: next, scenarioState });
            await loadGeneratePlanSection({ container, scenarioState, refreshAccounts, workflowId, loadMasterTransactionsGrid, loadProjectionsSection, isRenderCurrent, logger });
          } catch (err) {
            notifyError('Failed to save planning window: ' + (err?.message || String(err)));
          }
        }
      }, 200);
    };

    startDateInput.addEventListener('change', schedulePersist);
    endDateInput.addEventListener('change', schedulePersist);


    closeBtn.addEventListener('click', close);
    closeBtnFooter.addEventListener('click', close);
  };

  settingsBtn.addEventListener('click', openHeaderModal);

  const accounts = (scenario.accounts || []).filter(a => a.name !== 'Select Account');
  const accountSelectors = createScenarioAccountSelectors({
    getScenario: () => scenario, isCurrent: isRenderCurrent,
    onError: error => notifyError(error.message),
    onCreated: (account, updated) => {
      accounts.push(account);
      return onAccountsCreated(updated);
    }
  });


  const settings = storedSettings;
  const goals = Array.isArray(settings.goals) ? settings.goals : [];
  const constraints = settings.constraints || {};

  // --- Three-panel layout for Constraints + Goals + Solution ---
  const solverPanels = document.createElement('div');
  solverPanels.className = 'middle-panels solver-panels';
  solverPanels.id = 'solver-panels';

  // Helper to create panel structure with accordion
  const createSolverPanel = (panelId, title, addBtnTitle) => {
    const panel = document.createElement('div');
    panel.className = 'dash-panel forecast-card';
    panel.id = panelId;

    const header = document.createElement('div');
    header.className = 'dash-panel-header card-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'card-header-actions';

    const chevron = document.createElement('span');
    chevron.className = 'dash-panel-chevron';
    chevron.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4.5l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    headerLeft.appendChild(chevron);

    const label = document.createElement('span');
    label.className = 'dash-panel-label';
    label.textContent = title;
    headerLeft.appendChild(label);

    const headerActions = document.createElement('div');
    headerActions.className = 'header-icon-actions';
    const addBtn = document.createElement('button');
    addBtn.className = 'icon-btn';
    addBtn.title = addBtnTitle;
    addBtn.textContent = '+';
    addBtn.dataset.panelId = panelId;
    headerActions.appendChild(addBtn);

    header.appendChild(headerLeft);
    header.appendChild(headerActions);

    const body = document.createElement('div');
    body.className = 'dash-panel-body';
    const grid = document.createElement('div');
    grid.id = `${panelId}-grid`;
    body.appendChild(grid);

    panel.appendChild(header);
    panel.appendChild(body);

    // Wire up accordion toggle
    header.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const isNarrow = window.matchMedia('(max-width: 1023px)').matches;
      if (isNarrow) {
        panel.classList.toggle('panel-collapsed');
      }
    });

    return { panel, header, body, grid, addBtn, label };
  };

  const constraintsInfo = createSolverPanel('adv-constraints-panel', 'Constraints', 'Add Constraint (start with Funding Account)');
  const goalsInfo = createSolverPanel('adv-goals-panel', 'Goals', 'Add Goal');
  const solutionInfo = createSolverPanel('adv-solution-panel', 'Solution', '');

  solverPanels.appendChild(constraintsInfo.panel);
  solverPanels.appendChild(goalsInfo.panel);
  solverPanels.appendChild(solutionInfo.panel);
  container.appendChild(solverPanels);

  // Hide solution add button (it has solve/apply buttons in header instead)
  solutionInfo.addBtn.style.display = 'none';

  // Reference IDs for later use
  const constraintsGridEl = constraintsInfo.grid;
  const goalsGridEl = goalsInfo.grid;
  const solutionBody = solutionInfo.body;

  // Solution header buttons area
  const solutionHeaderActions = solutionInfo.header.querySelector('.header-icon-actions');
  solutionHeaderActions.innerHTML = '';
  const solveBtn = document.createElement('button');
  solveBtn.className = 'btn btn--secondary goal-workshop-action';
  solveBtn.title = 'Solve — calculate suggested plan rules';
  solveBtn.textContent = 'Solve Plan';
  const applyBtn = document.createElement('button');
  applyBtn.className = 'btn btn--primary goal-workshop-action';
  applyBtn.title = 'Apply — add plan rules to this scenario';
  applyBtn.textContent = 'Apply Plan';
  applyBtn.disabled = true;
  solutionHeaderActions.appendChild(solveBtn);
  solutionHeaderActions.appendChild(applyBtn);

  const solutionTotalsEl = document.createElement('div');
  solutionTotalsEl.id = 'adv-goal-solution-totals';
  const solutionEl = document.createElement('div');
  solutionEl.id = 'adv-goal-solution';
  solutionEl.className = 'text-muted';
  solutionEl.textContent = `${selectedStrategy.description} Configure goals and constraints, then solve and review the proposed rules.`;
  solutionBody.appendChild(solutionTotalsEl);
  solutionBody.appendChild(solutionEl);

  const addConstraintBtn = constraintsInfo.addBtn;
  const addBtn = goalsInfo.addBtn;

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
      minimumMonthlyAmount: toNumOrNull(row.minimumMonthlyAmount),
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

  // ---- Constraint card builder with summary/detail toggle ----
  const buildConstraintCard = (row, idx) => {
    const card = document.createElement('div');
    card.className = 'grid-summary-card';
    card.dataset.expanded = 'false';
    const rowEl = document.createElement('div');
    rowEl.style.cssText = 'display:flex;align-items:flex-start;gap:8px;width:100%;';

    // Summary view (collapsed state)
    const summaryEl = document.createElement('div');
    summaryEl.className = 'grid-summary-card-summary';
    summaryEl.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;cursor:pointer;';
    const summaryText = document.createElement('div');
    summaryText.className = 'grid-summary-card-summary-text';
    const typeLabel = constraintTypeOptions.find((o) => o.value === row.type)?.label || row.type;
    const accountName = row.accountId ? accounts.find((a) => Number(a.id) === row.accountId)?.name || `Account ${row.accountId}` : '—';
    const amountDisplay = row.amount != null ? formatCurrency(row.amount) : '—';
    summaryText.textContent = `${typeLabel} • ${accountName} • ${amountDisplay}`;
    summaryEl.appendChild(summaryText);
    const chevron = document.createElement('span');
    chevron.className = 'grid-summary-card-chevron';
    chevron.textContent = '▶';
    chevron.style.cssText = 'flex-shrink:0;font-size:10px;transition:transform 200ms;';
    summaryEl.appendChild(chevron);
    rowEl.appendChild(summaryEl);

    const content = document.createElement('div');
    content.className = 'grid-summary-content';
    content.style.display = 'none';
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

    const accountSelect = accountSelectors.create({
      label: 'Constraint account', selectedId: row.accountId, emptyLabel: '— None —'
    });
    accountSelect.classList.add('grid-summary-input');

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
    actions.style.display = 'none';
    const cDeleteBtn = document.createElement('button');
    cDeleteBtn.className = 'icon-btn'; cDeleteBtn.title = 'Remove'; cDeleteBtn.textContent = '⨉';
    cDeleteBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      constraintsRows.splice(idx, 1); renderConstraintCards();
      lastSolve = null; applyBtn.disabled = true; await persistNow();
    });
    actions.appendChild(cDeleteBtn);

    // Toggle summary/detail on click
    summaryEl.addEventListener('click', () => {
      const isExpanded = card.dataset.expanded === 'true';
      card.dataset.expanded = isExpanded ? 'false' : 'true';
      content.style.display = isExpanded ? 'none' : '';
      actions.style.display = isExpanded ? 'none' : '';
      chevron.style.transform = isExpanded ? '' : 'rotate(90deg)';
    });

    rowEl.appendChild(content); rowEl.appendChild(actions);
    card.appendChild(rowEl); return card;
  };

  const renderConstraintCards = () => {
    constraintsInfo.label.textContent = `Constraints · ${constraintsRows.length}`;
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

  // ---- Goal card builder with summary/detail toggle ----
  const buildGoalCard = (row, idx) => {
    const card = document.createElement('div');
    card.className = 'grid-summary-card';
    card.dataset.expanded = 'false';
    const rowEl = document.createElement('div');
    rowEl.style.cssText = 'display:flex;align-items:flex-start;gap:8px;width:100%;';

    // Summary view (collapsed state)
    const summaryEl = document.createElement('div');
    summaryEl.className = 'grid-summary-card-summary';
    summaryEl.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;cursor:pointer;';
    const summaryText = document.createElement('div');
    summaryText.className = 'grid-summary-card-summary-text';
    const typeLabel = goalTypeOptions.find((o) => o.value === row.type)?.label || row.type;
    const accountName = row.accountId ? accounts.find((a) => Number(a.id) === row.accountId)?.name || `Account ${row.accountId}` : '—';
    const targetDisplay = (row.targetAmount != null || row.deltaAmount != null || row.floorAmount != null) ? formatCurrency(row.targetAmount || row.deltaAmount || row.floorAmount) : '—';
    const dueDisplay = row.type === 'minimize_payment'
      ? 'Through plan window'
      : (row.endDate || 'No due date');
    const minimumDisplay = row.minimumMonthlyAmount != null
      ? ` • Min ${formatCurrency(row.minimumMonthlyAmount)}/mo`
      : '';
    summaryText.textContent = `P${row.priority} • ${accountName} • ${typeLabel} • ${targetDisplay}${minimumDisplay} • ${dueDisplay}`;
    summaryEl.appendChild(summaryText);
    const chevron = document.createElement('span');
    chevron.className = 'grid-summary-card-chevron';
    chevron.textContent = '▶';
    chevron.style.cssText = 'flex-shrink:0;font-size:10px;transition:transform 200ms;';
    summaryEl.appendChild(chevron);
    rowEl.appendChild(summaryEl);

    const content = document.createElement('div');
    content.className = 'grid-summary-content';
    content.style.display = 'none';
    const form = document.createElement('div');
    form.className = 'grid-summary-form';
    form.style.marginTop = '0';

    const toNumOrNull = (v) => (v === '' || v == null ? null : Number(v));

    const priorityInput = document.createElement('input');
    priorityInput.type = 'number'; priorityInput.className = 'grid-summary-input';
    priorityInput.min = '1'; priorityInput.step = '1'; priorityInput.value = String(row.priority);

    const accountSelect = accountSelectors.create({
      label: 'Goal account', selectedId: row.accountId, emptyLabel: '— Account —'
    });
    accountSelect.classList.add('grid-summary-input');

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

    const minimumMonthlyInput = document.createElement('input');
    minimumMonthlyInput.type = 'number'; minimumMonthlyInput.className = 'grid-summary-input';
    minimumMonthlyInput.min = '0'; minimumMonthlyInput.step = '0.01'; minimumMonthlyInput.placeholder = '0.00';
    minimumMonthlyInput.value = row.minimumMonthlyAmount != null ? String(row.minimumMonthlyAmount) : '';

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
      if (!el.id) {
        el.id = `adv-goal-${idx}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
      }
      lbl.htmlFor = el.id;
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
    const minimumMonthlyField = makeGField('Contractual Minimum / Month', minimumMonthlyInput, true);
    form.appendChild(minimumMonthlyField);
    form.appendChild(makeGField('Start', startDateInput));
    const endDateFieldEl = makeGField('End', endDateInput);
    form.appendChild(endDateFieldEl);
    content.appendChild(form);

    const endDateField = document.querySelector('[data-end-date-field]') || endDateInput.parentElement;
    const updateGAmountVisibility = () => {
      const t = typeSelect.value;
      targetField.style.display = (t === 'reach_balance_by_date' || t === 'pay_down_by_date' || t === 'minimize_payment') ? '' : 'none';
      deltaField.style.display = t === 'increase_by_delta' ? '' : 'none';
      floorField.style.display = t === 'maintain_floor' ? '' : 'none';
      minimumMonthlyField.style.display = t === 'maintain_floor' ? 'none' : '';
      if (endDateInput.parentElement) {
        endDateInput.parentElement.style.display = (t === 'minimize_payment') ? 'none' : '';
      }
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
        minimumMonthlyAmount: toNumOrNull(minimumMonthlyInput.value),
        startDate: startDateInput.value || null,
        endDate: endDateInput.value || null
      });
      lastSolve = null; applyBtn.disabled = true; schedulePersist();
    };
    typeSelect.addEventListener('change', () => { updateGAmountVisibility(); updateGoalRow(); });
    [priorityInput, accountSelect, targetInput, deltaInput, floorInput, minimumMonthlyInput, startDateInput, endDateInput]
      .forEach((el) => el.addEventListener('change', updateGoalRow));
    [priorityInput, targetInput, deltaInput, floorInput, minimumMonthlyInput]
      .forEach((el) => el.addEventListener('input', updateGoalRow));

    const actions = document.createElement('div');
    actions.className = 'grid-summary-actions';
    actions.style.display = 'none';
    const gDeleteBtn = document.createElement('button');
    gDeleteBtn.className = 'icon-btn'; gDeleteBtn.title = 'Remove'; gDeleteBtn.textContent = '⨉';
    gDeleteBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      goalsRows.splice(idx, 1); renderGoalCards();
      lastSolve = null; applyBtn.disabled = true; await persistNow();
    });
    actions.appendChild(gDeleteBtn);

    // Toggle summary/detail on click
    summaryEl.addEventListener('click', () => {
      const isExpanded = card.dataset.expanded === 'true';
      card.dataset.expanded = isExpanded ? 'false' : 'true';
      content.style.display = isExpanded ? 'none' : '';
      actions.style.display = isExpanded ? 'none' : '';
      chevron.style.transform = isExpanded ? '' : 'rotate(90deg)';
    });

    rowEl.appendChild(content); rowEl.appendChild(actions);
    card.appendChild(rowEl); return card;
  };

  const renderGoalCards = () => {
    goalsInfo.label.textContent = `Goals · ${goalsRows.length}`;
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
      strategy: solverStrategy,
      allocationStrategy,
      payoffOrder,
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
      minimumMonthlyAmount: null,
      startDate: planningWindow?.startDate || null,
      endDate: planningWindow?.endDate || null
    }));
    renderGoalCards();
    await persistNow();
  });

  addConstraintBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const hasFundingAccount = constraintsRows.some((row) => row.type === 'fundingAccount');
    const hasMonthlyCapacity = constraintsRows.some((row) => row.type === 'maxOutflow');
    constraintsRows.push(normalizeConstraintRow({
      id: makeId(),
      type: !hasFundingAccount ? 'fundingAccount' : (!hasMonthlyCapacity ? 'maxOutflow' : 'lockedAccount'),
      accountId: null,
      amount: null
    }));
    renderConstraintCards();
    await persistNow();
  });

  solveBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    solveBtn.disabled = true;
    solveBtn.textContent = 'Solving…';
    applyBtn.disabled = true;
    try {
      const latest = await persistAdvancedSettings({
        scenarioId: scenario.id,
        nextSettings: {
          strategy: solverStrategy,
          allocationStrategy,
          payoffOrder,
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

      const txCount = result.suggestedTransactions?.length || 0;
      const feasible = result.isFeasible;
      const strategyLabel = SOLVER_STRATEGIES.find((strategy) =>
        strategy.value === (result.strategy || solverStrategy)
      )?.label || selectedStrategy.label;
      const goalResults = Array.isArray(result.goalResults) ? result.goalResults : [];
      const readyGoals = goalResults.filter((goal) => goal.status === 'ready').length;
      solutionInfo.label.textContent = `Solution · ${feasible ? 'Ready' : 'Review'}`;
      const capacityText = result.effectiveMonthlyCapacity != null
        ? formatCurrency(result.effectiveMonthlyCapacity)
        : 'No cap';
      solutionTotalsEl.innerHTML = `
        <div class="goal-solution-status ${feasible ? 'is-ready' : 'needs-attention'}">
          <div>
            <div class="goal-solution-status-title">${feasible ? (txCount > 0 ? 'Plan ready to apply' : 'Goals already satisfied') : 'Plan needs attention'}</div>
            <div class="goal-solution-status-copy">${escapeHtml(strategyLabel)}</div>
          </div>
          <div class="goal-solution-status-mark">${feasible ? '✓' : '!'}</div>
        </div>
        <div class="goal-solution-metrics">
          <div><span>Goals ready</span><strong>${readyGoals}/${goalResults.length}</strong></div>
          <div><span>Suggested Plan Rules</span><strong>${txCount}</strong></div>
          <div><span>Monthly capacity</span><strong>${escapeHtml(capacityText)}</strong></div>
          <div><span>Capacity source</span><strong>${result.capacityWasDerived ? 'Derived' : 'Constraint'}</strong></div>
          <div><span>Contractual minimums</span><strong>${escapeHtml(formatCurrency(result.minimumMonthlyTotal || 0))}</strong></div>
          <div><span>Starting point</span><strong>${result.rebasedFromActuals ? 'Current plan + actuals' : 'Starting balances'}</strong></div>
        </div>
      `;

      const accountNameById = (accountId) =>
        accounts.find((account) => Number(account.id) === Number(accountId))?.name || `Account ${accountId}`;

      const review = document.createElement('div');
      review.className = 'goal-solution-review';

      if (goalResults.length > 0) {
        const goalsReview = document.createElement('div');
        goalsReview.className = 'goal-solution-goals';
        goalsReview.innerHTML = '<div class="goal-solution-section-title">Goal outcomes</div>';
        goalResults.forEach((goal) => {
          const goalRow = document.createElement('div');
          goalRow.className = `goal-solution-goal ${goal.status === 'ready' ? 'is-ready' : 'needs-attention'}`;
          goalRow.innerHTML = `
            <div>
              <strong>P${escapeHtml(goal.priority)} · ${escapeHtml(goal.accountName)}</strong>
              <span>${escapeHtml(goal.startDate || '—')} → ${escapeHtml(goal.endDate || '—')} · baseline ${escapeHtml(formatCurrency(goal.baselineEndBalance || 0))} · ${goal.ruleCount} rule${goal.ruleCount === 1 ? '' : 's'}</span>
            </div>
            <span class="goal-solution-goal-state">${goal.status === 'ready' ? 'Ready' : `Short ${escapeHtml(formatCurrency(goal.shortfall || 0))}`}</span>
          `;
          goalsReview.appendChild(goalRow);
        });
        review.appendChild(goalsReview);
      }

      const notes = [
        ...(result.issues || []).map((message) => ({ kind: 'issue', message })),
        ...(result.warnings || []).map((message) => ({ kind: 'warning', message })),
        ...(result.explanation || []).filter((message) => message && !String(message).startsWith('-')).map((message) => ({ kind: 'info', message }))
      ];
      if (notes.length > 0) {
        const noteList = document.createElement('div');
        noteList.className = 'goal-solution-notes';
        noteList.innerHTML = '<div class="goal-solution-section-title">Solver notes</div>';
        notes.forEach(({ kind, message }) => {
          const note = document.createElement('div');
          note.className = `goal-solution-note ${kind}`;
          note.textContent = message;
          noteList.appendChild(note);
        });
        review.appendChild(noteList);
      }

      const txList = document.createElement('div');
      txList.className = 'goal-solution-rules';
      const txTitle = document.createElement('div');
      txTitle.className = 'goal-solution-section-title';
      txTitle.textContent = 'Proposed plan rules';
      txList.appendChild(txTitle);

      if (txCount > 0) {
        result.suggestedTransactions.forEach((tx) => {
          const card = document.createElement('div');
          card.className = 'goal-solution-rule';
          const fromName = tx.secondaryAccountId ? accountNameById(tx.secondaryAccountId) : 'External funding';
          const toName = accountNameById(tx.primaryAccountId);
          const schedule = tx.recurrence
            ? `Monthly · ${tx.recurrence.startDate || tx.effectiveDate} → ${tx.recurrence.endDate || 'No end'}`
            : `One time · ${tx.effectiveDate || '—'}`;
          card.innerHTML = `
            <div class="goal-solution-rule-main">
              <strong>${escapeHtml(toName)}</strong>
              <span>${escapeHtml(fromName)} → ${escapeHtml(toName)}</span>
              <span>${escapeHtml(tx.description || 'Generated plan rule')}</span>
            </div>
            <div class="goal-solution-rule-value">
              <strong>${escapeHtml(formatCurrency(tx.amount))}</strong>
              <span>${escapeHtml(schedule)}</span>
            </div>
          `;
          txList.appendChild(card);
        });
      } else {
        const empty = document.createElement('div');
        empty.className = 'scenarios-list-placeholder';
        empty.textContent = 'No plan rules can be generated with the current inputs.';
        txList.appendChild(empty);
      }
      review.appendChild(txList);
      solutionEl.innerHTML = '';
      solutionEl.appendChild(review);
      solutionEl.className = '';

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
    } finally {
      solveBtn.disabled = false;
      solveBtn.textContent = 'Solve Plan';
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
      if (!isRenderCurrent()) return;
      const existing = refreshedScenario?.transactions || [];

      const filtered = existing.filter((tx) => !(tx.tags && tx.tags.includes('adv-goal-generated')));
      const nextTxs = [...filtered, ...lastSolve.suggestedTransactions];

      await TransactionManager.saveAll(refreshedScenario.id, nextTxs);

      const refreshed = await getScenario(refreshedScenario.id);
      if (!isRenderCurrent()) return;
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

export async function loadGeneratePlanSection(options) {
  const { container, scenarioState, refreshAccounts, isRenderCurrent = () => true } = options;
  if (!isRenderCurrent()) return;
  const scenario = scenarioState?.get?.();
  const strategy = resolveWorkshopStrategy(scenario);
  const active = () => isRenderCurrent() && scenarioState?.get?.()?.id === scenario?.id;
  const onAccountsCreated = async updated => {
    if (!active()) return;
    scenarioState.set(updated);
    await refreshAccounts?.();
  };
  if (!scenario) return renderGoalPlanSection(options);
  if (strategy === 'business') {
    container.replaceChildren();
    renderBusinessModel({
      container, scenario, isRenderCurrent: active,
      getScenario: () => getScenario(scenario.id),
      onAccountsCreated,
      onSave: async businessModel => {
        await ScenarioManager.saveWorkshopSetup(scenario.id, { businessModel });
        scenarioState.set(await getScenario(scenario.id));
      }
    });
  } else {
    await renderGoalPlanSection({ ...options, onAccountsCreated });
  }
  if (!active()) return;
  const bar = document.createElement('label');
  bar.className = 'business-row-heading workshop-strategy-selector';
  bar.append('Strategy');
  const select = document.createElement('select');
  select.className = 'input-select';
  select.setAttribute('aria-label', 'Scenario setup strategy');
  select.append(...WORKSHOP_STRATEGIES.map(({ label, value }) => new Option(label, value)));
  select.value = strategy;
  select.addEventListener('change', async () => {
    select.disabled = true;
    try {
      await ScenarioManager.saveWorkshopSetup(scenario.id, { strategy: select.value });
      const refreshed = await getScenario(scenario.id);
      if (!active()) return;
      scenarioState.set(refreshed);
      await loadGeneratePlanSection(options);
    } catch (error) {
      if (active()) {
        select.value = strategy;
        notifyError(error.message);
      }
    } finally {
      select.disabled = false;
    }
  });
  bar.append(select);
  container.querySelector(':scope > .workshop-strategy-selector')?.remove();
  container.prepend(bar);
}

async function renderGoalPlanSection({
  container,
  scenarioState,
  onAccountsCreated,
  refreshAccounts,
  workflowId = null,
  loadMasterTransactionsGrid,
  loadProjectionsSection,
  isRenderCurrent = () => true,
  logger
}) {
  if (!isRenderCurrent()) return;
  const currentScenario = scenarioState?.get?.();
  if (!currentScenario) {
    container.innerHTML = '';
    const msg = document.createElement('div');
    msg.className = 'empty-message';
    msg.textContent = 'No scenario selected';
    container.appendChild(msg);
    return;
  }

  if (getSolverStrategyFields(resolveWorkshopStrategy(currentScenario))) {
    return loadAdvancedGoalSolverSection({
      container,
      scenarioState,
      onAccountsCreated,
      refreshAccounts,
      workflowId,
      loadMasterTransactionsGrid,
      loadProjectionsSection,
      isRenderCurrent,
      logger
    });
  }

  const accountSelectors = createScenarioAccountSelectors({
    getScenario: () => currentScenario, isCurrent: isRenderCurrent,
    onError: error => notifyError(error.message),
    onCreated: (_account, updated) => onAccountsCreated(updated)
  });
  const findAccount = id => currentScenario.accounts?.find(account => Number(account.id) === id);

  const scrollSnapshot = snapshotWindowScroll();
  container.innerHTML = '';

  const planningWindow = getScenarioPlanningWindow(currentScenario, 'generatePlan');
  renderGoalWorkshopSimpleHeader({
    container,
    planningWindow,
    onWindowChange: async (nextWindow) => {
      try {
        await persistPlanningWindow({
          scenarioId: currentScenario.id,
          planningKey: 'generatePlan',
          nextWindow,
          scenarioState
        });
        await loadGeneratePlanSection({ container, scenarioState, refreshAccounts, workflowId, loadMasterTransactionsGrid, loadProjectionsSection, isRenderCurrent, logger });
      } catch (err) {
        notifyError('Failed to save planning window: ' + (err?.message || String(err)));
      }
    }
  });

  const formContainer = document.createElement('div');
  const introDiv = document.createElement('div');
  introDiv.className = 'text-muted';
  introDiv.style.marginBottom = '10px';
  introDiv.innerHTML = `
    Use this section to estimate a contribution plan for an account goal and then create recurring plan rules.
    <br />
    Choose an account with a <strong>Goal Amount</strong> and <strong>Goal Date</strong>, or add a new one from the Goal Account picker.
    <br />
    <span class="text-muted">Note: this simple planner uses the account’s base periodic change rate (it does not use a rate schedule).</span>
  `;
  window.add(formContainer, introDiv);

  // Account selector
  const accountRowDiv = document.createElement('div');
  accountRowDiv.innerHTML = `
    <label for="goal-account-select" class="control-label">Goal Account:</label>
    <span data-account-picker></span>
    <div class="text-muted" style="margin-top:4px;">This is the account you want to reach a target balance on by the goal date.</div>
  `;
  window.add(formContainer, accountRowDiv);

  // Income account selector (source)
  const incomeRowDiv = document.createElement('div');
  incomeRowDiv.innerHTML = `
    <label for="goal-income-account-select" class="control-label">Income Account:</label>
    <span data-account-picker></span>
    <div class="text-muted" style="margin-top:4px;">Source account used for the planned contributions.</div>
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
    <div class="text-muted" style="margin-top:4px;">Controls how often the planned contribution repeats.</div>
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
  generateBtn.className = 'icon-btn icon-btn--primary';
  generateBtn.textContent = '▶ Generate Plan';
  generateBtn.id = 'goal-generate-btn';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'icon-btn';
  resetBtn.textContent = '↺ Reset';
  resetBtn.id = 'goal-reset-btn';

  window.add(buttonDiv, generateBtn);
  window.add(buttonDiv, resetBtn);
  window.add(formContainer, buttonDiv);

  window.add(container, formContainer);

  restoreWindowScroll(scrollSnapshot);

  // Attach event listeners
  const accountSelect = accountSelectors.create({
    label: 'Goal Account', emptyLabel: '-- Choose an account --', requireGoal: true,
    getAccountLabel: account => `${account.name} (Goal: ${formatMoneyDisplay(account.goalAmount)} by ${account.goalDate})`
  });
  const incomeAccountSelect = accountSelectors.create({
    label: 'Income Account', emptyLabel: '-- Choose an account --'
  });
  accountSelect.id = 'goal-account-select';
  incomeAccountSelect.id = 'goal-income-account-select';
  accountSelect.classList.add('input-select');
  incomeAccountSelect.classList.add('input-select');
  accountRowDiv.querySelector('[data-account-picker]').replaceWith(accountSelect);
  incomeRowDiv.querySelector('[data-account-picker]').replaceWith(incomeAccountSelect);
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
    const selectedAccount = findAccount(selectedId);
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
        summary = `<p><strong>${getFrequencyName(frequency).toLowerCase()}</strong> contribution: <strong>${formatMoneyDisplay(displayContribution)}</strong> · from <strong>${escapeHtml(findAccount(incomeAccountId)?.name || '')}</strong> · to reach <strong>${formatMoneyDisplay(goalAmount)}</strong> by <strong>${selectedAccount.goalDate}</strong></p>`;
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
          summary = `<p><strong>Target date:</strong> <strong>${formattedDate}</strong> · from <strong>${escapeHtml(findAccount(incomeAccountId)?.name || '')}</strong> · at <strong>${getFrequencyName(frequency).toLowerCase()}</strong> contribution of <strong>${formatMoneyDisplay(contribution)}</strong></p>`;
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
        summary = `<p><strong>Projected goal:</strong> <strong>${formatMoneyDisplay(projectedAmount)}</strong> · from <strong>${escapeHtml(findAccount(incomeAccountId)?.name || '')}</strong> · with <strong>${getFrequencyName(frequency).toLowerCase()}</strong> contribution of <strong>${formatMoneyDisplay(contribution)}</strong> by <strong>${selectedAccount.goalDate}</strong></p>`;
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

    const selectedAccount = findAccount(selectedId);
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
      if (!isRenderCurrent()) return;
      scenarioState?.set?.(refreshed);

      await loadMasterTransactionsGrid(document.getElementById('transactionsTable'));
      await loadProjectionsSection(document.getElementById('projectionsContent'));

      // Format currency for alert message (plain text, no HTML)
      const formattedAmount = formatCurrency(Math.abs(scheduledContribution));

      notifySuccess(`Goal plan generated! ${getFrequencyName(frequency).toLowerCase()} plan rule of ${formattedAmount} created.`);

      // Reset form
      accountSelect.value = '';
      incomeAccountSelect.value = '';
      syncSelectionDialog(accountSelect);
      syncSelectionDialog(incomeAccountSelect);
      accountSelect.dispatchEvent(new Event('change'));
      incomeAccountSelect.dispatchEvent(new Event('change'));
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
    syncSelectionDialog(accountSelect);
    syncSelectionDialog(incomeAccountSelect);
    accountSelect.dispatchEvent(new Event('change'));
    incomeAccountSelect.dispatchEvent(new Event('change'));
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
