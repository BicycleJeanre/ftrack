# modal-create-account.md

## Purpose
A simplified modal component for creating new accounts directly from the transactions grid. Provides a streamlined interface for quickly adding accounts without leaving the transaction editing workflow.

## Features
- **Account Name Input**: Text field for the new account name
- **Starting Balance**: Numeric input for the initial account balance
- **Default Values**: Automatically sets sensible defaults for new accounts
- **Validation**: Ensures required fields are completed

## Usage
```javascript
import { CreateAccountModal } from './modal-create-account.js';

CreateAccountModal.show((newAccount) => {
    // Handle the newly created account
    accounts.push(newAccount);
    updateUI();
});
```

## Default Account Structure
New accounts are created with:
- `name`: User-provided name
- `balance` and `current_balance`: User-provided starting balance
- `group`: "Expense" (default)
- `tags`: Empty array
- `interest`: 0
- `interest_period`: 'year'
- `compound_period`: 'none'
- `interest_type`: 'simple'

## Integration
This modal is triggered from the EditableGrid when users select "-- Create New Account --" from the account dropdown in the transactions grid.

## Workflow
1. User selects "Create New Account" from dropdown
2. Modal opens with form fields
3. User enters account details
4. Account is created and immediately available in the dropdown
5. The dropdown value is automatically set to the new account
