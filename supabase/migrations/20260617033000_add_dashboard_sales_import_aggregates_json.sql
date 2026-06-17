create or replace function public.dashboard_sales_import_aggregates_json(
  p_start_date date,
  p_end_date date,
  p_department_ids bigint[],
  p_external_staff_codes text[],
  p_data_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if coalesce(nullif(p_data_kind, ''), 'delivery') = 'order' then
    select coalesce(jsonb_agg(row_to_json(rows)), '[]'::jsonb)
    into result
    from (
      select
        sir.department_id::bigint as department_id,
        sir.external_staff_code,
        coalesce(nullif(sir.normalized_product_code, ''), '') as normalized_product_code,
        coalesce(sum(coalesce(sir.amount, 0)), 0)::bigint as sales_total
      from public.sales_import_rows sir
      where sir.data_kind = 'order'
        and sir.order_date >= p_start_date
        and sir.order_date < p_end_date
        and (p_department_ids is null or sir.department_id = any(p_department_ids))
        and (p_external_staff_codes is null or sir.external_staff_code = any(p_external_staff_codes))
      group by
        sir.department_id,
        sir.external_staff_code,
        coalesce(nullif(sir.normalized_product_code, ''), '')
    ) rows;
  else
    select coalesce(jsonb_agg(row_to_json(rows)), '[]'::jsonb)
    into result
    from (
      select
        sir.department_id::bigint as department_id,
        sir.external_staff_code,
        coalesce(nullif(sir.normalized_product_code, ''), '') as normalized_product_code,
        coalesce(sum(coalesce(sir.amount, 0)), 0)::bigint as sales_total
      from public.sales_import_rows sir
      where sir.data_kind = 'delivery'
        and sir.delivery_date >= p_start_date
        and sir.delivery_date < p_end_date
        and (p_department_ids is null or sir.department_id = any(p_department_ids))
        and (p_external_staff_codes is null or sir.external_staff_code = any(p_external_staff_codes))
      group by
        sir.department_id,
        sir.external_staff_code,
        coalesce(nullif(sir.normalized_product_code, ''), '')
    ) rows;
  end if;

  return result;
end;
$$;

grant execute on function public.dashboard_sales_import_aggregates_json(date, date, bigint[], text[], text)
  to anon, authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
