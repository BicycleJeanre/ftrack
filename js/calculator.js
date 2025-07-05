// Financial calculator logic partial
// --- Financial Calculator ---
function renderCalcFields() {
    const formula = getEl('calc_formula').value;
    const fields = formulaFields[formula] || [];
    const div = getEl('calc-fields');
    div.innerHTML = '';
    fields.forEach(f => {
        const label = document.createElement('label');
        label.htmlFor = 'calc_' + f.id;
        label.textContent = f.label;
        const input = document.createElement('input');
        input.type = f.type;
        input.id = 'calc_' + f.id;
        input.step = f.step;
        if (f.min) input.min = f.min;
        input.required = true;
        div.appendChild(label);
        div.appendChild(input);
    });
}
if (getEl('calc_formula')) {
    getEl('calc_formula').addEventListener('change', renderCalcFields);
    renderCalcFields();
}
if (getEl('calculatorForm')) {
    getEl('calculatorForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const formula = getEl('calc_formula').value;
        let v = {};
        (formulaFields[formula] || []).forEach(f => {
            v[f.id] = parseFloat(getEl('calc_' + f.id).value);
        });
        let result = '';
        switch (formula) {
            case 'compound-fv':
                result = v.pv * Math.pow(1 + v.r/100/v.n, v.n*v.t);
                break;
            case 'compound-pv':
                result = v.fv / Math.pow(1 + v.r/100/v.n, v.n*v.t);
                break;
            case 'annuity-fv':
                result = v.p * ( (Math.pow(1 + v.r/100/v.n, v.n*v.t) - 1) / (v.r/100/v.n) );
                break;
            case 'annuity-pv':
                result = v.p * (1 - Math.pow(1 + v.r/100/v.n, -v.n*v.t)) / (v.r/100/v.n);
                break;
            case 'annuity-due-fv':
                result = v.p * ( (Math.pow(1 + v.r/100/v.n, v.n*v.t) - 1) / (v.r/100/v.n) ) * (1 + v.r/100/v.n);
                break;
            case 'annuity-due-pv':
                result = v.p * (1 - Math.pow(1 + v.r/100/v.n, -v.n*v.t)) / (v.r/100/v.n) * (1 + v.r/100/v.n);
                break;
            case 'perpetuity-pv':
                result = v.p / (v.r/100);
                break;
            case 'ear':
                result = Math.pow(1 + v.r/100/v.n, v.n) - 1;
                break;
            default:
                result = 'N/A';
        }
        getEl('calc-result').textContent = (typeof result === 'number' && !isNaN(result)) ? 'Result: ' + result.toFixed(6) : 'Invalid input.';
    });
}
