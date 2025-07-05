// Shared default data for standalone/demo mode
if (typeof window !== 'undefined') {
    if (typeof window.accounts === 'undefined') {
        window.accounts = [
            { name: 'Checking', balance: 1200.00, interest: 0.5, interest_period: 'month', compound_period: 'month', interest_type: 'compound' },
            { name: 'Savings', balance: 5000.00, interest: 1.2, interest_period: 'year', compound_period: 'year', interest_type: 'simple' }
        ];
    }
    if (typeof window.transactions === 'undefined') {
        window.transactions = [
            { name: 'Salary', account: 'Checking', amount: 1000, date: '2025-07-01', recurring: true, end_date: '2025-12-31', freq: 'month', pct_change: 2, apply_to: 'amount' },
            { name: 'Rent', account: 'Checking', amount: -500, date: '2025-07-01', recurring: true, end_date: '2025-12-31', freq: 'month', pct_change: 0, apply_to: 'amount' }
        ];
    }
}
