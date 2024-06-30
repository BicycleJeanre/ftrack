select * from transactions
where
	account = 'Jeanre Transactional'
and
	budget_month_id = '2024-07-01'
	
	
select * from trn_budget_transaction_combined
where
	account = 'Home Loan'
and
	budget_month_id = '2024-08-01'
	
	
select * from trn_retained_balances
where
	account = 'Home Loan'
and
	budget_month_id = '2024-08-01'
	
	
	
select 
	budget_month_id
,	account
,	account_secondary
--,	coalesce(account_number, account_number_1) as account_number
,	movement
,	amount::decimal
,	budget_amount::decimal
,	branch
,	source_file_name
,	journal_number
,	narrative
,	"sequence"
,	transaction_balance_from_source
,	transaction_date
,	transaction_description
,	transaction_type
,	interest_nacm
from 
	trn_retained_balances
--where
--	budget_amount is not null
--or
--	budget_amount_1 is not null
order by
	1,2,3,4
	
	
	
	
		
	
create user jeanre with password 'Jvw@postgres2024' createdb;





select * from transactions
where 
	budget_month_id = '2024-08-01'
and
	movement = 'Credit'
and
	account = 'Jeanre Transactional'
	
	
	
select * from trn_transactions_double_entry
where
	account_credit = 'Jeanre Transactional'
and
	transaction_date between '2024-02-01' and '2024-02-24'
	
	
	
select * from trn_transactions_account_secondary
where
	account = 'Jeanre Transactional'
and
	transaction_date between '2024-02-01' and '2024-02-24'
and
	credit_amount <> 0.0
