begin;

create or replace function public.material_category_department_fiscal_actuals(p_as_of_date date default current_date)
returns table (department_id integer, category_name text, sort_order integer, fiscal_year integer, sales_total numeric, units_total numeric)
language sql security definer set search_path = public as $$
  select daily.department_id, '材料売上'::text, 1000,
    extract(year from (daily.sales_date - interval '3 months'))::integer,
    sum(daily.sales_total)::numeric, sum(daily.units_total)::numeric
  from public.material_category_department_daily_actuals daily
  where daily.sales_date >= make_date(extract(year from (p_as_of_date - interval '3 months'))::integer - 2, 4, 1)
    and daily.sales_date <= p_as_of_date
  group by daily.department_id,
    extract(year from (daily.sales_date - interval '3 months'))::integer;
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
  group by daily.department_id,
    extract(year from (daily.sales_date - interval '3 months'))::integer;
$$;

select pg_notify('pgrst', 'reload schema');
commit;
