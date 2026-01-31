// modals/actual-transaction-modal.js
// Modal for editing actual transaction details

import { createModal } from '../modal-factory.js';

export function openActualTransactionModal(transaction, { onSave } = {}) {
  const { modal, close } = createModal({ contentClass: 'modal-actual-transaction' });

  const status = typeof transaction.status === 'object' ? transaction.status.name : transaction.status;
  const actualAmount = transaction.actualAmount ?? transaction.status?.actualAmount ?? transaction.amount ?? 0;
  const actualDate = transaction.actualDate ?? transaction.status?.actualDate ?? transaction.effectiveDate ?? '';

  modal.innerHTML = `
    <h3>Actual Transaction Details</h3>
    <div class="modal-body">
      <div class="form-group">
        <label>Status:</label>
        <select id="statusSelect">
          <option value="planned" ${status === 'planned' ? 'selected' : ''}>Planned</option>
          <option value="actual" ${status === 'actual' ? 'selected' : ''}>Actual</option>
        </select>
      </div>
      <div class="form-group">
        <label>Actual Amount:</label>
        <input type="number" id="actualAmount" step="0.01" value="${actualAmount}">
      </div>
      <div class="form-group">
        <label>Actual Date:</label>
        <input type="date" id="actualDate" value="${actualDate}">
      </div>
    </div>
    <div class="modal-footer">
      <button id="cancelBtn">Cancel</button>
      <button id="saveBtn">Save</button>
    </div>
  `;

  const statusSelect = modal.querySelector('#statusSelect');
  const amountInput = modal.querySelector('#actualAmount');
  const dateInput = modal.querySelector('#actualDate');
  const saveBtn = modal.querySelector('#saveBtn');
  const cancelBtn = modal.querySelector('#cancelBtn');

  cancelBtn.addEventListener('click', close);

  saveBtn.addEventListener('click', () => {
    const payload = {
      status: statusSelect.value,
      actualAmount: amountInput.value !== '' ? Number(amountInput.value) : null,
      actualDate: dateInput.value || null
    };
    if (onSave) onSave(payload);
    close();
  });

  return { close };
}
