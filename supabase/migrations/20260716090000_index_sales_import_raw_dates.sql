begin;

-- Finalizing an import replaces the previously imported rows for the same month.
-- Keeping the normalized dates on the raw table avoids downloading and parsing
-- every historical raw row in the API function before that replacement.
alter table public.sales_import_raw_rows
  add column if not exists delivery_date_parsed date
    generated always as (public.normalize_sales_import_date("納品日")) stored,
  add column if not exists order_date_parsed date
    generated always as (public.normalize_sales_import_date("受注日")) stored;

create index if not exists idx_sales_import_raw_rows_delivery_month_replace
  on public.sales_import_raw_rows (department_id, data_kind, delivery_date_parsed)
  include (import_batch_id);

create index if not exists idx_sales_import_raw_rows_order_month_replace
  on public.sales_import_raw_rows (department_id, data_kind, order_date_parsed)
  include (import_batch_id);

commit;
