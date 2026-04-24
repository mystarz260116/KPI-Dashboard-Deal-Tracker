begin;

create or replace function public.sum_sales_import_rows_amount(
  p_start_date date,
  p_end_date date,
  p_external_staff_codes text[] default null
)
returns table (sales_total bigint)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(sum(coalesce(sir.amount, 0)), 0)::bigint as sales_total
  from public.sales_import_rows sir
  where sir.delivery_date >= p_start_date
    and sir.delivery_date < p_end_date
    and (
      p_external_staff_codes is null
      or sir.external_staff_code = any(p_external_staff_codes)
    );
$$;

grant execute on function public.sum_sales_import_rows_amount(date, date, text[]) to anon, authenticated, service_role;

commit;
