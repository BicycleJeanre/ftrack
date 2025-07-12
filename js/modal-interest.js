// modal-interest.js
// Reusable Interest Modal for Accounts

export const InterestModal = {
  modal: null,
  onSave: null,
  onCancel: null,
  show(account, onSave, onCancel) {
    this.onSave = onSave;
    this.onCancel = onCancel;
    if (!this.modal) this.create();
    // Populate fields
    document.getElementById('modal_acct_interest').value = account.interest ?? 0;
    document.getElementById('modal_acct_interest_period').value = account.interest_period || 'month';
    document.getElementById('modal_acct_compound_period').value = account.compound_period || 'month';
    document.getElementById('modal_acct_interest_type').value = account.interest_type || 'compound';
    this.modal.style.display = 'flex';
  },
  hide() {
    if (this.modal) this.modal.style.display = 'none';
    if (typeof this.onCancel === 'function') this.onCancel();
  },
  create() {
    // Only create once
    if (this.modal) return;
    const modal = document.createElement('div');
    modal.id = 'interestModal';
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="modal-content">
        <span class="close" id="closeInterestModal">&times;</span>
        <h3>Interest Settings</h3>
        <form id="interestForm">
          <label for="modal_acct_interest">Interest Rate</label>
          <input type="number" id="modal_acct_interest" value="0" step="0.01" placeholder="e.g. 0.5">
          <label for="modal_acct_interest_period">Interest Rate Period</label>
          <select id="modal_acct_interest_period">
            <option value="year">per Year</option>
            <option value="quarter">per Quarter</option>
            <option value="month">per Month</option>
            <option value="week">per Week</option>
            <option value="day">per Day</option>
          </select>
          <label for="modal_acct_compound_period">Compounding Period</label>
          <select id="modal_acct_compound_period">
            <option value="year">Yearly</option>
            <option value="quarter">Quarterly</option>
            <option value="month">Monthly</option>
            <option value="week">Weekly</option>
            <option value="day">Daily</option>
          </select>
          <label for="modal_acct_interest_type">Interest Type</label>
          <select id="modal_acct_interest_type">
            <option value="simple">Simple</option>
            <option value="compound">Compound</option>
          </select>
          <div class="modal-actions">
            <button type="button" id="saveInterestBtn">Save</button>
            <button type="button" id="cancelInterestBtn">Cancel</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    this.modal = modal;
    // Event listeners
    document.getElementById('closeInterestModal').onclick = () => this.hide();
    document.getElementById('cancelInterestBtn').onclick = () => this.hide();
    document.getElementById('saveInterestBtn').onclick = () => {
      const data = {
        interest: parseFloat(document.getElementById('modal_acct_interest').value),
        interest_period: document.getElementById('modal_acct_interest_period').value,
        compound_period: document.getElementById('modal_acct_compound_period').value,
        interest_type: document.getElementById('modal_acct_interest_type').value
      };
      if (typeof this.onSave === 'function') this.onSave(data);
      this.hide();
    };
  }
};
