begin;

drop function if exists public.material_category_department_fiscal_actuals(date);
drop function if exists public.material_category_department_fiscal_clinic_groups(date);
drop materialized view if exists public.material_category_department_daily_actuals;

create materialized view public.material_category_department_daily_actuals as
select
  h.department_id,
  coalesce(m.material_category, '未分類') as category_name,
  h."納品日"::date as sales_date,
  nullif(btrim(h."得意先コード"::text), '') as clinic_key,
  coalesce(sum(coalesce(d."金額", 0)), 0)::numeric as sales_total,
  coalesce(sum(coalesce(d."数量", 0)), 0)::numeric as units_total
from public.ireba_delivery_headers h
join public.ireba_delivery_details d
  on d.department_id = h.department_id and d."内部コード" = h."内部コード"
left join public.material_category_masters m
  on m.department_id = h.department_id
 and m.normalized_product_code = nullif(btrim(d."補綴物コード"::text), '')
 and m.normalized_product_name = coalesce(nullif(btrim(d."補綴物名"::text), ''), '名称なし')
where h.department_id in (1, 2)
  and h."納品日" is not null
  and btrim(coalesce(d."明細区分", '')) = '5材料'
  and coalesce(m.is_active, true)
group by h.department_id, coalesce(m.material_category, '未分類'), h."納品日"::date,
  nullif(btrim(h."得意先コード"::text), '');

create unique index material_category_department_daily_actuals_idx
  on public.material_category_department_daily_actuals
  (department_id, category_name, sales_date, clinic_key) nulls not distinct;

create or replace function public.material_category_department_fiscal_actuals(p_as_of_date date default current_date)
returns table (department_id integer, category_name text, sort_order integer, fiscal_year integer, sales_total numeric, units_total numeric)
language sql security definer set search_path = public as $$
  select daily.department_id, '材料売上'::text, 1000,
    extract(year from (daily.sales_date - interval '3 months'))::integer,
    sum(daily.sales_total)::numeric, sum(daily.units_total)::numeric
  from public.material_category_department_daily_actuals daily
  where daily.sales_date >= make_date(extract(year from (p_as_of_date - interval '3 months'))::integer - 2, 4, 1)
    and daily.sales_date <= p_as_of_date
  group by daily.department_id, extract(year from (daily.sales_date - interval '3 months'))::integer;
$$;

create or replace function public.material_category_department_fiscal_clinic_groups(p_as_of_date date default current_date)
returns table (department_id integer, category_name text, fiscal_year integer, clinic_keys text[])
language sql security definer set search_path = public as $$
  select daily.department_id, '材料売上'::text,
    extract(year from (daily.sales_date - interval '3 months'))::integer,
    array_agg(distinct daily.clinic_key order by daily.clinic_key)
  from public.material_category_department_daily_actuals daily
  where daily.clinic_key is not null
    and daily.sales_date >= make_date(extract(year from (p_as_of_date - interval '3 months'))::integer - 2, 4, 1)
    and daily.sales_date <= p_as_of_date
  group by daily.department_id, extract(year from (daily.sales_date - interval '3 months'))::integer;
$$;

create or replace function public.refresh_material_category_daily_actuals()
returns void language plpgsql security definer set search_path = public set statement_timeout = '0' as $$
begin refresh materialized view public.material_category_department_daily_actuals; end;
$$;

revoke all on table public.material_category_department_daily_actuals from public, anon, authenticated;
grant select on table public.material_category_department_daily_actuals to service_role;
revoke all on function public.material_category_department_fiscal_actuals(date) from public, anon, authenticated;
revoke all on function public.material_category_department_fiscal_clinic_groups(date) from public, anon, authenticated;
revoke all on function public.refresh_material_category_daily_actuals() from public, anon, authenticated;
grant execute on function public.material_category_department_fiscal_actuals(date) to service_role;
grant execute on function public.material_category_department_fiscal_clinic_groups(date) to service_role;
grant execute on function public.refresh_material_category_daily_actuals() to service_role;
select pg_notify('pgrst', 'reload schema');
commit;
