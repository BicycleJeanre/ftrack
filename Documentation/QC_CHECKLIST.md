# Quality Control Checklist

**Version**: 1.0.0  
**Last Updated**: February 1, 2026  

---

## 1.0 Scenarios

### 1.1 Create/Add/New
- [ ] Create new scenario
- [ ] Verify scenario name is saved correctly
- [ ] Verify scenario appears in scenario list

### 1.2 Edit
- [ ] Edit scenario name
- [ ] Edit scenario settings
- [ ] Verify changes are saved

### 1.3 Delete
- [ ] Delete scenario
- [ ] Verify scenario is removed from list
- [ ] Verify data integrity after deletion

---

## 2.0 Accounts

### 2.1 Create/Add/New
- [ ] Create new account
- [ ] Verify account name is saved correctly
- [ ] Verify account appears in account list
- [ ] Verify account type is set correctly

### 2.2 Edit
- [ ] Edit account name
- [ ] Edit account type
- [ ] Edit account settings
- [ ] Verify changes are saved

### 2.3 Delete
- [ ] Delete account
- [ ] Verify account is removed from list
- [ ] Verify associated transactions are handled correctly
- [ ] Verify data integrity after deletion

---

## 3.0 Transactions

### 3.1 Create/Add/New
- [ ] Create new transaction
- [ ] Verify transaction data is saved correctly
- [ ] Verify transaction appears in transaction list
- [ ] Verify transaction affects account balances correctly

### 3.2 Edit
- [ ] Edit transaction amount
- [ ] Edit transaction date
- [ ] Edit transaction account
- [ ] Edit transaction description
- [ ] Verify changes update calculations correctly

### 3.3 Delete
- [ ] Delete transaction
- [ ] Verify transaction is removed from list
- [ ] Verify account balances update correctly
- [ ] Verify data integrity after deletion

---

## 4.0 Budgets

### 4.1 Create/Add/New
- [ ] Create new budget
- [ ] Verify budget data is saved correctly
- [ ] Verify budget appears in budget list
- [ ] Verify budget affects calculations correctly

### 4.2 Edit
- [ ] Edit budget amount
- [ ] Edit budget period
- [ ] Edit budget category
- [ ] Verify changes update forecasts correctly

### 4.3 Delete
- [ ] Delete budget
- [ ] Verify budget is removed from list
- [ ] Verify forecasts update correctly
- [ ] Verify data integrity after deletion

---

## 5.0 Projection

### 5.1 Generate
- [ ] Generate projection
- [ ] Verify projection calculations are accurate
- [ ] Verify projection appears in projection view
- [ ] Verify projection date range is correct

### 5.2 Remove
- [ ] Remove projection
- [ ] Verify projection is cleared from view
- [ ] Verify data integrity after removal

### 5.3 Save as Budget
- [ ] Save projection as budget
- [ ] Verify budget is created correctly
- [ ] Verify budget data matches projection
- [ ] Verify budget appears in budget list

---

## Notes

- Check all operations across different scenarios
- Verify data persistence after application restart
- Test edge cases (empty values, special characters, etc.)
- Verify UI updates reflect data changes
- Check console for errors during all operations
