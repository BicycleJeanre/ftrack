import * as DataStore from './storage-service.js';
import { downloadJsonData } from './export-service.js';
import {
  classifyCloudReconciliation,
  decodeCloudSnapshot,
  encodeCloudSnapshot,
  mergeMissingCloudScenarios,
  scenariosMissingFrom
} from './cloud-snapshot-codec.js?v=workshop-recovery-1';
import {
  createFirebaseAccount,
  getWorkspaceManifest,
  initializeFirebaseCloud,
  isFirebaseConfigured,
  listWorkspaceRevisions,
  loadWorkspaceRevision,
  observeFirebaseAuth,
  observeWorkspaceManifest,
  publishWorkspaceRevision,
  sendFirebasePasswordReset,
  signInFirebase,
  signOutFirebase
} from '../../vendor/firebase-client.bundle.js?v=workshop-recovery-1';

const META_KEY = 'ftrack:cloud-sync-meta:v1';
const WORKSPACE_ID = 'default';
const listeners = new Set();

let state = {
  phase: isFirebaseConfigured() ? 'signed-out' : 'unconfigured',
  label: isFirebaseConfigured() ? 'Sign in' : 'Local only',
  configured: isFirebaseConfigured(),
  user: null,
  pending: false,
  lastSyncedAt: null,
  error: null,
  conflict: null
};
let initialized = false;
let authUnsubscribe = null;
let manifestUnsubscribe = null;
let syncTimer = null;
let syncPromise = null;
let activeUid = null;
let suppressRemoteRevision = null;

function readMeta() {
  try {
    const parsed = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function writeMeta(patch) {
  const next = { ...readMeta(), ...patch };
  localStorage.setItem(META_KEY, JSON.stringify(next));
  return next;
}

function readAccountMeta(uid) {
  if (!uid) return {};
  return readMeta().accounts?.[uid] || {};
}

function writeAccountMeta(uid, patch) {
  const meta = readMeta();
  const accounts = { ...(meta.accounts || {}) };
  accounts[uid] = { ...(accounts[uid] || {}), ...patch };
  writeMeta({ accounts });
  return accounts[uid];
}

function installationId() {
  const meta = readMeta();
  if (meta.installationId) return meta.installationId;
  const id = globalThis.crypto.randomUUID();
  writeMeta({ installationId: id });
  return id;
}

function phaseLabel(phase) {
  return ({
    unconfigured: 'Local only',
    'signed-out': 'Sign in',
    connecting: 'Connecting',
    saving: 'Saving',
    synced: 'Synced',
    offline: 'Offline',
    conflict: 'Conflict',
    error: 'Sync error'
  })[phase] || 'Local only';
}

function setState(patch) {
  state = { ...state, ...patch };
  state.label = patch.label || phaseLabel(state.phase);
  listeners.forEach((listener) => listener({ ...state }));
  document.dispatchEvent(new CustomEvent('ftrack:cloudStateChanged', {
    detail: { ...state }
  }));
}

function friendlyError(error) {
  const code = String(error?.code || '');
  if (code.includes('invalid-credential')) return 'The email or password is incorrect.';
  if (code.includes('email-already-in-use')) return 'An account already exists for this email.';
  if (code.includes('weak-password')) return 'Use a stronger password with at least six characters.';
  if (code.includes('invalid-email')) return 'Enter a valid email address.';
  if (code.includes('network-request-failed')) return 'Firebase could not be reached. Your local data is safe.';
  return error?.message || 'Cloud synchronization failed.';
}

async function localSnapshot() {
  const data = await DataStore.read();
  return { ...await encodeCloudSnapshot(data), scenarioCount: data.scenarios.length };
}

async function applyRemoteManifest(manifest, { allowScenarioRemoval = false } = {}) {
  if (!manifest?.activeRevision) throw new Error('The cloud workspace has no active revision.');
  const uid = activeUid;
  const remote = await loadWorkspaceRevision(uid, WORKSPACE_ID, manifest.activeRevision);
  const data = await decodeCloudSnapshot(remote.metadata, remote.chunks);
  try {
    await DataStore.transaction(current => {
      if (activeUid !== uid) throw new Error('The signed-in account changed.');
      if (!allowScenarioRemoval && (readMeta().pending || scenariosMissingFrom(data, current).length)) {
        const error = new Error('The cloud workspace differs from this device and could replace local scenarios or edits. Review the versions before continuing.');
        error.name = 'CloudDestructiveDownloadError';
        throw error;
      }
      return data;
    }, { source: 'cloud' });
  } catch (error) {
    if (error.name !== 'CloudDestructiveDownloadError') throw error;
    setState({ phase: 'conflict', pending: Boolean(readMeta().pending), conflict: { manifest }, error: error.message });
    return;
  }
  suppressRemoteRevision = manifest.activeRevision;
  writeAccountMeta(uid, {
    lastSyncedRevision: manifest.activeRevision,
    lastSyncedHash: manifest.sha256,
    lastSyncedScenarioCount: data.scenarios.length,
    lastSyncedAt: new Date().toISOString()
  });
  writeMeta({ pending: false });
  setState({
    phase: 'synced',
    pending: false,
    conflict: null,
    error: null,
    lastSyncedAt: readAccountMeta(activeUid).lastSyncedAt
  });
  document.dispatchEvent(new CustomEvent('ftrack:cloudDataApplied'));
}

async function publishLocal({ expectedRevision, conflictOverride = false } = {}) {
  if (!activeUid) return;
  if (!navigator.onLine) {
    writeMeta({ pending: true });
    setState({ phase: 'offline', pending: true, error: null });
    return;
  }
  if (state.phase === 'conflict' && !conflictOverride) return;

  setState({ phase: 'saving', pending: true, error: null });
  const accountMeta = readAccountMeta(activeUid);
  try {
    const snapshot = await localSnapshot();
    if (!conflictOverride && !snapshot.scenarioCount && accountMeta.lastSyncedRevision && accountMeta.lastSyncedScenarioCount !== 0 &&
        snapshot.sha256 !== accountMeta.lastSyncedHash) {
      const manifest = await getWorkspaceManifest(activeUid, WORKSPACE_ID);
      if (manifest?.activeRevision) {
        setState({ phase: 'conflict', pending: true, conflict: { manifest },
          error: 'This device has no scenarios. Confirm before replacing the cloud workspace, or recover your scenarios.' });
        return;
      }
    }
    const revisionId = await publishWorkspaceRevision({
      uid: activeUid,
      workspaceId: WORKSPACE_ID,
      expectedRevision: expectedRevision === undefined ? accountMeta.lastSyncedRevision || null : expectedRevision,
      snapshot,
      writerId: installationId()
    });
    suppressRemoteRevision = revisionId;
    const lastSyncedAt = new Date().toISOString();
    writeAccountMeta(activeUid, {
      lastSyncedRevision: revisionId,
      lastSyncedHash: snapshot.sha256,
      lastSyncedScenarioCount: snapshot.scenarioCount,
      lastSyncedAt
    });
    writeMeta({ pending: false });
    setState({ phase: 'synced', pending: false, conflict: null, error: null, lastSyncedAt });
  } catch (error) {
    if (error?.name === 'CloudRevisionConflictError') {
      const manifest = await getWorkspaceManifest(activeUid, WORKSPACE_ID);
      writeMeta({ pending: true });
      setState({
        phase: 'conflict',
        pending: true,
        conflict: { manifest },
        error: 'This workspace changed on another device. Choose which version to keep.'
      });
      return;
    }
    writeMeta({ pending: true });
    setState({ phase: navigator.onLine ? 'error' : 'offline', pending: true, error: friendlyError(error) });
    throw error;
  }
}

function queueSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    void syncNow();
  }, 900);
}

async function handleManifestChanged(manifest) {
  if (!activeUid || !manifest?.activeRevision) return;
  if (manifest.activeRevision === suppressRemoteRevision) {
    suppressRemoteRevision = null;
    return;
  }
  const meta = readMeta();
  const accountMeta = readAccountMeta(activeUid);
  if (manifest.activeRevision === accountMeta.lastSyncedRevision) return;
  if (meta.pending || state.phase === 'saving') {
    setState({
      phase: 'conflict',
      pending: true,
      conflict: { manifest },
      error: 'This workspace changed on another device while local changes were waiting.'
    });
    return;
  }
  try {
    setState({ phase: 'connecting', error: null });
    await applyRemoteManifest(manifest);
  } catch (error) {
    setState({ phase: 'error', error: friendlyError(error) });
  }
}

async function beginManifestObservation(uid) {
  manifestUnsubscribe?.();
  manifestUnsubscribe = await observeWorkspaceManifest(
    uid,
    WORKSPACE_ID,
    (manifest) => void handleManifestChanged(manifest),
    (error) => setState({ phase: 'error', error: friendlyError(error) })
  );
}

async function reconcileSignedInUser(user) {
  activeUid = user.uid;
  const meta = readMeta();
  const accountMeta = readAccountMeta(user.uid);
  setState({
    phase: 'connecting',
    user: { uid: user.uid, email: user.email || '' },
    pending: Boolean(meta.pending),
    lastSyncedAt: accountMeta.lastSyncedAt || null,
    conflict: null,
    error: null
  });

  try {
    const [local, manifest] = await Promise.all([
      localSnapshot(),
      getWorkspaceManifest(user.uid, WORKSPACE_ID)
    ]);
    const action = classifyCloudReconciliation({
      lastSyncedRevision: accountMeta.lastSyncedRevision || null,
      remoteRevision: manifest?.activeRevision || null,
      hasPendingLocalChanges: Boolean(meta.pending),
      localHash: local.sha256,
      remoteHash: manifest?.sha256 || null,
      localIsEmpty: local.scenarioCount === 0,
      lastSyncedScenarioCount: accountMeta.lastSyncedScenarioCount
    });

    if (action === 'already-synced') {
      writeAccountMeta(user.uid, {
        lastSyncedRevision: manifest.activeRevision,
        lastSyncedHash: manifest.sha256,
        ...(local.sha256 === manifest.sha256 ? { lastSyncedScenarioCount: local.scenarioCount } : {}),
        lastSyncedAt: accountMeta.lastSyncedAt || new Date().toISOString()
      });
      writeMeta({ pending: false });
      setState({ phase: 'synced', pending: false, error: null, lastSyncedAt: readAccountMeta(user.uid).lastSyncedAt });
    } else if (action === 'download-remote') {
      await applyRemoteManifest(manifest);
    } else if (action === 'upload-local' || action === 'publish-initial') {
      await publishLocal({ expectedRevision: manifest?.activeRevision || null });
    } else {
      setState({
        phase: 'conflict',
        pending: true,
        conflict: { manifest },
        error: 'Both this device and the cloud contain data. Review which version to keep.'
      });
    }
    await beginManifestObservation(user.uid);
  } catch (error) {
    setState({ phase: navigator.onLine ? 'error' : 'offline', error: friendlyError(error) });
  }
}

async function handleAuthChanged(user) {
  manifestUnsubscribe?.();
  manifestUnsubscribe = null;
  activeUid = user?.uid || null;
  if (!user) {
    const meta = readMeta();
    setState({
      phase: 'signed-out',
      user: null,
      pending: Boolean(meta.pending),
      conflict: null,
      error: null,
      lastSyncedAt: null
    });
    return;
  }
  await reconcileSignedInUser(user);
}

export async function initializeCloudSync() {
  if (initialized) return getCloudSyncState();
  initialized = true;
  installationId();

  DataStore.subscribeToCommits((commit) => {
    if (commit?.source === 'cloud') return;
    writeMeta({ pending: true });
    setState({ pending: true });
    if (activeUid && state.phase !== 'conflict') queueSync();
  });
  window.addEventListener('online', () => {
    if (activeUid) void syncNow();
  });
  window.addEventListener('offline', () => {
    if (activeUid) setState({ phase: 'offline', error: null });
  });

  if (!isFirebaseConfigured()) {
    setState({ phase: 'unconfigured', configured: false });
    return getCloudSyncState();
  }

  try {
    await initializeFirebaseCloud();
    authUnsubscribe = await observeFirebaseAuth((user) => void handleAuthChanged(user));
  } catch (error) {
    setState({ phase: 'error', error: friendlyError(error) });
  }
  return getCloudSyncState();
}

export function subscribeCloudSync(listener) {
  listeners.add(listener);
  listener(getCloudSyncState());
  return () => listeners.delete(listener);
}

export function getCloudSyncState() {
  return { ...state };
}

export async function syncNow() {
  if (!activeUid || state.phase === 'conflict') return;
  if (syncPromise) return syncPromise;
  syncPromise = publishLocal().finally(() => { syncPromise = null; });
  return syncPromise;
}

export async function signInToCloud(email, password) {
  setState({ phase: 'connecting', error: null });
  try {
    await signInFirebase(email.trim(), password);
  } catch (error) {
    setState({ phase: 'signed-out', error: friendlyError(error) });
    throw new Error(friendlyError(error));
  }
}

export async function createCloudAccount(email, password) {
  setState({ phase: 'connecting', error: null });
  try {
    await createFirebaseAccount(email.trim(), password);
  } catch (error) {
    setState({ phase: 'signed-out', error: friendlyError(error) });
    throw new Error(friendlyError(error));
  }
}

export async function resetCloudPassword(email) {
  try {
    await sendFirebasePasswordReset(email.trim());
  } catch (error) {
    throw new Error(friendlyError(error));
  }
}

export async function signOutOfCloud() {
  await signOutFirebase();
}

export async function resolveCloudConflict(choice) {
  if (!activeUid || state.phase !== 'conflict') return;
  if (choice === 'cloud') {
    const manifest = state.conflict?.manifest || await getWorkspaceManifest(activeUid, WORKSPACE_ID);
    await applyRemoteManifest(manifest, { allowScenarioRemoval: true });
    return;
  }
  if (choice === 'local') {
    const manifest = await getWorkspaceManifest(activeUid, WORKSPACE_ID);
    await publishLocal({
      expectedRevision: manifest?.activeRevision || null,
      conflictOverride: true
    });
    return;
  }
  throw new Error('Unknown cloud conflict resolution choice.');
}

export async function listCloudRecoveryPoints() {
  const uid = activeUid;
  if (!uid) throw new Error('Sign in to view cloud recovery points.');
  const points = await listWorkspaceRevisions(uid, WORKSPACE_ID);
  if (activeUid !== uid) throw new Error('The signed-in account changed.');
  return points;
}

export async function reviewCloudRecoveryPoint(revisionId) {
  const uid = activeUid;
  if (!uid) throw new Error('Sign in to recover scenarios.');
  const cloud = await loadWorkspaceRevision(uid, WORKSPACE_ID, revisionId);
  const snapshot = await decodeCloudSnapshot(cloud.metadata, cloud.chunks);
  const current = await DataStore.read();
  if (activeUid !== uid) throw new Error('The signed-in account changed.');
  const missing = scenariosMissingFrom(current, snapshot);
  const reviewedIds = new Set(missing.map(scenario => scenario.id));
  return {
    count: missing.length,
    exportBackup() {
      if (activeUid !== uid) throw new Error('The signed-in account changed.');
      downloadJsonData(snapshot, 'ftrack-cloud-recovery-backup.json');
    },
    async restore() {
      let count = 0;
      await DataStore.transaction(latest => {
        if (activeUid !== uid) throw new Error('The signed-in account changed.');
        const reviewed = { scenarios: snapshot.scenarios.filter(scenario => reviewedIds.has(scenario.id)) };
        const next = mergeMissingCloudScenarios(latest, reviewed);
        count = next.scenarios.length - latest.scenarios.length;
        return next;
      }, { skipUnchanged: true });
      if (count) {
        document.dispatchEvent(new CustomEvent('ftrack:scenariosRestored', { detail: { count } }));
      }
      return count;
    }
  };
}

export function destroyCloudSync() {
  clearTimeout(syncTimer);
  authUnsubscribe?.();
  manifestUnsubscribe?.();
  listeners.clear();
  initialized = false;
}
