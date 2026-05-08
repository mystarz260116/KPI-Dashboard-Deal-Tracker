begin;

alter table public.deals
  add column if not exists executed_action_type text;

comment on column public.deals.executed_action_type is '今回実行したアクション種別';

commit;
