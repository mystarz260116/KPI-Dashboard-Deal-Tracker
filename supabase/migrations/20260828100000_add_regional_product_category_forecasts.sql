create materialized view if not exists public.product_category_department_daily_actuals as
select
  h.department_id,
  coalesce(nullif(btrim(pd.name), ''), '未分類') as category_name,
  min(coalesce(pd.sort_order, 999999))::integer as sort_order,
  h."納品日"::date as sales_date,
  nullif(btrim(h."得意先コード"::text), '') as clinic_key,
  coalesce(sum(coalesce(d."金額", 0)), 0)::numeric as sales_total,
  coalesce(sum(coalesce(d."数量", 0)), 0)::numeric as units_total
from public.ireba_delivery_headers h
join public.ireba_delivery_details d
  on d.department_id = h.department_id and d."内部コード" = h."内部コード"
left join public.product_category_masters pcm
  on pcm.department_id = h.department_id
 and pcm.normalized_product_code = nullif(btrim(d."補綴物コード"::text), '')
left join public.product_departments pd
  on pd.id = pcm.product_department_id and pd.department_id = h.department_id
where h.department_id in (1, 2)
  and h."納品日" is not null
  and btrim(coalesce(d."明細区分", '')) = '1技工'
group by h.department_id, coalesce(nullif(btrim(pd.name), ''), '未分類'), h."納品日"::date,
  nullif(btrim(h."得意先コード"::text), '');

create unique index if not exists product_category_department_daily_actuals_idx
  on public.product_category_department_daily_actuals
  (department_id, category_name, sales_date, clinic_key) nulls not distinct;
revoke all on table public.product_category_department_daily_actuals from public, anon, authenticated;
grant select on table public.product_category_department_daily_actuals to service_role;

create or replace function public.product_category_department_fiscal_actuals(p_as_of_date date default current_date)
returns table (department_id integer, category_name text, sort_order integer, fiscal_year integer,
  sales_total numeric, units_total numeric)
language sql security definer set search_path = public as $$
  select daily.department_id, daily.category_name, min(daily.sort_order)::integer,
    extract(year from (daily.sales_date - interval '3 months'))::integer,
    sum(daily.sales_total)::numeric, sum(daily.units_total)::numeric
  from public.product_category_department_daily_actuals daily
  where daily.sales_date >= make_date(extract(year from (p_as_of_date - interval '3 months'))::integer - 2, 4, 1)
    and daily.sales_date <= p_as_of_date
  group by daily.department_id, daily.category_name,
    extract(year from (daily.sales_date - interval '3 months'))::integer;
$$;

create or replace function public.product_category_department_fiscal_clinics(p_as_of_date date default current_date)
returns table (department_id integer, category_name text, fiscal_year integer, clinic_key text)
language sql security definer set search_path = public as $$
  select distinct daily.department_id, daily.category_name,
    extract(year from (daily.sales_date - interval '3 months'))::integer, daily.clinic_key
  from public.product_category_department_daily_actuals daily
  where daily.clinic_key is not null
    and daily.sales_date >= make_date(extract(year from (p_as_of_date - interval '3 months'))::integer - 2, 4, 1)
    and daily.sales_date <= p_as_of_date;
$$;

revoke all on function public.product_category_department_fiscal_actuals(date) from public, anon, authenticated;
revoke all on function public.product_category_department_fiscal_clinics(date) from public, anon, authenticated;
grant execute on function public.product_category_department_fiscal_actuals(date) to service_role;
grant execute on function public.product_category_department_fiscal_clinics(date) to service_role;

create table if not exists public.product_category_forecast_scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null default '商品カテゴリ予測',
  as_of_date date not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.product_category_forecast_inputs (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.product_category_forecast_scenarios(id) on delete cascade,
  department_id integer not null check (department_id in (1, 2)),
  category_name text not null,
  fiscal_year integer not null,
  units_growth_percent numeric,
  unit_price_growth_percent numeric,
  note text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (scenario_id, department_id, category_name, fiscal_year)
);

create table if not exists public.product_category_forecast_input_history (
  id bigint generated always as identity primary key,
  input_id uuid,
  scenario_id uuid,
  changed_by uuid references public.profiles(id) on delete set null,
  old_value jsonb,
  new_value jsonb,
  changed_at timestamptz not null default now()
);

create or replace function public.audit_product_category_forecast_input()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.product_category_forecast_input_history
    (input_id, scenario_id, changed_by, old_value, new_value)
  values (coalesce(new.id, old.id), coalesce(new.scenario_id, old.scenario_id),
    coalesce(new.updated_by, old.updated_by), to_jsonb(old), to_jsonb(new));
  return coalesce(new, old);
end;
$$;

drop trigger if exists product_category_forecast_input_audit on public.product_category_forecast_inputs;
create trigger product_category_forecast_input_audit
after insert or update or delete on public.product_category_forecast_inputs
for each row execute function public.audit_product_category_forecast_input();

alter table public.product_category_forecast_scenarios enable row level security;
alter table public.product_category_forecast_inputs enable row level security;
alter table public.product_category_forecast_input_history enable row level security;
revoke all on public.product_category_forecast_scenarios from public, anon, authenticated;
revoke all on public.product_category_forecast_inputs from public, anon, authenticated;
revoke all on public.product_category_forecast_input_history from public, anon, authenticated;
grant all on public.product_category_forecast_scenarios to service_role;
grant all on public.product_category_forecast_inputs to service_role;
grant all on public.product_category_forecast_input_history to service_role;

create or replace function public.refresh_product_category_daily_actuals()
returns void language plpgsql security definer set search_path = public set statement_timeout = '0' as $$
begin
  refresh materialized view public.product_category_daily_actuals;
  refresh materialized view public.product_category_department_daily_actuals;
end;
$$;

select pg_notify('pgrst', 'reload schema');
