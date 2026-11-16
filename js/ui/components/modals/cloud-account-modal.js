import { downloadAppData } from '../../../app/services/export-service.js';
import {
  createCloudAccount,
  getCloudSyncState,
  listCloudRecoveryPoints,
  resetCloudPassword,
  reviewCloudRecoveryPoint,
  resolveCloudConflict,
  signInToCloud,
  signOutOfCloud,
  subscribeCloudSync,
  syncNow
} from '../../../app/services/cloud-sync-coordinator.js?v=workshop-recovery-1';
import { confirmDialog, notifyError, notifySuccess } from '../../../shared/notifications.js';
import { createModal } from './modal-factory.js';

function formatTime(value) {
  if (!value) return 'Not yet synced';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not yet synced' : date.toLocaleString();
}

function recoveryPanel() {
  const panel = document.createElement('div');
  panel.className = 'cloud-account-info';
  panel.innerHTML = `
    <button type="button" class="modal-periodic-button modal-periodic-cancel" data-recovery="load">Find missing scenarios</button>
    <div data-recovery="results"></div>
  `;
  const load = panel.querySelector('[data-recovery="load"]');
  const results = panel.querySelector('[data-recovery="results"]');
  load.addEventListener('click', async () => {
    load.disabled = true;
    results.textContent = 'Loading cloud recovery points…';
    try {
      const points = await listCloudRecoveryPoints();
      if (!panel.isConnected) return;
      results.textContent = points.length ? '' : 'No saved cloud revisions were found for this account.';
      if (!points.length) return;
      const label = document.createElement('label');
      label.textContent = 'Cloud revision ';
      const select = document.createElement('select');
      select.className = 'modal-periodic-input';
      points.forEach(point => select.add(new Option(formatTime(point.createdAt), point.id)));
      label.append(select);
      const review = document.createElement('button');
      review.type = 'button';
      review.className = 'modal-periodic-button modal-periodic-cancel';
      review.textContent = 'Check for missing scenarios';
      const summary = document.createElement('p');
      summary.setAttribute('role', 'status');
      select.addEventListener('change', () => { summary.replaceChildren(); });
      review.addEventListener('click', async () => {
        review.disabled = select.disabled = true;
        summary.textContent = 'Checking this revision…';
        try {
          const candidate = await reviewCloudRecoveryPoint(select.value);
          if (!panel.isConnected) return;
          summary.textContent = candidate.count
            ? `${candidate.count} missing scenario(s) can be restored. Existing scenarios will be kept.`
            : 'This revision contains no scenarios missing from this device. Try an earlier revision.';
          const backup = document.createElement('button');
          backup.type = 'button';
          backup.className = 'modal-periodic-button modal-periodic-cancel';
          backup.textContent = 'Export this revision';
          backup.addEventListener('click', () => {
            try { candidate.exportBackup(); } catch (error) { notifyError(error.message); }
          });
          summary.append(' ', backup);
          if (!candidate.count) return;
          const restore = document.createElement('button');
          restore.type = 'button';
          restore.className = 'modal-periodic-button modal-periodic-save';
          restore.textContent = 'Restore missing scenarios';
          restore.addEventListener('click', async () => {
            if (!await confirmDialog('Add the missing scenarios from this revision to this device? Existing scenarios will not be overwritten.')) return;
            restore.disabled = true;
            try {
              const count = await candidate.restore();
              notifySuccess(`Restored ${count} scenario(s). Existing scenarios were kept.`);
              summary.textContent = `Restored ${count} scenario(s).`;
            } catch (error) { notifyError(error.message); restore.disabled = false; }
          });
          summary.append(' ', restore);
        } catch (error) { summary.textContent = error.message; }
        finally { review.disabled = select.disabled = false; }
      });
      results.append(label, review, summary);
    } catch (error) { results.textContent = error.message; }
    finally { load.disabled = false; }
  });
  return panel;
}

export function openCloudAccountModal() {
  const { modal, close } = createModal({
    contentClass: 'modal-periodic modal-cloud-account',
    onClose: () => unsubscribe?.()
  });
  let unsubscribe = null;

  const render = (state = getCloudSyncState()) => {
    modal.innerHTML = '';
    const heading = document.createElement('h2');
    heading.className = 'modal-periodic-title';
    heading.textContent = 'Account & Cloud Save';
    modal.appendChild(heading);

    const status = document.createElement('div');
    status.className = `cloud-account-status cloud-account-status--${state.phase}`;
    status.innerHTML = `
      <div><strong>${state.label}</strong></div>
      <div>${state.user?.email ? `Signed in as ${state.user.email}` : 'FTrack is currently using this device.'}</div>
      <div class="cloud-account-meta">Last synced: ${formatTime(state.lastSyncedAt)}</div>
    `;
    modal.appendChild(status);

    if (state.error) {
      const error = document.createElement('div');
      error.className = 'cloud-account-error';
      error.textContent = state.error;
      modal.appendChild(error);
    }

    if (!state.configured) {
      const info = document.createElement('div');
      info.className = 'cloud-account-info';
      info.innerHTML = `
        <strong>Cloud save is not configured in this build.</strong>
        <p>Add the FTrack Firebase web-app values in <code>js/config/firebase-config.js</code>, enable Email/Password Authentication and Firestore, then rebuild the Firebase client.</p>
        <p>Your financial data remains stored locally and unchanged.</p>
      `;
      modal.appendChild(info);
    } else if (!state.user) {
      const form = document.createElement('form');
      form.className = 'cloud-account-form';
      form.innerHTML = `
        <label class="modal-periodic-label" for="cloud-account-email">Email</label>
        <input class="modal-periodic-input" id="cloud-account-email" type="email" autocomplete="email" required>
        <label class="modal-periodic-label" for="cloud-account-password">Password</label>
        <input class="modal-periodic-input" id="cloud-account-password" type="password" autocomplete="current-password" minlength="6" required>
        <div class="modal-periodic-hint">Signing in never silently replaces meaningful data on this device.</div>
        <div class="modal-periodic-actions cloud-account-actions">
          <button type="button" class="modal-periodic-button modal-periodic-cancel" data-action="reset">Reset password</button>
          <button type="button" class="modal-periodic-button modal-periodic-cancel" data-action="create">Create account</button>
          <button type="submit" class="modal-periodic-button modal-periodic-save">Sign in</button>
        </div>
      `;
      const email = form.querySelector('#cloud-account-email');
      const password = form.querySelector('#cloud-account-password');
      const run = async (action) => {
        if (!email.reportValidity()) return;
        if (action !== 'reset' && !password.reportValidity()) return;
        form.querySelectorAll('button,input').forEach((control) => { control.disabled = true; });
        try {
          if (action === 'create') await createCloudAccount(email.value, password.value);
          else if (action === 'reset') {
            await resetCloudPassword(email.value);
            notifySuccess('Password reset email sent.');
          } else await signInToCloud(email.value, password.value);
        } catch (error) {
          notifyError(error.message);
          form.querySelectorAll('button,input').forEach((control) => { control.disabled = false; });
        }
      };
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        void run('signin');
      });
      form.querySelector('[data-action="create"]').addEventListener('click', () => void run('create'));
      form.querySelector('[data-action="reset"]').addEventListener('click', () => void run('reset'));
      modal.appendChild(form);
    } else {
      if (state.phase === 'conflict') {
        const conflict = document.createElement('div');
        conflict.className = 'cloud-account-conflict';
        conflict.innerHTML = `
          <strong>Choose which complete workspace to keep</strong>
          <p>Export a backup first if you need to preserve both versions. FTrack will not merge or overwrite them automatically.</p>
          <div class="cloud-account-actions">
            <button type="button" class="modal-periodic-button modal-periodic-cancel" data-action="backup">Export this device</button>
            <button type="button" class="modal-periodic-button modal-periodic-cancel" data-action="cloud">Use cloud version</button>
            <button type="button" class="modal-periodic-button modal-periodic-save" data-action="local">Keep this device</button>
          </div>
        `;
        conflict.querySelector('[data-action="backup"]').addEventListener('click', () => void downloadAppData());
        conflict.querySelector('[data-action="cloud"]').addEventListener('click', async () => {
          if (!await confirmDialog('Replace this device data with the validated cloud workspace? Export a backup first if needed.')) return;
          try { await resolveCloudConflict('cloud'); } catch (error) { notifyError(error.message); }
        });
        conflict.querySelector('[data-action="local"]').addEventListener('click', async () => {
          if (!await confirmDialog('Publish this device as the current cloud workspace? The previous cloud revision will remain in history.')) return;
          try { await resolveCloudConflict('local'); } catch (error) { notifyError(error.message); }
        });
        modal.appendChild(conflict);
      }

      const actions = document.createElement('div');
      actions.className = 'modal-periodic-actions cloud-account-actions';
      actions.innerHTML = `
        <button type="button" class="modal-periodic-button modal-periodic-cancel" data-action="backup">Export backup</button>
        <button type="button" class="modal-periodic-button modal-periodic-save" data-action="sync" ${state.phase === 'saving' || state.phase === 'conflict' ? 'disabled' : ''}>Sync now</button>
        <button type="button" class="modal-periodic-button modal-periodic-cancel" data-action="signout">Sign out</button>
      `;
      actions.querySelector('[data-action="backup"]').addEventListener('click', () => void downloadAppData());
      actions.querySelector('[data-action="sync"]').addEventListener('click', async () => {
        try { await syncNow(); } catch (error) { notifyError(error.message); }
      });
      actions.querySelector('[data-action="signout"]').addEventListener('click', async () => {
        if (state.pending && !await confirmDialog('This device still has unsynchronized changes. Sign out anyway? The local data will remain on this device.')) return;
        try { await signOutOfCloud(); } catch (error) { notifyError(error.message); }
      });
      modal.appendChild(actions);
      modal.appendChild(recoveryPanel());
    }

    const footer = document.createElement('div');
    footer.className = 'modal-periodic-actions';
    footer.innerHTML = '<button type="button" class="modal-periodic-button modal-periodic-cancel">Close</button>';
    footer.querySelector('button').addEventListener('click', close);
    modal.appendChild(footer);
  };

  unsubscribe = subscribeCloudSync(render);
}
