CREATE DATABASE "JPersonal" WITH TEMPLATE = template0 ENCODING = 'UTF8' --LOCALE = 'C.UTF-8';



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 3 (class 2615 OID 2200)
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- TOC entry 2182 (class 0 OID 0)
-- Dependencies: 3
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


SET default_tablespace = '';

--
-- TOC entry 191 (class 1259 OID 36670)
-- Name: src_budgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.src_budgets (
    movement text,
    "Account Secondary" text,
    source_file_name character varying(250),
    account character varying(250),
    budget_month_id character varying(10),
    amount text
);


--
-- TOC entry 185 (class 1259 OID 36595)
-- Name: src_capitec_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.src_capitec_transactions (
    account character varying(24),
    account_number text,
    transaction_date timestamp without time zone,
    journal_number text,
    transaction_type text,
    branch text,
    debit_amount double precision,
    credit_amount double precision,
    narrative text,
    balance_amount double precision,
    sequence bigint,
    transaction_description text,
    source_file_name character varying(100)
);


--
-- TOC entry 186 (class 1259 OID 36601)
-- Name: src_external_account_balance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.src_external_account_balance (
    account text,
    account_number double precision,
    transaction_date timestamp without time zone,
    journal_number double precision,
    transaction_type text,
    branch text,
    narrative text,
    sequence double precision,
    transaction_description text,
    balance_amount double precision,
    credit_amount double precision,
    debit_amount double precision,
    "Interest (NACM)" double precision
);


--
-- TOC entry 194 (class 1259 OID 36689)
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    budget_month_id timestamp without time zone,
    account text,
    account_secondary text,
    movement text,
    amount double precision,
    budget_amount double precision,
    branch text,
    source_file_name text,
    journal_number text,
    narrative text,
    sequence bigint,
    transaction_balance_from_source double precision,
    transaction_date timestamp without time zone,
    transaction_description text,
    transaction_type text,
    account_type text,
    entity text,
    modelling_type text,
    interest_nacm double precision
);


--
-- TOC entry 192 (class 1259 OID 36676)
-- Name: trn_budget_transaction_combined; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trn_budget_transaction_combined (
    account text,
    account_secondary text,
    account_number text,
    amount double precision,
    branch text,
    budget_amount double precision,
    budget_month_id timestamp without time zone,
    source_file_name text,
    journal_number text,
    movement text,
    narrative text,
    sequence bigint,
    transaction_balance_from_source double precision,
    transaction_date timestamp without time zone,
    transaction_description text,
    transaction_type text,
    interest_nacm numeric(32,4)
);


--
-- TOC entry 193 (class 1259 OID 36682)
-- Name: trn_retained_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trn_retained_balances (
    budget_month_id timestamp without time zone,
    account text,
    account_secondary text,
    movement text,
    amount double precision,
    budget_amount text,
    branch text,
    source_file_name text,
    journal_number text,
    narrative text,
    sequence integer,
    transaction_balance_from_source integer,
    transaction_date timestamp without time zone,
    transaction_description text,
    transaction_type text,
    budget_month_id_1 timestamp without time zone,
    account_1 text,
    account_secondary_1 text,
    movement_1 text,
    budget_amount_1 double precision,
    amount_1 text,
    branch_1 text,
    source_file_name_1 text,
    journal_number_1 text,
    narrative_1 text,
    sequence_1 integer,
    transaction_balance_from_source_1 integer,
    transaction_date_1 timestamp without time zone,
    transaction_description_1 text,
    transaction_type_1 text,
    interest_nacm double precision,
    interest_nacm_1 double precision
);


--
-- TOC entry 187 (class 1259 OID 36626)
-- Name: trn_transaction_start_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trn_transaction_start_balances (
    account character varying(24),
    account_number text,
    transaction_date timestamp without time zone,
    journal_number text,
    transaction_type text,
    branch text,
    narrative text,
    sequence bigint,
    transaction_description text,
    balance_amount double precision,
    credit_amount double precision,
    debit_amount double precision,
    source_file_name character varying(100),
    interest_nacm numeric(16,4)
);


--
-- TOC entry 188 (class 1259 OID 36637)
-- Name: trn_transactions_account_secondary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trn_transactions_account_secondary (
    account character varying(24),
    account_number text,
    transaction_date timestamp without time zone,
    journal_number text,
    transaction_type text,
    branch text,
    narrative text,
    sequence bigint,
    transaction_description text,
    balance_amount double precision,
    credit_amount double precision,
    debit_amount double precision,
    account_secondary text,
    source_file_name character varying(100),
    interest_nacm numeric(20,4)
);


--
-- TOC entry 189 (class 1259 OID 36648)
-- Name: trn_transactions_double_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trn_transactions_double_entry (
    account_debit text,
    account_credit text,
    account_number text,
    amount double precision,
    transaction_date timestamp without time zone,
    journal_number text,
    transaction_type text,
    branch text,
    narrative text,
    sequence bigint,
    transaction_description text,
    balance_amount double precision,
    source_file_name character varying(100),
    interest_nacm numeric(24,4)
);


--
-- TOC entry 190 (class 1259 OID 36659)
-- Name: trn_transactions_split_debit_credit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trn_transactions_split_debit_credit (
    account_secondary text,
    account text,
    account_number text,
    amount double precision,
    balance_amount double precision,
    branch text,
    budget_month_id timestamp without time zone,
    journal_number text,
    narrative text,
    sequence bigint,
    transaction_date timestamp without time zone,
    transaction_description text,
    transaction_type text,
    movement text,
    source_file_name character varying(100),
    interest_nacm numeric(28,4)
);
