// budget-review-reminder-modal.js
// Create or edit a scenario-level note shown across dashboard workflows.

import { createModal } from './modal-factory.js';

export function openBudgetReviewReminderModal({ reminder = null, onSave } = {}) {
  const { modal, close } = createModal({ contentClass: 'budget-review-reminder-modal' });

  const title = document.createElement('h2');
  title.className = 'budget-review-reminder-modal-title';
  title.textContent = reminder ? 'Edit Review Reminder' : 'Add Review Reminder';

  const description = document.createElement('p');
  description.className = 'budget-review-reminder-modal-description';
  description.textContent = 'This note stays visible across this scenario’s dashboards until you mark it done.';

  const noteLabel = document.createElement('label');
  noteLabel.className = 'budget-review-reminder-modal-field';
  noteLabel.textContent = 'Payment or item to remember';
  const noteInput = document.createElement('textarea');
  noteInput.id = 'budget-review-reminder-note';
  noteInput.className = 'input-textarea';
  noteInput.rows = 4;
  noteInput.maxLength = 1000;
  noteInput.placeholder = 'For example: Include the annual insurance payment in the next budget review.';
  noteInput.value = reminder?.note || '';
  noteLabel.appendChild(noteInput);

  const dateLabel = document.createElement('label');
  dateLabel.className = 'budget-review-reminder-modal-field';
  dateLabel.textContent = 'Review date (optional)';
  const dateInput = document.createElement('input');
  dateInput.id = 'budget-review-reminder-date';
  dateInput.className = 'input-text';
  dateInput.type = 'date';
  dateInput.value = reminder?.reviewDate || '';
  dateLabel.appendChild(dateInput);

  const hint = document.createElement('span');
  hint.className = 'budget-review-reminder-modal-hint';
  hint.textContent = 'Leave the date empty when the note applies to your next review, whenever that happens.';
  dateLabel.appendChild(hint);

  const error = document.createElement('div');
  error.className = 'budget-review-reminder-modal-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'budget-review-reminder-modal-actions';
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'icon-btn';
  cancelButton.textContent = 'Cancel';
  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'icon-btn icon-btn--primary';
  saveButton.textContent = reminder ? 'Save Reminder' : 'Add Reminder';
  actions.append(cancelButton, saveButton);

  modal.append(title, description, noteLabel, dateLabel, error, actions);

  cancelButton.addEventListener('click', close);
  saveButton.addEventListener('click', async () => {
    const note = noteInput.value.trim();
    if (!note) {
      error.textContent = 'Enter the payment or item you want to remember.';
      error.hidden = false;
      noteInput.focus();
      return;
    }

    error.hidden = true;
    saveButton.disabled = true;
    cancelButton.disabled = true;
    try {
      await onSave?.({ note, reviewDate: dateInput.value || null });
      close();
    } catch (saveError) {
      error.textContent = saveError?.message || 'The reminder could not be saved.';
      error.hidden = false;
      saveButton.disabled = false;
      cancelButton.disabled = false;
    }
  });

  noteInput.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      saveButton.click();
    }
  });

  setTimeout(() => {
    noteInput.focus();
    noteInput.setSelectionRange(noteInput.value.length, noteInput.value.length);
  }, 10);

  return { close };
}
