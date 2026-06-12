create table if not exists public.clinic_asset_actions (
  customer_code text primary key,
  status text not null default '未対応',
  next_action_date date,
  memo text not null default '',
  department_id bigint,
  user_id uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clinic_asset_actions_status
  on public.clinic_asset_actions (status);

create index if not exists idx_clinic_asset_actions_next_action_date
  on public.clinic_asset_actions (next_action_date);

alter table public.clinic_asset_actions enable row level security;

drop policy if exists "clinic_asset_actions_service_role_all" on public.clinic_asset_actions;
create policy "clinic_asset_actions_service_role_all"
  on public.clinic_asset_actions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
