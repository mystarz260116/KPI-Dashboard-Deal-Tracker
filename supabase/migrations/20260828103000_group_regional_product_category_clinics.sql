create or replace function public.product_category_department_fiscal_clinic_groups(p_as_of_date date default current_date)
returns table (department_id integer, category_name text, fiscal_year integer, clinic_keys text[])
language sql security definer set search_path = public as $$
  select daily.department_id, daily.category_name,
    extract(year from (daily.sales_date - interval '3 months'))::integer as fiscal_year,
    array_agg(distinct daily.clinic_key order by daily.clinic_key) as clinic_keys
  from public.product_category_department_daily_actuals daily
  where daily.clinic_key is not null
    and daily.sales_date >= make_date(extract(year from (p_as_of_date - interval '3 months'))::integer - 2, 4, 1)
    and daily.sales_date <= p_as_of_date
  group by daily.department_id, daily.category_name,
    extract(year from (daily.sales_date - interval '3 months'))::integer;
$$;

revoke all on function public.product_category_department_fiscal_clinic_groups(date) from public, anon, authenticated;
grant execute on function public.product_category_department_fiscal_clinic_groups(date) to service_role;
select pg_notify('pgrst', 'reload schema');
