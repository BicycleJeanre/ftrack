with account_totals as(
	select 
		budget_month_id
	,	account
	--,	account_number
	,	movement
	,	coalesce(sum(budget_amount), 0.0) as budget_amount
	,	dense_rank() over (order by budget_month_id) as month_rank
	from
		trn_budget_transaction_combined
	where
		movement not like 'Subtotal'
	and
		account = 'Home Loan'
	group by
		budget_month_id
	,	account
	--,	account_number
	,	movement	
)
, ret_balance as 
(
select	
		budget_month_id
	,	account
	--,	account_number
	,	coalesce((credit_amount - debit_amount), 0.0) as budget_amount
	,	coalesce(sum(credit_amount_previous_month - debit_amount_previous_month) over (partition by account order by budget_month_id rows between unbounded PRECEDING and current row), 0.0) as prev_month_budget_amount
	,	month_rank
	from
	(
		select distinct
			budget_month_id
		,	account
		,	month_rank
		,	sum(credit_amount_previous_month) as credit_amount_previous_month
		,	sum(debit_amount_previous_month) as debit_amount_previous_month
		,	sum(credit_amount) as credit_amount
		,	sum(debit_amount) as debit_amount
		from(
			select distinct
						coalesce(a.budget_month_id, b.budget_month_id) as budget_month_id
					,	coalesce(a.account, b.account) as account
					--,	a.account_number
					,	coalesce(a.month_rank, b.month_rank) as month_rank
					,	coalesce(sum(case b.movement when 'Credit' then b.budget_amount end), 0.0) as credit_amount_previous_month
					,	coalesce(sum(case b.movement when 'Debit' then b.budget_amount end),0.0) as debit_amount_previous_month
					,	coalesce(sum(case a.movement when 'Credit' then a.budget_amount end),0.0) as credit_amount
					,	coalesce(sum(case a.movement when 'Debit' then a.budget_amount end),0.0) as debit_amount
					from
						account_totals a
					full outer join
						account_totals b on a.month_rank = b.month_rank+1 and a.account = b.account and a.movement = b.movement
					group by
						a.budget_month_id 
					,	b.budget_month_id
					,	a.account
					,	b.account
					--,	a.account_number
					,	a.month_rank
					,	b.month_rank
			) a
		group by
			budget_month_id
		,	account
		,	month_rank	
	) b
	order by
		1,2
)
select
	b.budget_month_id
,	a.account
--,	a.account_number
,	'Budget Retained Balance' as account_secondary
,	case when a.budget_amount + a.prev_month_budget_amount < 0 then 'Debit' else 'Credit' end as movement
, 	case when (a.budget_amount + a.prev_month_budget_amount) < 0 then ((a.budget_amount + a.prev_month_budget_amount) * -1) else (a.budget_amount + a.prev_month_budget_amount) end as budget_amount
,	null as amount
,	null as branch
,	'Retained Balance Calculations for Budget' as source_file_name
,	null as journal_number
,	null as narrative
,	0 as sequence
,	0 as transaction_balance_from_source
,	b.budget_month_id as transaction_date
,	'Retained Balance Calculations for Budget' as transaction_description
,	'CALCULATED' as transaction_type
,	0.0 as interest_nacm
from
	ret_balance a
join
	(select distinct budget_month_id, month_rank, budget_amount, account from ret_balance) b on a.month_rank = b.month_rank - 1 and a.account = b.account
--where
--	a.account = 'Jeanre Transactional'
order by
	1,2,3,4
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
with account_totals as(
	select 
		budget_month_id
	,	account
	--,	account_number
	,	movement
	,	sum(budget_amount) as budget_amount
	,	dense_rank() over (order by budget_month_id) as month_rank
	from
		trn_budget_transaction_combined
	where
		movement not like 'Subtotal'
	and
		account = 'Home Loan'
	group by
		budget_month_id
	,	account
	--,	account_number
	,	movement	
)
		select	distinct
			a.budget_month_id
		,	a.account
		--,	a.account_number
		,	a.month_rank
		,	sum(case b.movement when 'Credit' then b.budget_amount end) as credit_budget_amount_previous_month
		,	sum(case b.movement when 'Debit' then b.budget_amount end) as debit_budget_amount_previous_month
		,	sum(case a.movement when 'Credit' then a.budget_amount end) as credit_budget_amount
		,	sum(case a.movement when 'Debit' then a.budget_amount end) as debit_budget_amount
		,	sum(case when a.movement = 'Credit' and b.movement = 'Credit' then a.budget_amount + b.budget_amount end) as credit_budget_amount_1
		,	sum(case when a.movement = 'Debit' and b.movement = 'Credit' then a.budget_amount + b.budget_amount end) as debit_budget_amount_1
		from
			account_totals a
		left join
			account_totals b on a.month_rank = b.month_rank+1 and a.account = b.account and a.movement = b.movement
		group by
			a.budget_month_id 
		,	a.account
		--,	a.account_number
		,	a.month_rank




select	
		budget_month_id
	,	account
	--,	account_number
	,	coalesce((credit_budget_amount - debit_budget_amount), 0.0) as budget_amount
	,	coalesce(sum(credit_budget_amount_previous_month - debit_budget_amount_previous_month) over (partition by account order by budget_month_id rows between unbounded PRECEDING and current row), 0.0) as prev_month_budget_amount
	,	month_rank
	from
	(
		select	distinct
			a.budget_month_id
		,	a.account
		--,	a.account_number
		,	a.month_rank
		,	sum(case b.movement when 'Credit' then b.budget_amount end) as credit_budget_amount_previous_month
		,	sum(case b.movement when 'Debit' then b.budget_amount end) as debit_budget_amount_previous_month
		,	sum(case a.movement when 'Credit' then a.budget_amount end) as credit_budget_amount
		,	sum(case a.movement when 'Debit' then a.budget_amount end) as debit_budget_amount
		,	sum(case when a.movement = 'Credit' and b.movement = 'Credit' then a.budget_amount + b.budget_amount end) as credit_budget_amount_1
		,	sum(case when a.movement = 'Debit' and b.movement = 'Credit' then a.budget_amount + b.budget_amount end) as debit_budget_amount_1
		from
			account_totals a
		left join
			account_totals b on a.month_rank = b.month_rank+1 and a.account = b.account and a.movement = b.movement
		group by
			a.budget_month_id 
		,	a.account
		--,	a.account_number
		,	a.month_rank
	) b
	order by
		1,2