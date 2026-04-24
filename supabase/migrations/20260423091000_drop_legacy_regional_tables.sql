begin;

drop table if exists public.sales_import_raw_rows_kansai cascade;
drop table if exists public.sales_import_raw_rows_tokyo cascade;
drop table if exists public.sales_import_rows_kansai cascade;
drop table if exists public.sales_import_rows_tokyo cascade;
drop table if exists public.external_staffs_kansai cascade;
drop table if exists public.external_staffs_tokyo cascade;
drop table if exists public.customer_external_staff_maps_kansai cascade;
drop table if exists public.customer_external_staff_maps_tokyo cascade;
drop table if exists public.profile_external_staff_maps_kansai cascade;
drop table if exists public.profile_external_staff_maps_tokyo cascade;

drop table if exists public.customers_kansai cascade;
drop table if exists public.customers_tokyo cascade;
drop table if exists public.prospect_customers_kansai cascade;
drop table if exists public.prospect_customers_tokyo cascade;
drop table if exists public.budgets_kansai cascade;
drop table if exists public.budgets_tokyo cascade;
drop table if exists public.customer_merge_candidates_kansai cascade;
drop table if exists public.customer_merge_candidates_tokyo cascade;

drop function if exists public.trg_sync_external_staffs_kansai() cascade;
drop function if exists public.trg_sync_external_staffs_tokyo() cascade;
drop function if exists public.sync_external_staff_from_regional_raw(text, bigint, text) cascade;

commit;
