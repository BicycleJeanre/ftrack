// ui-state-manager.js
// Minimal manager for reading/writing persisted UiState (schemaVersion 43).

import * as DataStore from '../services/storage-service.js';
import { createDefaultUiState, normalizeUiState } from '../../shared/app-data-utils.js';

export async function get() {
  const value = await DataStore.query('uiState');
  return normalizeUiState(value);
}

export async function set(nextUiState) {
  const normalized = normalizeUiState(nextUiState);
  await DataStore.update('uiState', normalized);
  return normalized;
}

export async function patch(partial = {}) {
  const safePartial = partial && typeof partial === 'object' ? partial : {};

  const updated = await DataStore.transaction(async (data) => {
    const current = normalizeUiState(data?.uiState || createDefaultUiState());

    const next = {
      ...current,
      ...safePartial,
      viewPeriodTypeIds: {
        ...(current.viewPeriodTypeIds || {}),
        ...(safePartial.viewPeriodTypeIds && typeof safePartial.viewPeriodTypeIds === 'object' ? safePartial.viewPeriodTypeIds : {})
      }
    };

    data.uiState = normalizeUiState(next);
    return data;
  });

  return normalizeUiState(updated?.uiState);
}

