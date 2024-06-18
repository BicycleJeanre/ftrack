select
	pg_terminate_backend(pg_stat_activity.pid)
--	*
from 
	pg_stat_activity
where 
	pg_stat_activity.datname = 'JPersonal'	
and
	pg_stat_activity.application_name not like 'DBeaver%'



  and 
 	pg_stat_activity.state = 'active';
 	
 
 
select
--	pg_terminate_backend(pg_stat_activity.pid)
	*
from 
	pg_stat_activity
where 
	pg_stat_activity.datname = 'JPersonal'
	
	
drop table public.transactions