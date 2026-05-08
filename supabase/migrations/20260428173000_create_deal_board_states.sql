begin;

create table if not exists public.deal_board_states (
  clinic_key text not null,
  month_start date not null,
  base_deal_id uuid not null references public.deals(id) on delete cascade,
  pipeline_stage text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (clinic_key, month_start),
  constraint deal_board_states_pipeline_stage_check
    check (pipeline_stage in ('targeting', 'visiting', 'negotiating', 'lost'))
);

create index if not exists idx_deal_board_states_month_start
  on public.deal_board_states(month_start);

alter table public.deal_board_states enable row level security;

comment on table public.deal_board_states is '月別の商談ボード進捗状態。繰越カードの状態のみを保持する';
comment on column public.deal_board_states.clinic_key is 'customer:CODE または prospect:UUID';
comment on column public.deal_board_states.base_deal_id is '元になる商談レコード';

commit;
