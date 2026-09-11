-- iReba sales rows contain customer names, staff codes, and monetary amounts.
-- All application reads go through server-side API handlers using service_role,
-- so the view and its SECURITY DEFINER reporting functions must not be exposed
-- through PostgREST to public, anon, or ordinary authenticated clients.

alter view public.ireba_sales_rows set (security_invoker = true);

revoke all on public.ireba_sales_rows from public, anon, authenticated;
grant select on public.ireba_sales_rows to service_role;

revoke execute on function public.sum_sales_import_rows_amount(date, date, text[], bigint, text)
  from public, anon, authenticated;
revoke execute on function public.sum_sales_import_rows_amount(date, date, text[], bigint)
  from public, anon, authenticated;
revoke execute on function public.dashboard_sales_import_aggregates(date, date, bigint[], text[], text)
  from public, anon, authenticated;
revoke execute on function public.dashboard_sales_import_aggregates_json(date, date, bigint[], text[], text)
  from public, anon, authenticated;
revoke execute on function public.clinic_asset_sales_aggregates(date, date, bigint[], text[], text)
  from public, anon, authenticated;
revoke execute on function public.clinic_asset_sales_aggregates_json(date, date, bigint[], text[], text)
  from public, anon, authenticated;
revoke execute on function public.sales_prior_customer_codes(date, date, bigint[], text[], text[], text)
  from public, anon, authenticated;
revoke execute on function public.compare_ireba_sales_with_import_rows(date, date)
  from public, anon, authenticated;
revoke execute on function public.compare_ireba_tech_sales_with_import_rows(date, date)
  from public, anon, authenticated;

grant execute on function public.sum_sales_import_rows_amount(date, date, text[], bigint, text)
  to service_role;
grant execute on function public.sum_sales_import_rows_amount(date, date, text[], bigint)
  to service_role;
grant execute on function public.dashboard_sales_import_aggregates(date, date, bigint[], text[], text)
  to service_role;
grant execute on function public.dashboard_sales_import_aggregates_json(date, date, bigint[], text[], text)
  to service_role;
grant execute on function public.clinic_asset_sales_aggregates(date, date, bigint[], text[], text)
  to service_role;
grant execute on function public.clinic_asset_sales_aggregates_json(date, date, bigint[], text[], text)
  to service_role;
grant execute on function public.sales_prior_customer_codes(date, date, bigint[], text[], text[], text)
  to service_role;
grant execute on function public.compare_ireba_sales_with_import_rows(date, date)
  to service_role;
grant execute on function public.compare_ireba_tech_sales_with_import_rows(date, date)
  to service_role;

select pg_notify('pgrst', 'reload schema');
