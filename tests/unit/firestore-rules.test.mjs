import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { CURRENT_SCHEMA_VERSION } from '../../js/shared/app-data-utils.js';

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const rulesUrl = new URL('../../firestore.rules', import.meta.url);

test('Firestore rules accept the current FTrack schema version', async () => {
  const rules = await readFile(rulesUrl, 'utf8');
  const schemaRule = rules.match(/data\.schemaVersion\s*==\s*(\d+)/);

  assert.ok(schemaRule, 'Firestore rules must validate a schema version');
  assert.equal(Number(schemaRule[1]), CURRENT_SCHEMA_VERSION);
});

test('Firestore rules isolate FTrack workspaces by authenticated owner', {
  skip: !emulatorAvailable
}, async () => {
  const rules = await readFile(rulesUrl, 'utf8');
  const environment = await initializeTestEnvironment({
    projectId: `demo-ftrack-${Date.now()}`,
    firestore: { rules }
  });

  try {
    const alice = environment.authenticatedContext('alice').firestore();
    const bob = environment.authenticatedContext('bob').firestore();
    const anonymous = environment.unauthenticatedContext().firestore();
    const path = 'users/alice/ftrackWorkspaces/default';
    const validManifest = {
      format: 'ftrack-snapshot-v1',
      activeRevision: 'revision-0001',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      chunkCount: 1,
      byteLength: 2,
      sha256: 'a'.repeat(64),
      updatedAt: serverTimestamp(),
      writerId: 'writer-0001'
    };

    await assertSucceeds(setDoc(doc(alice, path), validManifest));
    await assertSucceeds(getDoc(doc(alice, path)));
    await assertFails(getDoc(doc(bob, path)));
    await assertFails(getDoc(doc(anonymous, path)));
    await assertFails(setDoc(doc(alice, 'users/bob/ftrackWorkspaces/default'), validManifest));
    await assertFails(setDoc(doc(alice, 'users/alice/ftrackWorkspaces/invalid'), {
      ...validManifest,
      schemaVersion: CURRENT_SCHEMA_VERSION - 1
    }));
  } finally {
    await environment.cleanup();
  }

  assert.ok(true);
});
