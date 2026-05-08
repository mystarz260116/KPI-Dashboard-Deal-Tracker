begin;

alter table public.deals
  add column if not exists pipeline_stage text;

update public.deals
set pipeline_stage = case
  when activity_type = 'visit' then 'visiting'
  when activity_type in ('proposal', 'negotiating', 'won') then 'negotiating'
  when activity_type = 'lost' then 'targeting'
  else 'visiting'
end
where pipeline_stage is null;

alter table public.deals
  alter column pipeline_stage set default 'visiting';

alter table public.deals
  drop constraint if exists deals_pipeline_stage_check,
  add constraint deals_pipeline_stage_check
    check (pipeline_stage in ('targeting', 'visiting', 'negotiating')) not valid;

create index if not exists idx_deals_pipeline_stage on public.deals(pipeline_stage);

comment on column public.deals.pipeline_stage is '商談ボード用の進行段階: targeting / visiting / negotiating';

commit;
