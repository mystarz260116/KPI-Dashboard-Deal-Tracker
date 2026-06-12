create table if not exists public.detected_new_orders (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'sales_import',
  data_kind text not null default 'delivery',
  detected_month text not null,
  customer_code text not null,
  customer_name text not null,
  department_id bigint null,
  user_id uuid null references public.profiles(id) on delete set null,
  amount bigint not null default 0,
  ordered_at date null,
  status text not null default 'pending',
  approved_by uuid null references public.profiles(id) on delete set null,
  approved_at timestamptz null,
  rejected_by uuid null references public.profiles(id) on delete set null,
  rejected_at timestamptz null,
  created_deal_id uuid null references public.deals(id) on delete set null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint detected_new_orders_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint detected_new_orders_source_check
    check (source in ('sales_import'))
);

create unique index if not exists idx_detected_new_orders_unique_source
  on public.detected_new_orders (source, data_kind, detected_month, customer_code);

create index if not exists idx_detected_new_orders_status
  on public.detected_new_orders (status);

create index if not exists idx_detected_new_orders_user_month
  on public.detected_new_orders (user_id, detected_month);

alter table public.detected_new_orders enable row level security;

drop policy if exists "detected_new_orders_service_role_all" on public.detected_new_orders;
create policy "detected_new_orders_service_role_all"
  on public.detected_new_orders
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
