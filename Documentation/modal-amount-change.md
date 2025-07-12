# modal-amount-change.md

## Purpose
A specialized modal component for defining how transaction amounts change over time. Supports percentage increases, fixed amount changes, and various frequency intervals.

## Features
- **Change Types**: Percentage increase, fixed amount increase/decrease
- **Frequency Options**: Per period, per year, per transaction
- **Value Input**: Numeric input for the change amount or percentage
- **Preview**: Shows how the change will affect future transaction amounts
- **Grid Integration**: Now accessible via a modal icon in the transactions grid

## Usage
```javascript
import { AmountChangeModal } from './modal-amount-change.js';

// In EditableGrid column definition:
{
  field: 'amountChange',
  header: 'Amount Change',
  modalIcon: '<svg>...</svg>',
  onModalIconClick: ({ idx }) => AmountChangeModal.show(...)
}
```

## Data Structure
The modal works with amountChange objects having:
- `type`: 'percentage' or 'fixed'
- `value`: Numeric value (percentage or fixed amount)
- `frequency`: 'period', 'year', 'transaction'

## Integration
This modal is triggered from the EditableGrid when users click the modal icon in the amount change cell in the transactions grid.

> **Update Note:** Now supports modal icon/callback integration with EditableGrid columns.
