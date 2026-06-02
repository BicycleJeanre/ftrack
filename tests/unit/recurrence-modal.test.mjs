import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizeRecurrenceTypeId } = await import('../../js/ui/components/modals/recurrence-modal.js');

test('recurrence modal resolves saved recurrence type objects', () => {
  assert.equal(normalizeRecurrenceTypeId({ id: 4, name: 'Monthly - Day of Month' }), 4);
  assert.equal(normalizeRecurrenceTypeId(7), 7);
  assert.equal(normalizeRecurrenceTypeId('11'), 11);
  assert.equal(normalizeRecurrenceTypeId({ id: 99, name: 'Unknown' }), 1);
});
