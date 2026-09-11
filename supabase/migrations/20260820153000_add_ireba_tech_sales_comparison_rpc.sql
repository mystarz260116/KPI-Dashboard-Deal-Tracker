create or replace function public.compare_ireba_tech_sales_with_import_rows(
  p_start_date date default date '2024-03-25',
  p_end_date date default current_date + interval '1 day'
)
returns table (
  data_kind text,
  department_id bigint,
  sales_month text,
  old_rows bigint,
  new_rows bigint,
  row_diff bigint,
  old_amount bigint,
  new_amount bigint,
  amount_diff bigint,
  old_customers bigint,
  new_customers bigint,
  old_staff bigint,
  new_staff bigint
)
language sql
security definer
set search_path = public
as $$
  with old_monthly as (
    select
      sir.data_kind,
      sir.department_id::bigint as department_id,
      to_char(
        date_trunc(
          'month',
          case when sir.data_kind = 'order' then sir.order_date else sir.delivery_date end
        ),
        'YYYY-MM'
      ) as sales_month,
      count(*)::bigint as rows_count,
      coalesce(sum(coalesce(sir.amount, 0)), 0)::bigint as amount_total,
      count(distinct nullif(sir.customer_code, ''))::bigint as customer_count,
      count(distinct nullif(sir.external_staff_code, ''))::bigint as staff_count
    from public.sales_import_rows sir
    where sir.department_id in (1, 2)
      and sir.data_kind in ('delivery', 'order')
      and (
        case when sir.data_kind = 'order' then sir.order_date else sir.delivery_date end
      ) >= p_start_date
      and (
        case when sir.data_kind = 'order' then sir.order_date else sir.delivery_date end
      ) < p_end_date
    group by
      sir.data_kind,
      sir.department_id,
      date_trunc(
        'month',
        case when sir.data_kind = 'order' then sir.order_date else sir.delivery_date end
      )
  ),
  new_monthly as (
    select
      'delivery'::text as data_kind,
      h.department_id::bigint as department_id,
      to_char(date_trunc('month', h."納品日"), 'YYYY-MM') as sales_month,
      count(*)::bigint as rows_count,
      coalesce(sum(coalesce(d."金額", 0)), 0)::bigint as amount_total,
      count(distinct nullif(h."得意先コード", ''))::bigint as customer_count,
      count(distinct nullif(h."担当者コード", ''))::bigint as staff_count
    from public.ireba_delivery_headers h
    join public.ireba_delivery_details d
      on d.department_id = h.department_id
     and d."内部コード" = h."内部コード"
    where h.department_id in (1, 2)
      and h."納品日" >= p_start_date
      and h."納品日" < p_end_date
      and btrim(coalesce(d."明細区分", '')) = '1技工'
    group by
      h.department_id,
      date_trunc('month', h."納品日")

    union all

    select
      'order'::text as data_kind,
      h.department_id::bigint as department_id,
      to_char(date_trunc('month', h."受注日"), 'YYYY-MM') as sales_month,
      count(*)::bigint as rows_count,
      coalesce(sum(coalesce(d."金額", 0)), 0)::bigint as amount_total,
      count(distinct nullif(h."得意先コード", ''))::bigint as customer_count,
      count(distinct nullif(h."担当者コード", ''))::bigint as staff_count
    from public.ireba_order_headers h
    join public.ireba_order_details d
      on d.department_id = h.department_id
     and d."内部コード" = h."内部コード"
    where h.department_id in (1, 2)
      and h."受注日" >= p_start_date
      and h."受注日" < p_end_date
      and btrim(coalesce(d."明細区分", '')) = '1技工'
    group by
      h.department_id,
      date_trunc('month', h."受注日")
  )
  select
    coalesce(o.data_kind, n.data_kind) as data_kind,
    coalesce(o.department_id, n.department_id) as department_id,
    coalesce(o.sales_month, n.sales_month) as sales_month,
    coalesce(o.rows_count, 0) as old_rows,
    coalesce(n.rows_count, 0) as new_rows,
    coalesce(n.rows_count, 0) - coalesce(o.rows_count, 0) as row_diff,
    coalesce(o.amount_total, 0) as old_amount,
    coalesce(n.amount_total, 0) as new_amount,
    coalesce(n.amount_total, 0) - coalesce(o.amount_total, 0) as amount_diff,
    coalesce(o.customer_count, 0) as old_customers,
    coalesce(n.customer_count, 0) as new_customers,
    coalesce(o.staff_count, 0) as old_staff,
    coalesce(n.staff_count, 0) as new_staff
  from old_monthly o
  full outer join new_monthly n
    on n.data_kind = o.data_kind
   and n.department_id = o.department_id
   and n.sales_month = o.sales_month
  order by
    data_kind,
    department_id,
    sales_month;
$$;

grant execute on function public.compare_ireba_tech_sales_with_import_rows(date, date)
  to anon, authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
