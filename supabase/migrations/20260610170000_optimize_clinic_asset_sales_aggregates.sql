create or replace function public.clinic_asset_sales_aggregates(
  p_start_date date,
  p_end_date date,
  p_department_ids bigint[],
  p_external_staff_codes text[],
  p_data_kind text
)
returns table (
  department_id bigint,
  customer_code text,
  customer_name text,
  external_staff_code text,
  sales_month text,
  sales_total bigint
)
language sql
security definer
set search_path = public
as $$
  select
    sir.department_id::bigint as department_id,
    sir.customer_code,
    max(sir.customer_name) as customer_name,
    sir.external_staff_code,
    to_char(
      date_trunc(
        'month',
        case
          when coalesce(nullif(p_data_kind, ''), 'delivery') = 'order'
            then sir.order_date
          else sir.delivery_date
        end
      ),
      'YYYY-MM'
    ) as sales_month,
    coalesce(sum(coalesce(sir.amount, 0)), 0)::bigint as sales_total
  from public.sales_import_rows sir
  where sir.data_kind = coalesce(nullif(p_data_kind, ''), 'delivery')
    and (
      (
        coalesce(nullif(p_data_kind, ''), 'delivery') = 'order'
        and sir.order_date >= p_start_date
        and sir.order_date < p_end_date
      )
      or (
        coalesce(nullif(p_data_kind, ''), 'delivery') <> 'order'
        and sir.delivery_date >= p_start_date
        and sir.delivery_date < p_end_date
      )
    )
    and (
      p_department_ids is null
      or sir.department_id = any(p_department_ids)
    )
    and (
      p_external_staff_codes is null
      or sir.external_staff_code = any(p_external_staff_codes)
    )
    and sir.customer_code is not null
  group by
    sir.department_id,
    sir.customer_code,
    sir.external_staff_code,
    date_trunc(
      'month',
      case
        when coalesce(nullif(p_data_kind, ''), 'delivery') = 'order'
          then sir.order_date
        else sir.delivery_date
      end
    );
$$;

grant execute on function public.clinic_asset_sales_aggregates(date, date, bigint[], text[], text)
  to anon, authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
