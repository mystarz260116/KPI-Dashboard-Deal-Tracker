begin;

create extension if not exists pgcrypto;

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  customer_code text references public.customers(code) on delete set null,
  prospect_customer_id uuid references public.prospect_customers(id) on delete set null,
  deal_date date not null,
  activity_type text not null,
  product_name text,
  unit_count integer,
  amount bigint,
  notes text,
  next_action text,
  created_at timestamptz not null default now()
);

create index if not exists idx_deals_user_id on public.deals(user_id);
create index if not exists idx_deals_deal_date on public.deals(deal_date);
create index if not exists idx_deals_customer_code on public.deals(customer_code);
create index if not exists idx_deals_prospect_customer_id on public.deals(prospect_customer_id);

alter table public.deals enable row level security;

drop policy if exists "deals_select_own" on public.deals;
create policy "deals_select_own"
on public.deals
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "deals_insert_own" on public.deals;
create policy "deals_insert_own"
on public.deals
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "deals_update_own" on public.deals;
create policy "deals_update_own"
on public.deals
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "deals_delete_own" on public.deals;
create policy "deals_delete_own"
on public.deals
for delete
to authenticated
using (user_id = auth.uid());

drop table if exists public.deals_kansai;
drop table if exists public.deals_tokyo;

commit;
