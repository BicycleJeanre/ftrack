import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { firebaseConfig, firebaseEmulators } from '../config/firebase-config.js';

let services = null;
let initializationError = null;

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
}

export async function initializeFirebaseCloud() {
  if (services) return services;
  if (initializationError) throw initializationError;
  if (!isFirebaseConfigured()) return null;

  try {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    await setPersistence(auth, browserLocalPersistence);
    if (firebaseEmulators.enabled) {
      connectAuthEmulator(
        auth,
        `http://${firebaseEmulators.authHost}:${firebaseEmulators.authPort}`,
        { disableWarnings: true }
      );
      connectFirestoreEmulator(
        db,
        firebaseEmulators.firestoreHost,
        firebaseEmulators.firestorePort
      );
    }
    services = { app, auth, db };
    return services;
  } catch (error) {
    initializationError = error;
    throw error;
  }
}

function requireUser(uid) {
  const currentUid = services?.auth?.currentUser?.uid;
  if (!currentUid || currentUid !== uid) {
    throw new Error('The signed-in account no longer matches this cloud operation.');
  }
}

function manifestRef(db, uid, workspaceId) {
  return doc(db, 'users', uid, 'ftrackWorkspaces', workspaceId);
}

function revisionRef(db, uid, workspaceId, revisionId) {
  return doc(db, 'users', uid, 'ftrackWorkspaces', workspaceId, 'revisions', revisionId);
}

export async function observeFirebaseAuth(callback) {
  const initialized = await initializeFirebaseCloud();
  if (!initialized) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(initialized.auth, callback);
}

export async function createFirebaseAccount(email, password) {
  const initialized = await initializeFirebaseCloud();
  if (!initialized) throw new Error('Firebase is not configured for this build.');
  return createUserWithEmailAndPassword(initialized.auth, email, password);
}

export async function signInFirebase(email, password) {
  const initialized = await initializeFirebaseCloud();
  if (!initialized) throw new Error('Firebase is not configured for this build.');
  return signInWithEmailAndPassword(initialized.auth, email, password);
}

export async function sendFirebasePasswordReset(email) {
  const initialized = await initializeFirebaseCloud();
  if (!initialized) throw new Error('Firebase is not configured for this build.');
  return sendPasswordResetEmail(initialized.auth, email);
}

export async function signOutFirebase() {
  const initialized = await initializeFirebaseCloud();
  if (!initialized) return;
  await signOut(initialized.auth);
}

export async function getWorkspaceManifest(uid, workspaceId = 'default') {
  const { db } = await initializeFirebaseCloud();
  requireUser(uid);
  const snapshot = await getDoc(manifestRef(db, uid, workspaceId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function observeWorkspaceManifest(uid, workspaceId, callback, onError) {
  const { db } = await initializeFirebaseCloud();
  requireUser(uid);
  return onSnapshot(
    manifestRef(db, uid, workspaceId),
    (snapshot) => callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
    onError
  );
}

export async function loadWorkspaceRevision(uid, workspaceId, revisionId) {
  const { db } = await initializeFirebaseCloud();
  requireUser(uid);
  const revision = await getDoc(revisionRef(db, uid, workspaceId, revisionId));
  if (!revision.exists()) throw new Error('The selected cloud revision no longer exists.');
  const chunksQuery = query(
    collection(revision.ref, 'chunks'),
    orderBy('index', 'asc')
  );
  const chunks = (await getDocs(chunksQuery)).docs.map((snapshot) => snapshot.data());
  return { metadata: revision.data(), chunks };
}

export async function publishWorkspaceRevision({
  uid,
  workspaceId = 'default',
  expectedRevision = null,
  snapshot,
  writerId
}) {
  const { db } = await initializeFirebaseCloud();
  requireUser(uid);
  const revisionId = globalThis.crypto.randomUUID();
  const revision = revisionRef(db, uid, workspaceId, revisionId);

  for (const chunk of snapshot.chunks) {
    await setDoc(doc(revision, 'chunks', String(chunk.index).padStart(6, '0')), {
      index: chunk.index,
      data: chunk.data
    });
  }

  const metadata = {
    format: snapshot.format,
    schemaVersion: snapshot.schemaVersion,
    chunkCount: snapshot.chunkCount,
    byteLength: snapshot.byteLength,
    sha256: snapshot.sha256,
    createdAt: serverTimestamp(),
    writerId
  };
  await setDoc(revision, metadata);

  const manifest = manifestRef(db, uid, workspaceId);
  await runTransaction(db, async (transaction) => {
    const current = await transaction.get(manifest);
    const currentRevision = current.exists() ? current.data().activeRevision || null : null;
    if (currentRevision !== (expectedRevision || null)) {
      const error = new Error('The cloud workspace changed on another device.');
      error.name = 'CloudRevisionConflictError';
      error.remoteRevision = currentRevision;
      throw error;
    }
    transaction.set(manifest, {
      format: snapshot.format,
      activeRevision: revisionId,
      schemaVersion: snapshot.schemaVersion,
      chunkCount: snapshot.chunkCount,
      byteLength: snapshot.byteLength,
      sha256: snapshot.sha256,
      updatedAt: serverTimestamp(),
      writerId
    });
  });

  return revisionId;
}
