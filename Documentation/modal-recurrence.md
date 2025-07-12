# modal-recurrence.md

## Purpose
A specialized modal component for editing transaction recurrence patterns. Allows users to define complex recurring schedules with frequency, day-of-month, and end date specifications.

## Features
- **Frequency Selection**: Monthly, weekly, daily, yearly options
- **Day Specification**: For monthly recurrence, specify which day of the month
- **End Date**: Optional end date for the recurrence pattern
- **Validation**: Ensures valid recurrence configurations

## Usage
```javascript
import { RecurrenceModal } from './modal-recurrence.js';

RecurrenceModal.show(existingRecurrence, (updatedRecurrence) => {
    // Handle the updated recurrence object
    transaction.recurrence = updatedRecurrence;
});
```

## Data Structure
The modal works with recurrence objects having:
- `frequency`: 'monthly', 'weekly', 'daily', 'yearly'
- `dayOfMonth`: Number (1-31) for monthly frequency
- `endDate`: ISO date string or empty for indefinite recurrence

## Integration
This modal is typically triggered from the EditableGrid when users click on recurrence cells for recurring transactions.
