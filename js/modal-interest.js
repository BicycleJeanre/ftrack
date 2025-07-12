// modal-interest.js
// Reusable Interest Modal for Accounts

export const InterestModal = {
  modal: null,
  onSave: null,
  onCancel: null,
  
  // --- Calculation Helpers ---
  getPeriodsPerYear(period) {
    switch (period) {
      case 'day': return 365;
      case 'week': return 52;
      case 'month': return 12;
      case 'quarter': return 4;
      case 'year': return 1;
      default: return 1;
    }
  },

  calculateEffectiveRate(nominalRate, compoundingPeriod) {
    if (compoundingPeriod === 'none' || compoundingPeriod === 'simple') return nominalRate;
    const n = this.getPeriodsPerYear(compoundingPeriod);
    const i = nominalRate / 100;
    const ear = (Math.pow(1 + i / n, n) - 1) * 100;
    return ear;
  },

  calculateNominalRate(effectiveRate, compoundingPeriod) {
    if (compoundingPeriod === 'none' || compoundingPeriod === 'simple') return effectiveRate;
    const n = this.getPeriodsPerYear(compoundingPeriod);
    const ear = effectiveRate / 100;
    const i = n * (Math.pow(1 + ear, 1 / n) - 1) * 100;
    return i;
  },

  // --- UI Update Handlers ---
  updateRates(source) {
    const nominalRateEl = document.getElementById('modal_acct_nominal_rate');
    const effectiveRateEl = document.getElementById('modal_acct_effective_rate');
    const compoundingPeriod = document.getElementById('modal_acct_compound_period').value;

    if (source === 'nominal') {
      const nominalRate = parseFloat(nominalRateEl.value) || 0;
      const effectiveRate = this.calculateEffectiveRate(nominalRate, compoundingPeriod);
      effectiveRateEl.value = effectiveRate.toFixed(4);
    } else if (source === 'effective') {
      const effectiveRate = parseFloat(effectiveRateEl.value) || 0;
      const nominalRate = this.calculateNominalRate(effectiveRate, compoundingPeriod);
      nominalRateEl.value = nominalRate.toFixed(4);
    }
  },

  handleStandardRateChange() {
    const standardRate = document.getElementById('modal_standard_rate').value;
    const interestPeriodEl = document.getElementById('modal_acct_interest_period');
    const compoundPeriodEl = document.getElementById('modal_acct_compound_period');
    const interestTypeEl = document.getElementById('modal_acct_interest_type');
    const customFieldsContainer = document.getElementById('custom-interest-fields');

    if (standardRate === 'custom') {
      customFieldsContainer.style.display = 'block';
      this.enableCustomFields();
      return;
    }

    customFieldsContainer.style.display = 'none';
    interestPeriodEl.value = 'year'; // Standard rates are annual
    interestTypeEl.value = 'compound';
    
    switch (standardRate) {
      case 'nacm': compoundPeriodEl.value = 'month'; break;
      case 'nacq': compoundPeriodEl.value = 'quarter'; break;
      case 'nacs': compoundPeriodEl.value = 'semi-annual'; break; // Assuming semi-annual option exists
      case 'naca': compoundPeriodEl.value = 'year'; break;
      case 'nacw': compoundPeriodEl.value = 'week'; break;
      case 'nacd': compoundPeriodEl.value = 'day'; break;
    }
    
    // Disable fields that are now fixed by the standard
    interestPeriodEl.disabled = true;
    compoundPeriodEl.disabled = true;
    interestTypeEl.disabled = true;

    this.updateRates('nominal');
    this.updateCompoundingVisibility();
  },

  enableCustomFields() {
    document.getElementById('custom-interest-fields').style.display = 'block';
    document.getElementById('modal_acct_interest_period').disabled = false;
    document.getElementById('modal_acct_compound_period').disabled = false;
    document.getElementById('modal_acct_interest_type').disabled = false;
    document.getElementById('modal_standard_rate').value = 'custom';
  },

  // --- Modal Lifecycle ---
  show(account, onSave, onCancel) {
    this.onSave = onSave;
    this.onCancel = onCancel;
    if (!this.modal) this.create();

    // Reset fields to default/editable state
    this.enableCustomFields();
    document.getElementById('custom-interest-fields').style.display = 'block';

    // Populate fields from account data
    document.getElementById('modal_acct_nominal_rate').value = account.interest ?? 0;
    document.getElementById('modal_acct_interest_period').value = account.interest_period || 'year';
    document.getElementById('modal_acct_interest_type').value = account.interest_type || 'compound';
    document.getElementById('modal_acct_compound_period').value = account.compound_period || 'month';
    
    // Initial calculation
    this.updateRates('nominal');
    this.updateCompoundingVisibility();
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
        <form id="interestForm" onsubmit="return false;">
          <div class="form-field">
            <label for="modal_standard_rate">Standard Calculation <span class="tooltip" title="Select a standard convention to pre-fill rate and compounding periods.">?</span></label>
            <select id="modal_standard_rate">
              <option value="custom">Custom</option>
              <option value="nacm">NACM (Compounded Monthly)</option>
              <option value="nacq">NACQ (Compounded Quarterly)</option>
              <option value="naca">NACA (Compounded Annually)</option>
              <option value="nacw">NACW (Compounded Weekly)</option>
              <option value="nacd">NACD (Compounded Daily)</option>
            </select>
          </div>
          <hr/>
          <div class="form-field">
            <label for="modal_acct_nominal_rate">Nominal Annual Rate (%) <span class="tooltip" title="The stated annual interest rate before accounting for compounding.">?</span></label>
            <input type="number" id="modal_acct_nominal_rate" value="0" step="0.01">
          </div>
          <div class="form-field">
            <label for="modal_acct_effective_rate">Effective Annual Rate (EAR) (%) <span class="tooltip" title="The actual rate of return after accounting for compounding.">?</span></label>
            <input type="number" id="modal_acct_effective_rate" value="0" step="0.0001">
          </div>
          <div id="custom-interest-fields">
            <div class="form-field">
              <label for="modal_acct_interest_period">Nominal Rate Period <span class="tooltip" title="The frequency at which the nominal rate is quoted (usually Annually for standard rates).">?</span></label>
              <select id="modal_acct_interest_period">
                <option value="year">Annually</option>
                <option value="month">Monthly</option>
                <option value="week">Weekly</option>
                <option value="day">Daily</option>
              </select>
            </div>
            <div class="form-field">
              <label for="modal_acct_interest_type">Calculation Method <span class="tooltip" title="Choose between Simple or Compound interest.">?</span></label>
              <select id="modal_acct_interest_type">
                <option value="simple">Simple</option>
                <option value="compound">Compound</option>
                <option value="continuous" disabled>Continuous (coming soon)</option>
              </select>
            </div>
            <div class="form-field" id="compounding-period-field">
              <label for="modal_acct_compound_period">Compounding Interval <span class="tooltip" title="How often interest is calculated and added to the principal.">?</span></label>
              <select id="modal_acct_compound_period">
                <option value="none">None</option>
                <option value="day">Daily</option>
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
                <option value="quarter">Quarterly</option>
                <option value="year">Annually</option>
              </select>
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" id="saveInterestBtn">Save</button>
            <button type="button" id="cancelInterestBtn">Cancel</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    this.modal = modal;

    // --- Event Listeners ---
    document.getElementById('closeInterestModal').onclick = () => this.hide();
    document.getElementById('cancelInterestBtn').onclick = () => this.hide();
    
    // Calculation triggers
    document.getElementById('modal_acct_nominal_rate').oninput = () => this.updateRates('nominal');
    document.getElementById('modal_acct_effective_rate').oninput = () => this.updateRates('effective');
    document.getElementById('modal_acct_compound_period').onchange = () => {
        this.enableCustomFields();
        this.updateRates('nominal');
    };
    document.getElementById('modal_acct_interest_period').onchange = () => {
        this.enableCustomFields();
        this.updateRates('nominal');
    };
    document.getElementById('modal_acct_interest_type').onchange = () => {
        this.enableCustomFields();
        this.updateCompoundingVisibility();
    };
    document.getElementById('modal_standard_rate').onchange = () => this.handleStandardRateChange();

    // Save button
    document.getElementById('saveInterestBtn').onclick = () => {
      const data = {
        interest: parseFloat(document.getElementById('modal_acct_nominal_rate').value),
        interest_period: document.getElementById('modal_acct_interest_period').value,
        interest_type: document.getElementById('modal_acct_interest_type').value,
        compound_period: document.getElementById('modal_acct_compound_period').value
      };
      if (typeof this.onSave === 'function') this.onSave(data);
      this.hide();
    };
    
    this.updateCompoundingVisibility();
  },

  updateCompoundingVisibility() {
    const interestType = document.getElementById('modal_acct_interest_type').value;
    const compoundingField = document.getElementById('compounding-period-field');
    const compoundingSelect = document.getElementById('modal_acct_compound_period');

    if (interestType === 'simple') {
      compoundingField.style.display = 'none';
      compoundingSelect.value = 'none';
    } else {
      compoundingField.style.display = 'block';
      if (compoundingSelect.value === 'none') {
        compoundingSelect.value = 'month';
      }
    }
    this.updateRates('nominal'); // Recalculate when visibility changes
  }
};
