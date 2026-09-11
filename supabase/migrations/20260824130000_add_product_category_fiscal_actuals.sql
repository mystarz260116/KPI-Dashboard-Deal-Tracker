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
  with scoped_rows as (
    select
      coalesce(nullif(btrim(pd.name), ''), '未分類') as category_name,
      coalesce(pd.sort_order, 999999) as sort_order,
      extract(year from (h."納品日" - interval '3 months'))::integer as fiscal_year,
      coalesce(d."金額", 0)::numeric as sales_amount,
      coalesce(d."数量", 0)::numeric as units
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
      and h."納品日" >= make_date(
        extract(year from (p_as_of_date - interval '3 months'))::integer - 2,
        4,
        1
      )
      and h."納品日" <= p_as_of_date
      and btrim(coalesce(d."明細区分", '')) = '1技工'
  )
  select
    scoped_rows.category_name,
    min(scoped_rows.sort_order)::integer as sort_order,
    scoped_rows.fiscal_year,
    coalesce(sum(scoped_rows.sales_amount), 0)::numeric as sales_total,
    coalesce(sum(scoped_rows.units), 0)::numeric as units_total
  from scoped_rows
  group by scoped_rows.category_name, scoped_rows.fiscal_year
  order by min(scoped_rows.sort_order), scoped_rows.category_name, scoped_rows.fiscal_year;
$$;

comment on function public.product_category_fiscal_actuals(date) is
  'Aggregates iReba technical delivery sales and quantities by product category and Japanese fiscal year.';

revoke all on function public.product_category_fiscal_actuals(date) from public, anon, authenticated;
grant execute on function public.product_category_fiscal_actuals(date) to service_role;

select pg_notify('pgrst', 'reload schema');
