# modal-amount-change.md

## Purpose
A specialized modal component for defining how transaction amounts change over time. Supports percentage increases, fixed amount changes, and various frequency intervals.

## Features
- **Change Types**: Percentage increase, fixed amount increase/decrease
- **Frequency Options**: Per period, per year, per transaction
- **Value Input**: Numeric input for the change amount or percentage
- **Preview**: Shows how the change will affect future transaction amounts

## Usage
```javascript
import { AmountChangeModal } from './modal-amount-change.js';

AmountChangeModal.show(existingAmountChange, (updatedAmountChange) => {
    // Handle the updated amount change object
    transaction.amountChange = updatedAmountChange;
});
```

## Data Structure
The modal works with amountChange objects having:
- `type`: 'percentage' or 'fixed'
- `value`: Numeric value (percentage or fixed amount)
- `frequency`: 'period', 'year', 'transaction'

## Use Cases
- Salary increases over time
- Inflation adjustments
- Graduated payment schedules
- Variable expense patterns

## Integration
This modal is triggered from the EditableGrid when users click on amount change cells in the transactions grid.
