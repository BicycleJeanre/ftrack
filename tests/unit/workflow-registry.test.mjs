import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WORKFLOWS,
  getWorkflowActivity,
  getWorkflowById
} from '../../js/shared/workflow-registry.js';

test('all user-facing planning workflows route through Plan & Actuals', () => {
  const expectedDefaults = new Map([
    ['general', 'recurring'],
    ['funds', 'recurring'],
    ['debt-repayment', 'recurring'],
    ['goal-workshop', 'recurring']
  ]);

  expectedDefaults.forEach((defaultView, workflowId) => {
    const workflow = getWorkflowById(workflowId);
    const activity = getWorkflowActivity(workflow);

    assert.equal(workflow?.id, workflowId, `${workflowId} resolves without fallback`);
    assert.equal(activity?.surface, 'planActuals', workflowId);
    assert.equal(activity?.presentation, 'summary', workflowId);
    assert.equal(activity?.defaultView, defaultView, workflowId);
    assert.equal(workflow.showPlannedTransactions, false, workflowId);
    assert.equal(workflow.showActualTransactions, false, workflowId);
    assert.equal(workflow.showPlanActuals, true, workflowId);
    assert.ok(workflow.visibleCards.includes('planActuals'), workflowId);
    assert.ok(!workflow.visibleCards.includes('transactions'), workflowId);
  });
});

test('legacy Budget workflow references route to General without exposing duplicate navigation', () => {
  assert.equal(WORKFLOWS.some((workflow) => workflow.id === 'budget'), false);
  assert.equal(getWorkflowById('budget')?.id, 'general');
});

test('both planning detail routes use the unified detail presentation', () => {
  const planRules = getWorkflowById('transactions-detail');
  const planActuals = getWorkflowById('budget-detail');

  assert.equal(planRules.name, 'Plan Rules (Detail)');
  assert.deepEqual(getWorkflowActivity(planRules), {
    surface: 'planActuals',
    presentation: 'detail',
    defaultView: 'recurring'
  });
  assert.deepEqual(getWorkflowActivity(planActuals), {
    surface: 'planActuals',
    presentation: 'detail',
    defaultView: 'period'
  });
});

test('non-activity detail workflows remain isolated', () => {
  ['accounts-detail', 'projections-detail'].forEach((workflowId) => {
    assert.equal(getWorkflowActivity(getWorkflowById(workflowId)), null);
  });

  assert.equal(
    WORKFLOWS.some((workflow) =>
      getWorkflowActivity(workflow)?.surface === 'transactions'
    ),
    false
  );
});

test('legacy transaction flags translate to unified recurring Plan & Actuals', () => {
  assert.deepEqual(
    getWorkflowActivity({
      showPlannedTransactions: true,
      showActualTransactions: false,
      transactionsMode: 'detail'
    }),
    {
      surface: 'planActuals',
      presentation: 'detail',
      defaultView: 'recurring'
    }
  );
});
