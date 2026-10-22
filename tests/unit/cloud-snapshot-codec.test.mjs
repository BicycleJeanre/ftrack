import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyCloudReconciliation,
  decodeCloudSnapshot,
  encodeCloudSnapshot
} from '../../js/app/services/cloud-snapshot-codec.js';
import { createDefaultAppData } from '../../js/shared/app-data-utils.js';

test('cloud snapshot round-trips validated Unicode data across chunks', async () => {
  const data = createDefaultAppData();
  data.scenarios.push({
    id: 1,
    version: 1,
    name: 'Reminder sync',
    description: null,
    accounts: [],
    accountGroups: [],
    splitTransactionSets: [],
    transactions: [],
    transactionOccurrences: [],
    baselinePeriods: [],
    reviewReminders: [{
      id: 1,
      note: 'Remember the municipal payment 🌍',
      reviewDate: '2026-10-31',
      createdAt: '2026-10-22T10:00:00.000Z',
      updatedAt: '2026-10-22T10:00:00.000Z'
    }],
    timeframe: { startDate: '2026-01-01', endDate: '2026-12-31', periodTypeId: 3 },
    projection: {
      config: { startDate: '2026-01-01', endDate: '2026-12-31', periodTypeId: 3 },
      rows: [],
      generatedAt: null,
      stale: false,
      staleAt: null,
      staleReason: null
    },
    planning: null
  });
  data.migrationReport = {
    toSchemaVersion: 45,
    migratedAt: '2026-09-16T10:00:00.000Z',
    summary: { note: 'Household 🌍 – Johannesburg' },
    scenarios: []
  };
  const encoded = await encodeCloudSnapshot(data, { chunkBytes: 1024 });
  const decoded = await decodeCloudSnapshot(encoded, [...encoded.chunks].reverse());

  assert.equal(decoded.migrationReport.summary.note, data.migrationReport.summary.note);
  assert.equal(decoded.scenarios[0].reviewReminders[0].note, 'Remember the municipal payment 🌍');
  assert.equal(encoded.sha256.length, 64);
  assert.ok(encoded.chunkCount >= 1);
});

test('cloud snapshot rejects modified chunk content', async () => {
  const encoded = await encodeCloudSnapshot(createDefaultAppData(), { chunkBytes: 1024 });
  const changed = encoded.chunks.map((chunk) => ({ ...chunk }));
  changed[0].data = changed[0].data.slice(0, -4) + 'AAAA';
  await assert.rejects(() => decodeCloudSnapshot(encoded, changed), /integrity|length/i);
});

test('cloud snapshot rejects invalid financial data before upload', async () => {
  const data = createDefaultAppData();
  data.scenarios.push({
    id: 1,
    name: 'Invalid scenario',
    accounts: [{ id: 1, name: '', type: 99, currency: 99, startingBalance: 'not-a-number' }]
  });
  await assert.rejects(() => encodeCloudSnapshot(data), /validation failed/i);
});

test('reconciliation never overwrites divergent meaningful data automatically', () => {
  assert.equal(classifyCloudReconciliation({
    remoteRevision: 'remote-2',
    localHash: 'local',
    remoteHash: 'remote',
    hasPendingLocalChanges: true
  }), 'conflict');

  assert.equal(classifyCloudReconciliation({
    remoteRevision: 'remote-2',
    localIsDefault: true
  }), 'download-remote');

  assert.equal(classifyCloudReconciliation({
    remoteRevision: 'remote-2',
    lastSyncedRevision: 'remote-2',
    hasPendingLocalChanges: true
  }), 'upload-local');
});
