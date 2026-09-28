# Firebase Cloud Save and Sign-In

## Status

This document defines the implemented optional Firebase Authentication and
Cloud Firestore persistence for FTrack. It is based on the working G-Track
cloud pattern, adapted to FTrack's whole-dataset financial model.

The snapshot codec, synchronization coordinator, account interface, Firebase
adapter, rules, emulator configuration, and local-save integration are present.
Cloud save remains in the safe `Local only` state until a Firebase web-app
configuration is supplied and the Firebase client bundle is rebuilt.

## Activate a Firebase Environment

1. Create a dedicated Firebase project and web app for FTrack.
2. Enable Email/Password in Firebase Authentication.
3. Create a Cloud Firestore database in the intended region.
4. Copy the web app's `apiKey`, `authDomain`, `projectId`, and `appId` into
   `js/config/firebase-config.js`.
5. Run `npm run cloud:build`.
6. Test authentication and synchronization against the Firebase emulators.
7. Deploy `firestore.rules` and `firestore.indexes.json` before testing against
   the live project.

Do not add service-account, Admin SDK, or private key material to FTrack. The
web-app configuration identifies the Firebase project; Authentication and
Firestore Security Rules authorize data access.

## Product Outcome

FTrack users can:

- continue working without an account or network connection;
- create an account, sign in, sign out, and reset a password;
- save their complete financial workspace to a private online account;
- reopen the same workspace on another device;
- see whether changes are local, saving, synced, offline, conflicted, or in
  error;
- review conflicts before either device replaces the other;
- retain JSON import/export as a backup and recovery mechanism.

Cloud sync is transport and continuity, not the only backup mechanism.

## Why FTrack Cannot Copy G-Track's Record Sync Directly

G-Track syncs independent records. FTrack's managers currently perform
serialized read-modify-write transactions against one schema-versioned app
document. Accounts, transaction rules, occurrences, frozen baselines,
projections, and planning settings reference one another.

Synchronizing those collections independently could expose a partially updated
financial state. A single Firestore document is also unsuitable because
Firestore documents have a 1 MiB maximum size and occurrence/projection history
can grow over time.

FTrack therefore syncs an atomic logical snapshot using one small manifest and
multiple chunk documents.

## Source of Truth and Data Boundary

The local storage service remains the immediate source of truth:

1. A manager validates and commits a local transaction.
2. The interface refreshes from local state immediately.
3. A cloud coordinator queues the resulting dataset revision.
4. The coordinator validates, serializes, hashes, chunks, and uploads it.
5. Only after every chunk exists does it advance the remote manifest.

The cloud adapter must never persist an app-data object that fails current
schema validation. Remote data must be reconstructed, hash-checked, parsed,
normalized, and validated before it can replace local data.

Transient interface preferences that are intentionally device-specific should
remain local. Persisted financial and scenario state follows the existing
`sanitizeAppDataForWrite()` contract.

## Firestore Data Model

Use a private workspace below the authenticated user's UID:

```text
users/{uid}/ftrackWorkspaces/{workspaceId}              manifest
users/{uid}/ftrackWorkspaces/{workspaceId}/revisions/
  {revisionId}                                          revision metadata
users/{uid}/ftrackWorkspaces/{workspaceId}/revisions/
  {revisionId}/chunks/{chunkId}                         serialized data chunks
```

The initial release uses one workspace named `default` per user. The IDs are
retained in the contract so household sharing or multiple workspaces can be
added later without moving existing data.

### Manifest

```js
{
  format: 'ftrack-snapshot-v1',
  activeRevision: 'revision-id',
  schemaVersion: 45,
  chunkCount: 3,
  byteLength: 1234567,
  sha256: 'hex-digest',
  updatedAt: serverTimestamp(),
  writerId: 'installation-id'
}
```

### Revision metadata

```js
{
  format: 'ftrack-snapshot-v1',
  schemaVersion: 45,
  chunkCount: 3,
  byteLength: 1234567,
  sha256: 'hex-digest',
  createdAt: serverTimestamp(),
  writerId: 'installation-id'
}
```

### Chunk

```js
{
  index: 0,
  data: 'UTF-8-safe serialized segment'
}
```

Chunk payloads should target about 600 KiB, leaving room for Firestore encoding
and metadata. Chunking must operate on UTF-8 bytes, not JavaScript character
positions.

## Atomic Publication

Uploading a revision follows this order:

1. Read the current manifest and compare its active revision with the client's
   last synchronized revision.
2. Create a new immutable revision ID.
3. Upload all chunks for that revision.
4. Write revision metadata.
5. In a Firestore transaction, confirm the expected prior active revision and
   advance the manifest to the new revision.

Readers only load the revision named by the manifest. Abandoned or incomplete
revisions are never visible as current data and can be cleaned up later.

## Conflict Policy

FTrack must not silently apply Firestore's last-write-wins behavior to complete
financial workspaces.

A conflict exists when:

- the device has unsynchronized local changes; and
- the remote manifest advanced from the last revision this device loaded.

When conflicted, automatic upload and download stop. The account panel offers:

- **Export local backup**;
- **Use cloud version** (replace local data only after successful remote
  validation and explicit confirmation);
- **Keep this device** (publish local data as a new revision only after
  explicit confirmation).

Field-level or scenario-level merging is out of scope for the first release.
It can be added only after reference integrity and frozen-history semantics are
defined for merges.

## First Sign-In and Existing Data

Signing in must never automatically replace meaningful local data.

| Local workspace | Cloud workspace | Required behavior |
| --- | --- | --- |
| Empty/default | Missing | Start synced empty workspace |
| Meaningful | Missing | Offer to upload this device |
| Empty/default | Present | Offer to load cloud workspace |
| Meaningful | Present | Show comparison and require a choice |

Before either side is replaced, offer a JSON export of the side being
discarded. Importing older JSON continues through the existing upgrade,
normalization, and validation workflow before it can sync.

## Authentication and Account UI

The first release uses Firebase email/password authentication:

- create account;
- sign in;
- sign out;
- send password reset email;
- restore the authenticated session on startup.

The application header exposes a compact cloud status control. Its states are:

- `Local only`;
- `Saving`;
- `Synced`;
- `Offline`;
- `Conflict`;
- `Error`.

The Account & Sync dialog shows the signed-in email, last successful sync,
pending state, retry action, sign-out action, JSON backup action, and conflict
resolution actions. Sign-out warns or blocks while a write is pending.

## Application Components

The integration should be split into replaceable modules:

- `cloud-snapshot-codec`: deterministic serialization, UTF-8 chunking,
  SHA-256 hashing, reconstruction, and validation;
- `firebase-client`: Firebase app/Auth/Firestore initialization and emulator
  connection, with no financial-domain logic;
- `cloud-workspace-repository`: manifest, revision, and chunk reads/writes;
- `cloud-sync-coordinator`: local revision queue, connectivity, state machine,
  conflict detection, and safe local replacement;
- `account-sync-modal`: authentication, status, first-sign-in choice, and
  conflict UI.

The existing storage service should publish a post-commit event containing no
financial values. The coordinator responds by reading the current sanitized
dataset and queuing a snapshot. Cloud failures must not roll back an already
successful local transaction.

## Firebase Packaging and Configuration

FTrack currently uses native browser modules without a bundler. The Firebase
Web SDK should be installed locally and bundled into a small adapter during the
build; it should not be fetched from a CDN at runtime. This keeps packaged
Electron builds usable offline and makes dependency versions reproducible.

Build-time configuration should generate an ignored runtime configuration
module from environment variables. Commit an example configuration only.

Firebase web-app identifiers are not authorization secrets; Firestore Security
Rules are the security boundary. Never include service-account credentials,
Admin SDK keys, or private keys in the client, repository, or generated bundle.

## Firestore Security Rules

Rules must:

- require authentication for every workspace read and write;
- require `request.auth.uid == uid` for private user paths;
- allow only the documented manifest, revision, and chunk fields;
- validate schema version, format, indices, counts, digest shape, and bounded
  payload sizes;
- make published revision/chunk documents immutable;
- deny every unmatched path.

Use the Firestore Rules emulator for automated authorization tests. Production
rules must be deployed and verified before cloud sync is enabled in a release.

## Delivery Phases

### Phase 1: Offline cloud foundation

- Implement and unit-test the snapshot codec and sync state machine.
- Add a disabled cloud adapter interface and local mock repository.
- Add storage post-commit notification without changing existing persistence.
- Add status UI in `Local only` mode.

### Phase 2: Firebase authentication and repository

- Add the pinned Firebase dependency and adapter bundle.
- Add build-generated configuration and emulator support.
- Implement email/password account flows.
- Implement manifest/revision/chunk repository and owner-only rules.

### Phase 3: Safe synchronization

- Queue local commits and upload immutable snapshots.
- Download, reconstruct, validate, and explicitly apply remote snapshots.
- Implement first-sign-in comparison and conflict resolution.
- Preserve JSON backup and recovery actions.

### Phase 4: Verification and rollout

- Unit-test chunk boundaries, Unicode, digests, validation failures, retry, and
  conflict classification.
- Rules-test cross-user denial, immutable revisions, allowed fields, and size
  bounds.
- Test two browser contexts through Auth and Firestore emulators.
- Test offline edits, reconnect, interrupted uploads, stale revisions, sign-out
  with pending changes, and upgraded legacy imports.
- Release behind an opt-in feature flag before making account sync generally
  available.

## Initial Product Decisions

Unless requirements change, implementation should use these defaults:

- a separate Firebase project for FTrack rather than G-Track's project;
- email/password authentication first;
- one private `default` workspace per user;
- local-first automatic sync with visible status and conflict blocking;
- no automatic cross-device merge;
- JSON export retained as a user-controlled backup;
- no service-account or administrative credentials in the application.

Separate Firebase projects isolate security rules, billing, environments, and
incident impact. Shared/household workspaces and additional identity providers
can be designed as later additions without changing the snapshot format.
