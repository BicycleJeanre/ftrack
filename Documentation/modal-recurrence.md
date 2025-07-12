# modal-recurrence.md

## Purpose
A specialized modal component for editing transaction recurrence patterns. Allows users to define complex recurring schedules with frequency, day-of-month, and end date specifications.

## Features
- **Frequency Selection**: Monthly, weekly, daily, yearly options
- **Day Specification**: For monthly recurrence, specify which day of the month
- **End Date**: Optional end date for the recurrence pattern
- **Validation**: Ensures valid recurrence configurations
- **Grid Integration**: Now accessible via a modal icon in the transactions grid

## Usage
```javascript
import { RecurrenceModal } from './modal-recurrence.js';

// In EditableGrid column definition:
{
  field: 'recurrence',
  header: 'Recurrence',
  modalIcon: '<svg>...</svg>',
  onModalIconClick: ({ idx }) => RecurrenceModal.show(...)
}
```

## Data Structure
The modal works with recurrence objects having:
- `frequency`: 'monthly', 'weekly', 'daily', 'yearly'
- `dayOfMonth`: Number (1-31) for monthly frequency
- `endDate`: ISO date string or empty for indefinite recurrence

## Integration
This modal is triggered from the EditableGrid when users click the modal icon in the recurrence cell for recurring transactions.

> **Update Note:** Now supports modal icon/callback integration with EditableGrid columns.
