import {
  assertCurrentSchemaVersion,
  sanitizeAppDataForWrite
} from '../../shared/app-data-utils.js';
import { validateAppData } from './validation-service.js';

export const CLOUD_SNAPSHOT_FORMAT = 'ftrack-snapshot-v1';
export const DEFAULT_CHUNK_BYTES = 512 * 1024;

function bytesToBase64(bytes) {
  let binary = '';
  const stride = 0x8000;
  for (let index = 0; index < bytes.length; index += stride) {
    binary += String.fromCharCode(...bytes.subarray(index, index + stride));
  }
  if (typeof btoa === 'function') return btoa(binary);
  return Buffer.from(binary, 'binary').toString('base64');
}

function base64ToBytes(value) {
  const binary = typeof atob === 'function'
    ? atob(value)
    : Buffer.from(value, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sha256Hex(bytes) {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new Error('Secure hashing is unavailable in this runtime.');
  }
  const digest = new Uint8Array(await cryptoApi.subtle.digest('SHA-256', bytes));
  return [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function assertValidCurrentData(data) {
  assertCurrentSchemaVersion(data);
  const sanitized = sanitizeAppDataForWrite(data);
  const validation = validateAppData(sanitized);
  if (!validation.isValid) {
    const error = new Error(`Cloud snapshot validation failed with ${validation.totalIssues} issue(s).`);
    error.name = 'CloudSnapshotValidationError';
    error.validation = validation;
    throw error;
  }
  return sanitized;
}

export async function encodeCloudSnapshot(data, options = {}) {
  const chunkBytes = Number(options.chunkBytes || DEFAULT_CHUNK_BYTES);
  if (!Number.isInteger(chunkBytes) || chunkBytes < 1024) {
    throw new Error('chunkBytes must be an integer of at least 1024 bytes.');
  }

  const sanitized = assertValidCurrentData(data);
  const bytes = new TextEncoder().encode(JSON.stringify(sanitized));
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    chunks.push({
      index: chunks.length,
      data: bytesToBase64(bytes.subarray(offset, offset + chunkBytes))
    });
  }
  if (chunks.length === 0) chunks.push({ index: 0, data: '' });

  return {
    format: CLOUD_SNAPSHOT_FORMAT,
    schemaVersion: sanitized.schemaVersion,
    chunkCount: chunks.length,
    byteLength: bytes.length,
    sha256: await sha256Hex(bytes),
    chunks
  };
}

export async function decodeCloudSnapshot(metadata, chunks) {
  if (metadata?.format !== CLOUD_SNAPSHOT_FORMAT) {
    throw new Error(`Unsupported cloud snapshot format: ${String(metadata?.format || 'missing')}`);
  }
  const expectedCount = Number(metadata.chunkCount);
  if (!Number.isInteger(expectedCount) || expectedCount < 1) {
    throw new Error('Cloud snapshot has an invalid chunk count.');
  }
  if (!Array.isArray(chunks) || chunks.length !== expectedCount) {
    throw new Error(`Cloud snapshot is incomplete: expected ${expectedCount} chunk(s), received ${chunks?.length || 0}.`);
  }

  const ordered = [...chunks].sort((left, right) => Number(left.index) - Number(right.index));
  ordered.forEach((chunk, index) => {
    if (Number(chunk.index) !== index || typeof chunk.data !== 'string') {
      throw new Error(`Cloud snapshot chunk ${index} is missing or invalid.`);
    }
  });

  const decoded = ordered.map((chunk) => base64ToBytes(chunk.data));
  const byteLength = decoded.reduce((total, bytes) => total + bytes.length, 0);
  if (byteLength !== Number(metadata.byteLength)) {
    throw new Error(`Cloud snapshot length mismatch: expected ${metadata.byteLength}, received ${byteLength}.`);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  decoded.forEach((part) => {
    bytes.set(part, offset);
    offset += part.length;
  });
  const digest = await sha256Hex(bytes);
  if (digest !== metadata.sha256) {
    throw new Error('Cloud snapshot integrity check failed.');
  }

  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error(`Cloud snapshot is not valid JSON: ${error.message}`);
  }
  return assertValidCurrentData(parsed);
}

export function classifyCloudReconciliation({
  lastSyncedRevision = null,
  remoteRevision = null,
  hasPendingLocalChanges = false,
  localHash = null,
  remoteHash = null,
  localIsDefault = false
} = {}) {
  if (!remoteRevision) return hasPendingLocalChanges ? 'upload-local' : 'publish-initial';
  if (localHash && remoteHash && localHash === remoteHash) return 'already-synced';
  if (lastSyncedRevision && lastSyncedRevision === remoteRevision) {
    return hasPendingLocalChanges ? 'upload-local' : 'already-synced';
  }
  if (!lastSyncedRevision && localIsDefault) return 'download-remote';
  if (!hasPendingLocalChanges && lastSyncedRevision) return 'download-remote';
  return 'conflict';
}
