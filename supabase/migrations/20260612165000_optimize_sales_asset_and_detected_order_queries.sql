create index if not exists idx_sales_import_rows_delivery_scope_customer
  on public.sales_import_rows (
    data_kind,
    department_id,
    external_staff_code,
    delivery_date,
    customer_code
  )
  include (amount, customer_name);

create index if not exists idx_sales_import_rows_order_scope_customer
  on public.sales_import_rows (
    data_kind,
    department_id,
    external_staff_code,
    order_date,
    customer_code
  )
  include (amount, customer_name);

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
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(nullif(p_data_kind, ''), 'delivery') = 'order' then
    return query
      select
        sir.department_id::bigint,
        sir.customer_code,
        max(sir.customer_name),
        sir.external_staff_code,
        to_char(date_trunc('month', sir.order_date), 'YYYY-MM'),
        coalesce(sum(coalesce(sir.amount, 0)), 0)::bigint
      from public.sales_import_rows sir
      where sir.data_kind = 'order'
        and sir.order_date >= p_start_date
        and sir.order_date < p_end_date
        and (p_department_ids is null or sir.department_id = any(p_department_ids))
        and (p_external_staff_codes is null or sir.external_staff_code = any(p_external_staff_codes))
        and sir.customer_code is not null
      group by
        sir.department_id,
        sir.customer_code,
        sir.external_staff_code,
        date_trunc('month', sir.order_date);
  else
    return query
      select
        sir.department_id::bigint,
        sir.customer_code,
        max(sir.customer_name),
        sir.external_staff_code,
        to_char(date_trunc('month', sir.delivery_date), 'YYYY-MM'),
        coalesce(sum(coalesce(sir.amount, 0)), 0)::bigint
      from public.sales_import_rows sir
      where sir.data_kind = 'delivery'
        and sir.delivery_date >= p_start_date
        and sir.delivery_date < p_end_date
        and (p_department_ids is null or sir.department_id = any(p_department_ids))
        and (p_external_staff_codes is null or sir.external_staff_code = any(p_external_staff_codes))
        and sir.customer_code is not null
      group by
        sir.department_id,
        sir.customer_code,
        sir.external_staff_code,
        date_trunc('month', sir.delivery_date);
  end if;
end;
$$;

grant execute on function public.clinic_asset_sales_aggregates(date, date, bigint[], text[], text)
  to anon, authenticated, service_role;

create or replace function public.sales_prior_customer_codes(
  p_start_date date,
  p_end_date date,
  p_department_ids bigint[],
  p_external_staff_codes text[],
  p_customer_codes text[],
  p_data_kind text
)
returns table (
  customer_code text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select distinct sir.customer_code
    from public.sales_import_rows sir
    where sir.customer_code = any(p_customer_codes)
      and (p_department_ids is null or sir.department_id = any(p_department_ids))
      and (p_external_staff_codes is null or sir.external_staff_code = any(p_external_staff_codes))
      and (
        (
          sir.data_kind = 'order'
          and sir.order_date >= p_start_date
          and sir.order_date < p_end_date
        )
        or (
          sir.data_kind = 'delivery'
          and sir.delivery_date >= p_start_date
          and sir.delivery_date < p_end_date
        )
      );
end;
$$;

grant execute on function public.sales_prior_customer_codes(date, date, bigint[], text[], text[], text)
  to anon, authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
