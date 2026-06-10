create or replace function public.dashboard_sales_import_aggregates(
  p_start_date date,
  p_end_date date,
  p_department_ids bigint[],
  p_external_staff_codes text[],
  p_data_kind text
)
returns table (
  department_id bigint,
  external_staff_code text,
  normalized_product_code text,
  sales_total bigint
)
language sql
security definer
set search_path = public
as $$
  select
    sir.department_id::bigint as department_id,
    sir.external_staff_code,
    coalesce(nullif(sir.normalized_product_code, ''), '') as normalized_product_code,
    coalesce(sum(coalesce(sir.amount, 0)), 0)::bigint as sales_total
  from public.sales_import_rows sir
  where sir.data_kind = coalesce(nullif(p_data_kind, ''), 'delivery')
    and (
      case
        when coalesce(nullif(p_data_kind, ''), 'delivery') = 'order'
          then sir.order_date
        else sir.delivery_date
      end
    ) >= p_start_date
    and (
      case
        when coalesce(nullif(p_data_kind, ''), 'delivery') = 'order'
          then sir.order_date
        else sir.delivery_date
      end
    ) < p_end_date
    and (
      p_department_ids is null
      or sir.department_id = any(p_department_ids)
    )
    and (
      p_external_staff_codes is null
      or sir.external_staff_code = any(p_external_staff_codes)
    )
  group by
    sir.department_id,
    sir.external_staff_code,
    coalesce(nullif(sir.normalized_product_code, ''), '');
$$;

grant execute on function public.dashboard_sales_import_aggregates(date, date, bigint[], text[], text)
  to anon, authenticated, service_role;
