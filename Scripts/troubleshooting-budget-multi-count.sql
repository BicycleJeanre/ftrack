select * from trn_budget_transaction_combined
where
	budget_month_id = '2024-05-01'
and
	account = 'Jeanre Transactional'
	
	
	
	
select 
	coalesce(sct.account, seab.account) as account
,	coalesce(sct.account_number, seab.account_number::varchar(333)) as account_number
,	coalesce(sct.transaction_date, seab.transaction_date) as transaction_date
,	null as journal_number
,	'FINANCIAL' as transaction_type
,	null as branch
,	null as narrative
,	coalesce(sct.sequence, seab.sequence) as sequence
,	'Start Balance' as transaction_description
,	0.0 as balance_amount
,	coalesce((case when sct.balance_amount > 0 then sct.balance_amount + sct.debit_amount - sct.credit_amount else null end), seab.credit_amount) as credit_amount
,	coalesce((case when sct.balance_amount < 0 then (sct.balance_amount - sct.credit_amount + sct.debit_amount) * -1 else null end), seab.debit_amount) as debit_amount
,	'Start Balance Calculation' as source_file_name
,	seab."Interest (NACM)" as interest_nacm
--,	seab.account
from
	(
	select 
		*
	from	
		public.src_capitec_transactions
	where
		sequence = 2
	) sct
full outer join
	public.src_external_account_balance seab on sct.account = seab.account and sct.transaction_date = seab.transaction_date
	
	
	
	
select * from src_budgets where account = 'Home Loan'
	
	
	
	
select 
	account
,	account_number
,	transaction_date
,	null as journal_number
,	'FINANCIAL' as transaction_type
,	null as branch
,	null as narrative
,	sequence
,	'Start Balance' as transaction_description
,	0.0 as balance_amount
,	case when balance_amount > 0 then balance_amount + debit_amount - credit_amount else null end as credit_amount
,	case when balance_amount < 0 then (balance_amount - credit_amount + debit_amount) * -1 else null end as debit_amount
--,	balance_amount as balance_amount_source
--,	debit_amount as debit_amount_source
--,	credit_amount as credit_amount_source
,	'Start Balance Calculation' as source_file_name
from
	public.src_capitec_transactions
where
	sequence = 2


	
	
	
select * from src_external_account_balance