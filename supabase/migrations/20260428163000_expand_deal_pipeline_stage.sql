begin;

update public.deals
set pipeline_stage = case
  when activity_type = 'won' then 'won'
  when activity_type = 'lost' then 'lost'
  else pipeline_stage
end
where activity_type in ('won', 'lost');

update public.deals d
set pipeline_stage = 'won'
from public.prospect_customers p
where d.prospect_customer_id = p.id
  and p.status = 'merged'
  and p.merged_customer_code is not null
  and d.pipeline_stage <> 'won';

alter table public.deals
  drop constraint if exists deals_pipeline_stage_check,
  add constraint deals_pipeline_stage_check
    check (pipeline_stage in ('targeting', 'visiting', 'negotiating', 'won', 'lost')) not valid;

comment on column public.deals.pipeline_stage is '商談ボード用の進行段階: targeting / visiting / negotiating / won / lost';

commit;
