alter table public.deals
  drop constraint if exists deals_pipeline_stage_check,
  add constraint deals_pipeline_stage_check
    check (pipeline_stage in ('targeting', 'visiting', 'negotiating', 'accepted', 'won', 'lost'));

alter table public.deal_board_states
  drop constraint if exists deal_board_states_pipeline_stage_check,
  add constraint deal_board_states_pipeline_stage_check
    check (pipeline_stage in ('targeting', 'visiting', 'negotiating', 'accepted', 'won', 'lost'));

comment on column public.deals.pipeline_stage is '商談ボード用の進行段階: targeting / visiting / negotiating / accepted / won / lost';
