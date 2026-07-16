begin;

create or replace function public.replace_open_month_sales_import_data(
  p_department_id bigint,
  p_import_batch_id text,
  p_data_kind text,
  p_start_date date,
  p_end_date_exclusive date
)
returns table (
  deleted_raw_rows integer,
  deleted_sales_rows integer
)
language plpgsql
security definer
set search_path = public
set statement_timeout = '0'
as $$
declare
  v_deleted_raw_rows integer := 0;
  v_deleted_sales_rows integer := 0;
begin
  if p_data_kind not in ('delivery', 'order') then
    raise exception 'invalid sales import data kind: %', p_data_kind;
  end if;

  if p_start_date is null
    or p_end_date_exclusive is null
    or p_start_date >= p_end_date_exclusive then
    raise exception 'invalid sales import replacement date range';
  end if;

  if p_data_kind = 'order' then
    delete from public.sales_import_rows
    where department_id = p_department_id
      and data_kind = p_data_kind
      and import_batch_id is distinct from p_import_batch_id
      and order_date >= p_start_date
      and order_date < p_end_date_exclusive;
    get diagnostics v_deleted_sales_rows = row_count;

    delete from public.sales_import_raw_rows
    where department_id = p_department_id
      and data_kind = p_data_kind
      and import_batch_id is distinct from p_import_batch_id
      and order_date_parsed >= p_start_date
      and order_date_parsed < p_end_date_exclusive;
    get diagnostics v_deleted_raw_rows = row_count;
  else
    delete from public.sales_import_rows
    where department_id = p_department_id
      and data_kind = p_data_kind
      and import_batch_id is distinct from p_import_batch_id
      and delivery_date >= p_start_date
      and delivery_date < p_end_date_exclusive;
    get diagnostics v_deleted_sales_rows = row_count;

    delete from public.sales_import_raw_rows
    where department_id = p_department_id
      and data_kind = p_data_kind
      and import_batch_id is distinct from p_import_batch_id
      and delivery_date_parsed >= p_start_date
      and delivery_date_parsed < p_end_date_exclusive;
    get diagnostics v_deleted_raw_rows = row_count;
  end if;

  deleted_raw_rows := v_deleted_raw_rows;
  deleted_sales_rows := v_deleted_sales_rows;
  return next;
end;
$$;

revoke all on function public.replace_open_month_sales_import_data(bigint, text, text, date, date) from public;
grant execute on function public.replace_open_month_sales_import_data(bigint, text, text, date, date) to service_role;

commit;
