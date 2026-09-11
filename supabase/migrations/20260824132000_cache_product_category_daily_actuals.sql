create materialized view if not exists public.product_category_daily_actuals as
select
  coalesce(nullif(btrim(pd.name), ''), '未分類') as category_name,
  min(coalesce(pd.sort_order, 999999))::integer as sort_order,
  h."納品日"::date as sales_date,
  coalesce(sum(coalesce(d."金額", 0)), 0)::numeric as sales_total,
  coalesce(sum(coalesce(d."数量", 0)), 0)::numeric as units_total
from public.ireba_delivery_headers h
join public.ireba_delivery_details d
  on d.department_id = h.department_id
 and d."内部コード" = h."内部コード"
left join public.product_category_masters pcm
  on pcm.department_id = h.department_id
 and pcm.normalized_product_code = nullif(btrim(d."補綴物コード"::text), '')
left join public.product_departments pd
  on pd.id = pcm.product_department_id
 and pd.department_id = h.department_id
where h.department_id in (1, 2)
  and h."納品日" is not null
  and btrim(coalesce(d."明細区分", '')) = '1技工'
group by
  coalesce(nullif(btrim(pd.name), ''), '未分類'),
  h."納品日"::date;

create unique index if not exists product_category_daily_actuals_category_date_idx
  on public.product_category_daily_actuals (category_name, sales_date);

create index if not exists product_category_daily_actuals_date_idx
  on public.product_category_daily_actuals (sales_date);

revoke all on table public.product_category_daily_actuals from public, anon, authenticated;
grant select on table public.product_category_daily_actuals to service_role;

create or replace function public.product_category_fiscal_actuals(
  p_as_of_date date default current_date
)
returns table (
  category_name text,
  sort_order integer,
  fiscal_year integer,
  sales_total numeric,
  units_total numeric
)
language sql
security definer
set search_path = public
as $$
  select
    daily.category_name,
    min(daily.sort_order)::integer as sort_order,
    extract(year from (daily.sales_date - interval '3 months'))::integer as fiscal_year,
    coalesce(sum(daily.sales_total), 0)::numeric as sales_total,
    coalesce(sum(daily.units_total), 0)::numeric as units_total
  from public.product_category_daily_actuals daily
  where daily.sales_date >= make_date(
      extract(year from (p_as_of_date - interval '3 months'))::integer - 2,
      4,
      1
    )
    and daily.sales_date <= p_as_of_date
  group by
    daily.category_name,
    extract(year from (daily.sales_date - interval '3 months'))::integer
  order by min(daily.sort_order), daily.category_name, fiscal_year;
$$;

create or replace function public.refresh_product_category_daily_actuals()
returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = '0'
as $$
begin
  refresh materialized view public.product_category_daily_actuals;
end;
$$;

revoke all on function public.product_category_fiscal_actuals(date) from public, anon, authenticated;
grant execute on function public.product_category_fiscal_actuals(date) to service_role;
revoke all on function public.refresh_product_category_daily_actuals() from public, anon, authenticated;
grant execute on function public.refresh_product_category_daily_actuals() to service_role;

select pg_notify('pgrst', 'reload schema');
