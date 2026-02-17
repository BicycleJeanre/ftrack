// periodic-change-schedule-modal.js
// Modal for editing an account-level periodic change schedule (date-bounded overrides)

import { createModal } from './modal-factory.js';
import { openPeriodicChangeModal } from './periodic-change-modal.js';
import { getPeriodicChangeDescription } from '../../../domain/calculations/periodic-change-utils.js';
import { parseDateOnly, formatDateOnly } from '../../../shared/date-utils.js';
import { notifyError } from '../../../shared/notifications.js';

function toDateOnly(value) {
  const d = value instanceof Date ? value : parseDateOnly(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.valueOf());
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function normalizeEntries(entries = []) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((e) => ({
      startDate: e?.startDate || '',
      endDate: e?.endDate ?? '',
      periodicChange: e?.periodicChange ?? null
    }))
    .filter((e) => !!String(e.startDate || '').trim());
}

function validateNoOverlaps(sortedEntries) {
  for (let i = 0; i < sortedEntries.length; i++) {
    const current = sortedEntries[i];
    const currentStart = toDateOnly(current.startDate);
    const currentEnd = current.endDate ? toDateOnly(current.endDate) : null;

    if (!isValidDate(currentStart)) {
      return 'Each schedule entry must have a valid start date.';
    }

    if (currentEnd && !isValidDate(currentEnd)) {
      return 'Each schedule entry must have a valid end date (or be blank).';
    }

    if (currentEnd && currentEnd < currentStart) {
      return 'Schedule entry end date must be on or after start date.';
    }

    if (i === 0) continue;

    const prev = sortedEntries[i - 1];
    const prevStart = toDateOnly(prev.startDate);
    const prevEnd = prev.endDate ? toDateOnly(prev.endDate) : null;

    if (!isValidDate(prevStart)) {
      return 'Each schedule entry must have a valid start date.';
    }

    if (!prevEnd) {
      return 'Only the last schedule entry may be open-ended.';
    }

    // Overlap check is inclusive.
    if (currentStart <= prevEnd) {
      return 'Schedule entries may not overlap. Adjust the start/end dates.';
    }

    // Optional: allow a gap or a clean handoff; both are fine.
    // A clean handoff is currentStart === addDays(prevEnd, 1).
  }

  return null;
}

export async function openPeriodicChangeScheduleModal(
  { basePeriodicChange = null, schedule = [] } = {},
  onSave
) {
  const { modal, close } = createModal({ contentClass: 'modal-periodic' });

  let entries = normalizeEntries(schedule);

  modal.innerHTML = `
    <h2 class="modal-periodic-title">Edit Periodic Change Schedule</h2>
    <div class="modal-periodic-hint" style="margin-bottom: 10px;">
      Add date-bounded overrides for this account. Outside these dates, the account's Periodic Change applies.
    </div>

    <div id="pcsEntries" class="modal-periodic-form-group"></div>

    <div class="modal-periodic-actions" style="display:flex; gap:8px; justify-content:space-between; margin-top:12px;">
      <button id="pcsAdd" class="btn btn-secondary">+ Add Entry</button>
      <div style="display:flex; gap:8px;">
        <button id="pcsCancel" class="btn btn-ghost">Cancel</button>
        <button id="pcsSave" class="btn btn-primary">Save</button>
      </div>
    </div>
  `;

  const entriesEl = modal.querySelector('#pcsEntries');
  const addBtn = modal.querySelector('#pcsAdd');
  const cancelBtn = modal.querySelector('#pcsCancel');
  const saveBtn = modal.querySelector('#pcsSave');

  cancelBtn.addEventListener('click', () => close());

  async function render() {
    entriesEl.innerHTML = '';

    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'modal-periodic-hint';
      empty.textContent = 'No schedule entries. Click “Add Entry” to define a rate window.';
      entriesEl.appendChild(empty);
      return;
    }

    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];

      const row = document.createElement('div');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '160px 160px 1fr auto';
      row.style.gap = '8px';
      row.style.alignItems = 'center';
      row.style.marginBottom = '8px';

      const startInput = document.createElement('input');
      startInput.type = 'date';
      startInput.className = 'modal-periodic-input';
      startInput.value = entry.startDate || '';
      startInput.addEventListener('change', (e) => {
        entry.startDate = e.target.value;
      });

      const endInput = document.createElement('input');
      endInput.type = 'date';
      endInput.className = 'modal-periodic-input';
      endInput.value = entry.endDate || '';
      endInput.addEventListener('change', (e) => {
        entry.endDate = e.target.value;
      });

      const pcSummary = document.createElement('div');
      pcSummary.className = 'modal-periodic-hint';
      pcSummary.style.margin = '0';
      pcSummary.textContent = 'Loading…';

      const summaryText = await getPeriodicChangeDescription(entry.periodicChange);
      pcSummary.textContent = summaryText || 'None';

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '6px';

      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-secondary';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', async () => {
        await openPeriodicChangeModal(entry.periodicChange ?? basePeriodicChange, async (nextPc) => {
          entry.periodicChange = nextPc;
          const nextSummary = await getPeriodicChangeDescription(entry.periodicChange);
          pcSummary.textContent = nextSummary || 'None';
        });
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-danger';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        entries.splice(index, 1);
        render();
      });

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      row.appendChild(startInput);
      row.appendChild(endInput);
      row.appendChild(pcSummary);
      row.appendChild(actions);

      entriesEl.appendChild(row);
    }
  }

  addBtn.addEventListener('click', async () => {
    const today = formatDateOnly(new Date());
    entries.push({
      startDate: today,
      endDate: '',
      periodicChange: basePeriodicChange
    });
    await render();
  });

  saveBtn.addEventListener('click', () => {
    const trimmed = normalizeEntries(entries).map((e) => ({
      startDate: String(e.startDate || '').trim(),
      endDate: String(e.endDate || '').trim() || null,
      periodicChange: e.periodicChange ?? null
    }));

    // Sort by startDate
    const sorted = trimmed
      .slice()
      .sort((a, b) => toDateOnly(a.startDate) - toDateOnly(b.startDate));

    const error = validateNoOverlaps(sorted);
    if (error) {
      notifyError(error);
      return;
    }

    onSave?.(sorted);
    close();
  });

  await render();

  return { close };
}
