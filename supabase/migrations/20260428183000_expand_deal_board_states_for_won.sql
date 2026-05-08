begin;

alter table public.deal_board_states
  drop constraint if exists deal_board_states_pipeline_stage_check,
  add constraint deal_board_states_pipeline_stage_check
    check (pipeline_stage in ('targeting', 'visiting', 'negotiating', 'won', 'lost'));

comment on table public.deal_board_states is '月末時点で固定した商談ボードのスナップショット';

commit;
