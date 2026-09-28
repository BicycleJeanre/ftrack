import { loadLookup } from '../../../app/services/lookup-service.js';
import { createModal } from './modal-factory.js';

export async function openQuickAccountModal({ defaultTypeId = 1 } = {}) {
  const lookupData = await loadLookup('lookup-data.json');
  const accountTypes = Array.isArray(lookupData?.accountTypes) ? lookupData.accountTypes : [];
  const currencies = Array.isArray(lookupData?.currencies) ? lookupData.currencies : [];

  return await new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const { modal, close } = createModal({
      contentClass: 'modal-periodic modal-quick-account',
      onClose: () => finish(null)
    });

    modal.innerHTML = `
      <h2 class="modal-periodic-title">Add Account</h2>
      <form class="modal-quick-account-form">
        <div class="modal-periodic-form-group">
          <label class="modal-periodic-label" for="quickAccountName">Name</label>
          <input id="quickAccountName" class="modal-periodic-input" required autocomplete="off">
        </div>
        <div class="modal-periodic-form-group">
          <label class="modal-periodic-label" for="quickAccountType">Type</label>
          <select id="quickAccountType" class="modal-periodic-select">
            ${accountTypes.map((type) => (
              `<option value="${type.id}"${Number(type.id) === Number(defaultTypeId) ? ' selected' : ''}>${type.name}</option>`
            )).join('')}
          </select>
        </div>
        <div class="modal-periodic-form-group">
          <label class="modal-periodic-label" for="quickAccountCurrency">Currency</label>
          <select id="quickAccountCurrency" class="modal-periodic-select">
            ${currencies.map((currency) => (
              `<option value="${currency.id}">${currency.name}</option>`
            )).join('')}
          </select>
        </div>
        <div class="modal-periodic-form-group">
          <label class="modal-periodic-label" for="quickAccountBalance">Starting Balance</label>
          <input id="quickAccountBalance" class="modal-periodic-input" type="number" step="0.01" value="0">
        </div>
        <div class="modal-quick-account-error" role="alert" aria-live="polite"></div>
        <div class="modal-periodic-actions">
          <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Use Account</button>
        </div>
      </form>
    `;

    const form = modal.querySelector('form');
    const nameInput = modal.querySelector('#quickAccountName');
    const typeSelect = modal.querySelector('#quickAccountType');
    const currencySelect = modal.querySelector('#quickAccountCurrency');
    const balanceInput = modal.querySelector('#quickAccountBalance');
    const error = modal.querySelector('.modal-quick-account-error');

    modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => close());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = String(nameInput.value || '').trim();
      if (!name) {
        error.textContent = 'Enter an account name.';
        nameInput.focus();
        return;
      }
      const type = accountTypes.find((item) => Number(item.id) === Number(typeSelect.value)) || null;
      const currency = currencies.find(
        (item) => Number(item.id) === Number(currencySelect.value)
      ) || null;
      const startingBalance = Number(balanceInput.value || 0);
      finish({
        name,
        type,
        currency,
        startingBalance: Number.isFinite(startingBalance) ? startingBalance : 0,
        periodicChange: null
      });
      close();
    });

    setTimeout(() => nameInput?.focus(), 10);
  });
}
