begin;

create or replace function public.sum_sales_import_raw_rows_amount(
  p_start_date date,
  p_end_date date,
  p_customer_codes text[] default null,
  p_department_id bigint default null
)
returns table (sales_total bigint)
language sql
security definer
set search_path = public
as $$
  select coalesce(
    sum(
      coalesce(
        public.parse_sales_import_amount(sir."金額"),
        0
      )
    ),
    0
  )::bigint as sales_total
  from public.sales_import_raw_rows sir
  where public.normalize_sales_import_date(sir."納品日") >= p_start_date
    and public.normalize_sales_import_date(sir."納品日") < p_end_date
    and (p_department_id is null or sir.department_id = p_department_id)
    and (
      p_customer_codes is null
      or nullif(btrim(sir."得意先コード"), '') = any(p_customer_codes)
    );
$$;

grant execute on function public.sum_sales_import_raw_rows_amount(date, date, text[], bigint)
  to anon, authenticated, service_role;

commit;
