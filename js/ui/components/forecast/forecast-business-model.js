import {
  BUSINESS_FLOW_KINDS, BUSINESS_RATE_MODELS, MAX_BUSINESS_TEST_CASES, MAX_BUSINESS_TEST_RANGES,
  buildBusinessModelPlan, evaluateBusinessBreakEven, getBusinessModelTestCases, normalizeBusinessModel
} from '../../../domain/calculations/business-model.js?v=workshop-break-even-1';
import { generateProjectionsForScenario } from '../../../domain/calculations/projection-engine.js';
import { formatCurrency } from '../../../shared/format-utils.js';
import { createScenarioAccountSelectors } from '../widgets/scenario-account-select.js?v=workshop-accounts-1';

const drafts = new WeakMap();
const currencies = value => value == null ? '—' : formatCurrency(value);
const revenuePresets = [
  ['Recurring customers', 'volume'],
  ['Product sales', 'volume'],
  ['Billable hours or jobs', 'volume'],
  ['Contract milestone', 'fixed', 'once'],
  ['Rental or occupancy', 'occupancy'],
  ['Metered usage', 'tiered'],
  ['Commission or revenue share', 'share'],
  ['Licence fee or retainer', 'fixed']
];

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function button(text, handler, className = 'btn btn-secondary') {
  const element = node('button', text, className);
  element.type = 'button';
  element.addEventListener('click', handler);
  return element;
}

function table(title, headings, rows) {
  const wrapper = node('div', null, 'business-table-scroll');
  const grid = node('table', null, 'business-table');
  grid.append(node('caption', title));
  const head = grid.createTHead().insertRow();
  headings.forEach(name => {
    const th = node('th', name);
    th.scope = 'col';
    head.append(th);
  });
  const body = grid.createTBody();
  rows.forEach(row => {
    const tr = body.insertRow();
    row.forEach(value => { tr.insertCell().textContent = value; });
  });
  wrapper.append(grid);
  return wrapper;
}

function accountRows(projections, id) {
  return projections.filter(row => Number(row.accountId) === id);
}

function floorResult(plan, rows) {
  if (plan.minimumCash == null) return 'No cash floor set';
  const misses = rows.filter(row => row.balance < plan.minimumCash);
  return misses.length
    ? `${misses[0].date.slice(0, 7)}: short ${currencies(plan.minimumCash - misses[0].balance)} (${misses.length} month(s) below floor)`
    : 'Meets closing cash floor';
}

function minimumBalance(rows) {
  return rows.length ? Math.min(...rows.map(row => row.balance)) : null;
}

function breakEvenResult(result) {
  if (!result || result.status === 'unavailable') return 'Unavailable';
  const month = result.date.slice(0, 7);
  return result.status === 'met' ? `Meets · ${currencies(result.balance)} (${month})`
    : `Short by ${currencies(result.shortfall)} · ${currencies(result.balance)} (${month})`;
}

export function renderBusinessModel({ container, scenario, getScenario, onSave, onAccountsCreated, isRenderCurrent }) {
  const remembered = drafts.get(container);
  const model = remembered?.scenarioId === scenario.id
    ? remembered.model : normalizeBusinessModel(scenario.planning?.businessModel);
  drafts.set(container, { scenarioId: scenario.id, model });
  const accountName = id => scenario.accounts?.find(a => Number(a.id) === Number(id))?.name || 'External';
  const variableName = id => model.variables.find(variable => variable.id === id)?.name || 'Variable';
  const describeCase = entries => entries?.map(({ id, value }) => `${variableName(id)}: ${value}`).join(' · ');
  const describeBreakEven = condition => `${accountName(condition.accountId)} · ${condition.mode === 'lowest' ? 'Lowest monthly closing balance' : 'Ending balance'} ≥ ${currencies(condition.threshold)}`;
  const root = node('div', null, 'business-model');
  root.dataset.businessModel = '';
  container.append(root);
  const editor = node('div', null, 'business-editor');
  const status = node('p', '', 'text-muted');
  status.setAttribute('role', 'status');
  const results = node('div', null, 'business-results');
  let generation = 0;
  let busy = false;
  let chosenCase = null;
  const accountSelectors = createScenarioAccountSelectors({
    getScenario: () => scenario,
    isCurrent: () => isRenderCurrent() && root.isConnected,
    onCreated: (_account, updated) => onAccountsCreated(updated),
    onError: error => { status.textContent = error.message; }
  });

  const invalidate = () => {
    generation++;
    busy = false;
    results.replaceChildren();
    status.textContent = 'Inputs changed. Preview again to see the updated results.';
    if (previewButton) previewButton.disabled = false;
    if (sweepButton) sweepButton.disabled = false;
  };

  function field(parent, label, target, key, config = {}) {
    const wrapper = node('div', null, 'business-field');
    const caption = node('span', label, 'control-label');
    const input = config.accounts
      ? accountSelectors.create({ label, selectedId: target[key], emptyLabel: config.empty, missingLabel: 'Missing account' })
      : node(config.options ? 'select' : config.multiline ? 'textarea' : 'input');
    input.className = input.tagName === 'SELECT' ? 'input-select' : 'input-text';
    input.setAttribute('aria-label', label);
    if (!config.accounts && config.options) {
      for (const [value, name] of config.options) {
        const option = node('option', name);
        option.value = value;
        input.append(option);
      }
      if (target[key] && !Array.from(input.options).some(option => option.value === target[key])) {
        const missing = node('option', 'Missing variable (select a replacement)');
        missing.value = target[key];
        input.append(missing);
      }
      input.value = target[key] || '';
    } else if (!config.accounts) {
      if (input.tagName === 'INPUT') input.type = config.type || 'text';
      if (config.type === 'number') input.step = 'any';
      if (config.placeholder) input.placeholder = config.placeholder;
      if (config.multiline) input.rows = 2;
      if (input.type === 'text' || config.multiline) input.maxLength = config.multiline ? 2400 : 120;
      input.value = target[key] || '';
    }
    input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
      target[key] = input.value;
      invalidate();
      if (!config.refresh) return;
      if (input.tagName === 'SELECT') {
        const controls = captureFieldPosition(input);
        renderEditor();
        restoreFieldPosition(controls);
      }
    });
    if (config.refresh && input.tagName !== 'SELECT') {
      input.addEventListener('change', () => {
        for (const option of editor.querySelectorAll('select[data-business-variable] option')) {
          if (option.value === target.id) option.textContent = input.value || 'Unnamed variable';
        }
      });
    }
    if (config.variable) input.dataset.businessVariable = '';
    wrapper.append(caption, input);
    parent.append(wrapper);
  }

  const captureFieldPosition = input => {
    const scope = input.closest('fieldset');
    return { label: input.getAttribute('aria-label'), index: scope ? [...editor.querySelectorAll('fieldset')].indexOf(scope) : -1 };
  };
  const restoreFieldPosition = ({ label, index }) => {
    const scope = index < 0 ? editor : editor.querySelectorAll('fieldset')[index];
    [...(scope?.querySelectorAll('select') || [])].find(select => select.getAttribute('aria-label') === label)?.focus();
  };
  const selector = (parent, label, target, key, options, refresh = false) =>
    field(parent, label, target, key, { options, refresh });
  const inputNumber = (parent, label, target, key, placeholder) =>
    field(parent, label, target, key, { type: 'number', placeholder });
  const newVariable = () => {
    if (model.variables.length >= 40) return;
    model.variables.push({ id: crypto.randomUUID?.() || `var-${Date.now()}-${Math.random()}`, name: '', value: '', overrides: '' });
    invalidate();
    renderEditor();
    editor.querySelectorAll('[aria-label="Variable name"]').item(model.variables.length - 1)?.focus();
  };
  const newFlow = (kind, fields = {}) => {
    if (model.flows.length >= 80) return;
    const flow = normalizeBusinessModel({ flows: [{ kind, delay: '0', ...fields }] }).flows[0];
    model.flows.push(flow);
    invalidate();
    renderEditor();
    editor.querySelectorAll('[aria-label="Flow name"]').item(model.flows.length - 1)?.focus();
  };

  function renderEditor() {
    accountSelectors.destroy();
    editor.replaceChildren();
    const variableOptions = (empty = 'Choose variable') => [['', empty], ...model.variables.map(v => [v.id, v.name || 'Unnamed variable'])];
    const accountFields = node('div', null, 'business-fields');
    field(accountFields, 'Business cash account', model, 'cashAccountId', { accounts: true, empty: 'Choose a cash account' });
    field(accountFields, 'Owner cash account (optional)', model, 'ownerAccountId', { accounts: true, empty: 'No separate owner account' });
    inputNumber(accountFields, 'Minimum business closing cash (optional)', model, 'minimumCash');
    editor.append(accountFields);

    const variablesHeader = node('div', null, 'business-row-heading');
    variablesHeader.append(node('h3', 'Variables'), button('Add variable', newVariable));
    editor.append(variablesHeader, node('p', 'Name reusable inputs such as customers, units, hours or price. Optional monthly overrides use YYYY-MM=value, one per line.', 'text-muted'));
    model.variables.forEach((variable, index) => {
      const row = node('div', null, 'business-fields business-editor-row');
      field(row, 'Variable name', variable, 'name', { refresh: true });
      inputNumber(row, 'Default value', variable, 'value');
      field(row, 'Monthly overrides (optional)', variable, 'overrides', { multiline: true, placeholder: '2027-02=8' });
      row.append(button('Remove variable', () => {
        model.variables.splice(index, 1);
        invalidate();
        renderEditor();
        editor.querySelector('[aria-label="Variable name"]')?.focus();
      }));
      editor.append(row);
    });

    const flowHeader = node('div', null, 'business-row-heading');
    flowHeader.append(node('h3', 'Revenue, costs & funding'), button('Add revenue', () => newFlow('revenue')),
      button('Add cost', () => newFlow('cost')), button('Add other flow', () => newFlow('investment')));
    const presets = node('div', null, 'business-row-heading');
    const presetSelect = node('select', null, 'input-select');
    presetSelect.setAttribute('aria-label', 'Revenue model preset');
    presetSelect.append(new Option('Choose a revenue preset', ''));
    revenuePresets.forEach(([name], index) => presetSelect.append(new Option(name, String(index))));
    const addPreset = button('Add preset', () => {
      const [name, calculation, frequency = 'monthly'] = revenuePresets[Number(presetSelect.value)];
      newFlow('revenue', { name, model: calculation, frequency });
    });
    addPreset.disabled = true;
    presetSelect.addEventListener('change', () => { addPreset.disabled = presetSelect.value === ''; });
    presets.append(presetSelect, addPreset);
    editor.append(flowHeader, node('p', 'Mix custom flows or start from a preset. For purchases or loan draws, choose One time. For repayments, enter the payment schedule as a financing flow.', 'text-muted'), presets);
    model.flows.forEach((flow, index) => {
      const row = node('fieldset', null, 'business-fields business-editor-row');
      row.append(node('legend', `Flow ${index + 1}`));
      field(row, 'Flow name', flow, 'name');
      selector(row, 'Flow type', flow, 'kind', Object.entries(BUSINESS_FLOW_KINDS), true);
      selector(row, 'Calculation', flow, 'model', Object.entries(BUSINESS_RATE_MODELS)
        .filter(([key]) => key !== 'revenueShare' || flow.kind !== 'revenue' || flow.model === key), true);
      selector(row, 'Frequency', flow, 'frequency', [['monthly', 'Monthly'], ['once', 'One time']], true);
      if (['volume', 'occupancy', 'stepped', 'share', 'tiered'].includes(flow.model)) {
        field(row, flow.model === 'share' ? 'Base value variable' : 'Quantity variable', flow, 'quantity',
          { options: variableOptions(), variable: true });
      }
      if (flow.model === 'occupancy') field(row, 'Occupancy % variable', flow, 'occupancy',
        { options: variableOptions(), variable: true });
      field(row, 'Rate or amount variable', flow, 'rateVariable',
        { options: variableOptions('Use fixed input'), variable: true, refresh: true });
      if (!flow.rateVariable) {
        const label = { share: 'Rate (%)', revenueShare: 'Rate (%)', fixed: 'Amount',
          stepped: 'Base amount', tiered: 'First unit rate' }[flow.model] || 'Rate per unit';
        inputNumber(row, label, flow, 'rate');
      }
      if (['stepped', 'tiered'].includes(flow.model)) {
        inputNumber(row, 'Quantity threshold', flow, 'threshold');
        inputNumber(row, flow.model === 'stepped' ? 'Increase at threshold' : 'Second unit rate', flow, 'secondRate');
      }
      if (flow.model === 'tiered') inputNumber(row, 'Minimum charge (optional)', flow, 'minimum');
      field(row, flow.frequency === 'once' ? 'Activity date' : 'First activity date', flow, 'startDate', { type: 'date' });
      if (flow.frequency !== 'once') field(row, 'Last activity date', flow, 'endDate', { type: 'date' });
      inputNumber(row, 'Payment delay (whole months)', flow, 'delay', '0');
      field(row, 'Primary account', flow, 'accountId', { accounts: true, empty: 'Use business cash account' });
      field(row, 'Counterparty account', flow, 'counterpartyId', { accounts: true, empty: 'External / no counterparty' });
      row.append(button('Remove flow', () => {
        model.flows.splice(index, 1);
        invalidate();
        renderEditor();
        editor.querySelectorAll('[aria-label="Flow name"]').item(Math.max(0, index - 1))?.focus();
      }));
      editor.append(row);
    });

    const testHeading = node('div', null, 'business-row-heading');
    const addRange = button('Add test variable', () => {
      model.testRanges.push({ variable: '', start: '', end: '', step: '' });
      invalidate();
      renderEditor();
      [...editor.querySelectorAll('select[aria-label="Variable to test"]')].at(-1)?.focus();
    });
    addRange.disabled = model.testRanges.length >= MAX_BUSINESS_TEST_RANGES;
    testHeading.append(node('h3', 'Test variables'), addRange);
    editor.append(testHeading, node('p',
      `Test every combination of the ranges below (up to ${MAX_BUSINESS_TEST_CASES}). Tested values replace the selected variables for every month; other variables keep their monthly overrides.`, 'text-muted'));
    model.testRanges.forEach((range, index) => {
      const row = node('fieldset', null, 'business-fields business-editor-row');
      row.append(node('legend', `Test range ${index + 1}`));
      field(row, 'Variable to test', range, 'variable', { options: variableOptions(), variable: true });
      inputNumber(row, 'Test from', range, 'start');
      inputNumber(row, 'Test to', range, 'end');
      inputNumber(row, 'Test step', range, 'step', '1');
      row.append(button('Remove test variable', () => {
        model.testRanges.splice(index, 1);
        invalidate();
        renderEditor();
        editor.querySelector('select[aria-label="Variable to test"]')?.focus();
      }));
      editor.append(row);
    });
    editor.append(node('h3', 'Break-even condition'));
    const conditionFields = node('div', null, 'business-fields');
    selector(conditionFields, 'Break-even check', model.breakEven, 'mode', [
      ['none', 'Off'], ['ending', 'Ending balance at least'], ['lowest', 'Every monthly closing balance at least']
    ], true);
    if (model.breakEven.mode !== 'none') {
      field(conditionFields, 'Break-even account', model.breakEven, 'accountId',
        { accounts: true, empty: 'Use business cash account', missingLabel: 'Missing account' });
      inputNumber(conditionFields, 'Break-even balance', model.breakEven, 'threshold', '0');
    }
    editor.append(conditionFields);
  }

  function renderProjection(plan, baseline, projected) {
    const cash = accountRows(projected, plan.cashAccountId);
    const baseCash = accountRows(baseline, plan.cashAccountId);
    const owner = accountRows(projected, plan.ownerAccountId);
    const baseOwner = accountRows(baseline, plan.ownerAccountId);
    const caseText = chosenCase ? ` · ${describeCase(chosenCase)}` : '';
    const output = node('div', null, 'business-projection');
    output.append(node('h3', `Preview${caseText}`),
      node('p', `${plan.rules.length} proposed Plan Rule(s) · Lowest projected closing cash: ${currencies(minimumBalance(cash))} · ${floorResult(plan, cash)}`));
    if (plan.breakEven) {
      output.append(node('p', `Break-even: ${describeBreakEven(plan.breakEven)} — ${breakEvenResult(evaluateBusinessBreakEven(plan.breakEven, projected))}`));
    }
    if (plan.deferredCount) output.append(node('p', `${plan.deferredCount} payment(s) land after the scenario end and are not included. Extend the scenario timeframe to see them.`, 'text-muted'));
    const rows = cash.map((row, index) => {
      const month = row.date.slice(0, 7);
      const { revenue = 0, cost = 0 } = plan.totals.get(month) || {};
      return [month, currencies(revenue), currencies(cost), currencies(revenue - cost),
        currencies(baseCash[index]?.balance), currencies(row.balance),
        currencies(row.balance - (baseCash[index]?.balance ?? 0)),
        ...(plan.ownerAccountId ? [currencies(baseOwner[index]?.balance), currencies(owner[index]?.balance)] : [])];
    });
    output.append(table('Monthly cash flow and projected closing balances',
      ['Month', 'Scheduled revenue', 'Scheduled costs', 'Scheduled operating net', 'Cash without model', 'Cash with model', 'Cash difference',
        ...(plan.ownerAccountId ? ['Owner without model', 'Owner with model'] : [])], rows));
    const detail = node('details');
    detail.append(node('summary', `Review proposed Plan Rules (${plan.rules.length})`));
    detail.append(table('Proposed account movements', ['Plan Rule', 'From', 'To', 'Amount', 'Schedule'], plan.rules.map(rule => [
      rule.description,
      accountName(rule.transactionTypeId === 1 ? rule.secondaryAccountId : rule.primaryAccountId),
      accountName(rule.transactionTypeId === 1 ? rule.primaryAccountId : rule.secondaryAccountId),
      currencies(rule.amount),
      rule.recurrence ? `Monthly · ${rule.effectiveDate} → ${rule.recurrence.endDate}` : rule.effectiveDate
    ])));
    output.append(detail);
    return output;
  }

  async function run(sweep) {
    if (busy) return;
    const ticket = ++generation;
    const active = () => ticket === generation && isRenderCurrent() && root.isConnected;
    busy = true;
    previewButton.disabled = sweepButton.disabled = true;
    results.replaceChildren();
    status.textContent = sweep ? 'Testing variable values…' : 'Calculating projections…';
    try {
      const latest = await getScenario();
      if (!active()) return;
      if (!latest || latest.id !== scenario.id) throw new Error('Reopen Scenario Setup for the active scenario.');
      const currentPlan = buildBusinessModelPlan(latest, model);
      const cases = sweep ? getBusinessModelTestCases(model) : [];
      const options = { startDate: currentPlan.startDate, endDate: currentPlan.endDate, periodTypeId: 3 };
      const baseline = await generateProjectionsForScenario(latest, options);
      const project = plan => generateProjectionsForScenario({
        ...latest, transactions: [...(latest.transactions || []), ...plan.rules]
      }, options);
      const projected = await project(currentPlan);
      if (!active()) return;
      chosenCase = null;
      const detail = node('div');
      detail.append(renderProjection(currentPlan, baseline, projected));
      if (sweep) {
        const comparison = [];
        const validCases = [];
        let metCount = 0;
        let unavailableCount = 0;
        const breakEven = currentPlan.breakEven;
        for (const entry of cases) {
          const values = entry.map(variable => variable.value);
          let plan;
          try {
            plan = buildBusinessModelPlan(latest, model, entry);
          } catch (error) {
            comparison.push([...values, '—', '—', '—',
              ...(currentPlan.ownerAccountId ? ['—'] : []), error.message, ...(breakEven ? ['Not evaluated'] : [])]);
            unavailableCount++;
            continue;
          }
          const withModel = await project(plan);
          if (!active()) return;
          const cash = accountRows(withModel, plan.cashAccountId);
          const owner = accountRows(withModel, plan.ownerAccountId);
          const operatingNet = [...plan.totals.values()].reduce((net, values) => net + values.revenue - values.cost, 0);
          const outcome = evaluateBusinessBreakEven(plan.breakEven, withModel);
          if (outcome?.status === 'met') metCount++;
          if (outcome?.status === 'unavailable') unavailableCount++;
          comparison.push([...values, currencies(cash.at(-1)?.balance), currencies(minimumBalance(cash)), currencies(operatingNet),
            ...(plan.ownerAccountId ? [currencies(owner.at(-1)?.balance)] : []), floorResult(plan, cash),
            ...(breakEven ? [breakEvenResult(outcome)] : [])]);
          validCases.push(entry);
        }
        if (breakEven) {
          const summary = `${metCount} of ${cases.length} combinations meet break-even${unavailableCount ? ` · ${unavailableCount} not evaluated` : ''}.`;
          results.append(node('p', `${summary} ${describeBreakEven(breakEven)}.`));
        }
        results.append(table('Compare test values', [...cases[0].map(entry => variableName(entry.id)), 'Ending business cash', 'Lowest closing cash',
          'Scheduled operating net', ...(currentPlan.ownerAccountId ? ['Ending owner cash'] : []), 'Cash floor check',
          ...(breakEven ? ['Break-even result'] : [])], comparison));
        let selectedCaseRequest = 0;
        const selectRow = node('div', null, 'business-fields');
        const optionsForCases = [['', 'Current inputs'], ...validCases.map((entry, i) => [String(i),
          entry.length === 1 ? String(entry[0].value) : describeCase(entry)])];
        // Selecting a result does not change the stored input or invalidate the comparison.
        const select = node('select', null, 'input-select');
        select.setAttribute('aria-label', 'Preview test case');
        optionsForCases.forEach(([value, label]) => {
          const option = node('option', label);
          option.value = value;
          select.append(option);
        });
        select.addEventListener('change', async () => {
          const request = ++selectedCaseRequest;
          const selected = select.value;
          try {
            const entry = selected === '' ? null : validCases[Number(selected)];
            const plan = entry ? buildBusinessModelPlan(latest, model, entry) : currentPlan;
            const rows = entry ? await project(plan) : projected;
            if (!active() || request !== selectedCaseRequest) return;
            chosenCase = entry;
            detail.replaceChildren(renderProjection(plan, baseline, rows));
          } catch (error) {
            if (active() && request === selectedCaseRequest) status.textContent = error.message;
          }
        });
        const label = node('label', 'Preview test case');
        label.append(select);
        selectRow.append(label);
        results.append(selectRow);
      }
      results.append(detail);
      status.textContent = 'Preview only. No accounts, Plan Rules, actuals, or saved projections were changed.';
    } catch (error) {
      if (active()) status.textContent = error.message;
    } finally {
      if (active()) {
        busy = false;
        previewButton.disabled = sweepButton.disabled = false;
      }
    }
  }

  const previewButton = button('Preview projections', () => run(false), 'btn btn-primary');
  const sweepButton = button('Test range', () => run(true));
  const save = button('Save setup', async () => {
    save.disabled = true;
    try {
      await onSave(normalizeBusinessModel(model));
      if (root.isConnected) status.textContent = 'Setup saved. No Plan Rules were changed.';
    } catch (error) {
      if (root.isConnected) status.textContent = error.message;
    } finally {
      save.disabled = false;
    }
  });
  const actions = node('div', null, 'business-row-heading');
  actions.append(previewButton, sweepButton, save);
  root.append(node('h3', 'Business Model'), node('p',
    `Build a business from reusable variables and account movements. Preview uses the existing scenario timeframe (${scenario.timeframe?.startDate || '—'} to ${scenario.timeframe?.endDate || '—'}) and includes its current plan and actuals. Blank activity dates use the scenario dates; the first activity date sets the monthly payment day.`,
    'text-muted'), editor, actions, status, results);
  renderEditor();
}
