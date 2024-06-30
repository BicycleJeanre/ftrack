
--src_capitec_transactions
CREATE TABLE "public".src_capitec_transactions
(
  account VARCHAR(24)
, account_number TEXT
, transaction_date TIMESTAMP
, journal_number TEXT
, transaction_type TEXT
, branch TEXT
, debit_amount DOUBLE PRECISION
, credit_amount DOUBLE PRECISION
, narrative TEXT
, balance_amount DOUBLE PRECISION
, "sequence" BIGINT
, transaction_description TEXT
, source_file_name VARCHAR(100)
)
;

--src_external_account_balance
CREATE TABLE "public".src_external_account_balance
(
  account TEXT
, account_number DOUBLE PRECISION
, transaction_date TIMESTAMP
, journal_number DOUBLE PRECISION
, transaction_type TEXT
, branch TEXT
, narrative TEXT
, "sequence" DOUBLE PRECISION
, transaction_description TEXT
, balance_amount DOUBLE PRECISION
, credit_amount DOUBLE PRECISION
, debit_amount DOUBLE PRECISION
, "Interest (NACM)" DOUBLE PRECISION
)
;

drop table public.trn_transaction_start_balances
--trn_transaction_start_balances
CREATE TABLE "public".trn_transaction_start_balances
(
  account VARCHAR(24)
, account_number TEXT
, transaction_date TIMESTAMP
, journal_number TEXT
, transaction_type TEXT
, branch TEXT
, narrative TEXT
, "sequence" BIGINT
, transaction_description TEXT
, balance_amount DOUBLE PRECISION
, credit_amount DOUBLE PRECISION
, debit_amount DOUBLE PRECISION
, source_file_name VARCHAR(100)
,	interest_nacm numeric(16,4)
)
;

CREATE TABLE "public".trn_transactions_account_secondary
(
  account VARCHAR(24)
, account_number TEXT
, transaction_date TIMESTAMP
, journal_number TEXT
, transaction_type TEXT
, branch TEXT
, narrative TEXT
, "sequence" BIGINT
, transaction_description TEXT
, balance_amount DOUBLE PRECISION
, credit_amount DOUBLE PRECISION
, debit_amount DOUBLE PRECISION
, account_secondary TEXT
, source_file_name VARCHAR(100)
, interest_nacm NUMERIC(20, 4)
)
;

CREATE TABLE "public".trn_transactions_double_entry
(
  account_debit TEXT
, account_credit TEXT
, account_number TEXT
, amount DOUBLE PRECISION
, transaction_date TIMESTAMP
, journal_number TEXT
, transaction_type TEXT
, branch TEXT
, narrative TEXT
, "sequence" BIGINT
, transaction_description TEXT
, balance_amount DOUBLE PRECISION
, source_file_name VARCHAR(100)
, interest_nacm NUMERIC(24, 4)
)
;

CREATE TABLE "public".trn_transactions_split_debit_credit
(
  account_secondary TEXT
, account TEXT
, account_number TEXT
, amount DOUBLE PRECISION
, balance_amount DOUBLE PRECISION
, branch TEXT
, budget_month_id TIMESTAMP
, journal_number TEXT
, narrative TEXT
, "sequence" BIGINT
, transaction_date TIMESTAMP
, transaction_description TEXT
, transaction_type TEXT
, movement TEXT
, source_file_name VARCHAR(100)
, interest_nacm NUMERIC(28, 4)
)
;

CREATE TABLE "public".src_budgets
(
  Movement TEXT
, "Account Secondary" TEXT
, source_file_name VARCHAR(250)
, Account VARCHAR(250)
, budget_month_id VARCHAR(10)
, amount TEXT
)
;

CREATE TABLE "public".trn_budget_transaction_combined
(
  account TEXT
, account_secondary TEXT
, account_number TEXT
, amount DOUBLE PRECISION
, branch TEXT
, budget_amount DOUBLE PRECISION
, budget_month_id TIMESTAMP
, source_file_name TEXT
, journal_number TEXT
, movement TEXT
, narrative TEXT
, "sequence" BIGINT
, transaction_balance_from_source DOUBLE PRECISION
, transaction_date TIMESTAMP
, transaction_description TEXT
, transaction_type TEXT
, interest_nacm NUMERIC(32, 4)
)
;

CREATE TABLE "public".trn_retained_balances
(
  budget_month_id TIMESTAMP
, account TEXT
, account_secondary TEXT
, movement TEXT
, amount DOUBLE PRECISION
, budget_amount TEXT
, branch TEXT
, source_file_name TEXT
, journal_number TEXT
, narrative TEXT
, "sequence" INTEGER
, transaction_balance_from_source INTEGER
, transaction_date TIMESTAMP
, transaction_description TEXT
, transaction_type TEXT
, budget_month_id_1 TIMESTAMP
, account_1 TEXT
, account_secondary_1 TEXT
, movement_1 TEXT
, budget_amount_1 DOUBLE PRECISION
, amount_1 TEXT
, branch_1 TEXT
, source_file_name_1 TEXT
, journal_number_1 TEXT
, narrative_1 TEXT
, sequence_1 INTEGER
, transaction_balance_from_source_1 INTEGER
, transaction_date_1 TIMESTAMP
, transaction_description_1 TEXT
, transaction_type_1 TEXT
, interest_nacm DOUBLE PRECISION
, interest_nacm_1 DOUBLE PRECISION
)
;

CREATE TABLE "public".transactions
(
  budget_month_id TIMESTAMP
, account TEXT
, account_secondary TEXT
, movement TEXT
, amount DOUBLE PRECISION
, budget_amount DOUBLE PRECISION
, branch TEXT
, source_file_name TEXT
, journal_number TEXT
, narrative TEXT
, "sequence" BIGINT
, transaction_balance_from_source DOUBLE PRECISION
, transaction_date TIMESTAMP
, transaction_description TEXT
, transaction_type TEXT
, account_type TEXT
, entity TEXT
, modelling_type TEXT
, interest_nacm DOUBLE PRECISION
)
;