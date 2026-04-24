begin;

alter table public.sales_import_raw_rows
  drop constraint if exists sales_import_raw_rows_region_check;
alter table public.sales_import_raw_rows
  drop column if exists region;

alter table public.sales_import_rows
  drop constraint if exists sales_import_rows_region_check;
alter table public.sales_import_rows
  drop column if exists region;

alter table public.external_staffs
  drop constraint if exists external_staffs_region_check;
alter table public.external_staffs
  drop column if exists region;

alter table public.customer_external_staff_maps
  drop constraint if exists customer_external_staff_maps_region_check;
alter table public.customer_external_staff_maps
  drop column if exists region;

alter table public.profile_external_staff_maps
  drop constraint if exists profile_external_staff_maps_region_check;
alter table public.profile_external_staff_maps
  drop column if exists region;

commit;
