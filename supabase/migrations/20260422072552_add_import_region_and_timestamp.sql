begin;

alter table public.sales_import_raw_rows
  add column if not exists imported_at timestamptz not null default now();

alter table public.sales_import_raw_rows_kansai
  add column if not exists imported_at timestamptz not null default now();

alter table public.sales_import_raw_rows_tokyo
  add column if not exists imported_at timestamptz not null default now();

commit;
