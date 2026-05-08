begin;

create table if not exists public.deal_board_month_closures (
  month_start date primary key,
  closed_at timestamptz not null default timezone('utc'::text, now()),
  closed_by uuid references public.profiles(id) on delete set null
);

alter table public.deal_board_month_closures enable row level security;

comment on table public.deal_board_month_closures is '商談ボードの月締め管理';
comment on column public.deal_board_month_closures.month_start is '締め対象月の月初日';
comment on column public.deal_board_month_closures.closed_at is '締め実行日時';
comment on column public.deal_board_month_closures.closed_by is '締め実行者';

commit;
