// budget-review-reminders.js
// Scenario reminders shown above every dashboard workflow.

function localTodayKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatReviewDate(dateOnly) {
  if (!dateOnly) return 'Next budget review';
  const [year, month, day] = String(dateOnly).split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  if (Number.isNaN(date.getTime())) return dateOnly;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date);
}

function buildActionButton({ label, title, className = '', onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `icon-btn ${className}`.trim();
  button.textContent = label;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick?.();
  });
  return button;
}

export function renderBudgetReviewReminders({
  container,
  controls,
  reminders = [],
  onAdd,
  onEdit,
  onComplete
} = {}) {
  if (!container || !controls) return;

  controls.querySelector('.budget-review-reminder-add')?.remove();
  const activeReminders = Array.isArray(reminders) ? reminders : [];

  const addButton = buildActionButton({
    label: activeReminders.length ? `🔔 ${activeReminders.length}` : '🔔 Add reminder',
    title: 'Add review reminder',
    className: 'budget-review-reminder-add',
    onClick: onAdd
  });
  controls.appendChild(addButton);

  container.replaceChildren();
  container.className = 'budget-review-reminders';
  container.hidden = activeReminders.length === 0;
  if (!activeReminders.length) return;

  const heading = document.createElement('div');
  heading.className = 'budget-review-reminders-heading';
  const headingText = document.createElement('strong');
  headingText.textContent = 'Active reminders';
  const headingHint = document.createElement('span');
  headingHint.textContent = 'Pinned until marked done';
  heading.append(headingText, headingHint);

  const list = document.createElement('div');
  list.className = 'budget-review-reminders-list';
  const today = localTodayKey();

  activeReminders.forEach((reminder) => {
    const item = document.createElement('article');
    item.className = 'budget-review-reminder';
    item.dataset.reminderId = String(reminder.id);
    const isDue = Boolean(reminder.reviewDate && reminder.reviewDate <= today);
    item.classList.toggle('is-due', isDue);

    const content = document.createElement('div');
    content.className = 'budget-review-reminder-content';
    const meta = document.createElement('span');
    meta.className = 'budget-review-reminder-meta';
    meta.textContent = isDue
      ? `Due · ${formatReviewDate(reminder.reviewDate)}`
      : formatReviewDate(reminder.reviewDate);
    const note = document.createElement('p');
    note.className = 'budget-review-reminder-note';
    note.textContent = reminder.note;
    content.append(meta, note);

    const actions = document.createElement('div');
    actions.className = 'budget-review-reminder-actions';
    actions.append(
      buildActionButton({
        label: 'Edit',
        title: 'Edit review reminder',
        onClick: () => onEdit?.(reminder)
      }),
      buildActionButton({
        label: '✓ Done',
        title: 'Mark review reminder done',
        className: 'budget-review-reminder-done',
        onClick: () => onComplete?.(reminder)
      })
    );

    item.append(content, actions);
    list.appendChild(item);
  });

  container.append(heading, list);
}
