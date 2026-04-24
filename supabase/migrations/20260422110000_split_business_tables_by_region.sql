begin;

create table if not exists public.customers_kansai
(like public.customers including all);

create table if not exists public.customers_tokyo
(like public.customers including all);

create table if not exists public.customer_external_staff_maps_kansai
(like public.customer_external_staff_maps including all);

create table if not exists public.customer_external_staff_maps_tokyo
(like public.customer_external_staff_maps including all);

create table if not exists public.profile_external_staff_maps_kansai
(like public.profile_external_staff_maps including all);

create table if not exists public.profile_external_staff_maps_tokyo
(like public.profile_external_staff_maps including all);

create table if not exists public.prospect_customers_kansai
(like public.prospect_customers including all);

create table if not exists public.prospect_customers_tokyo
(like public.prospect_customers including all);

create table if not exists public.deals_kansai
(like public.deals including all);

create table if not exists public.deals_tokyo
(like public.deals including all);

create table if not exists public.budgets_kansai
(like public.budgets including all);

create table if not exists public.budgets_tokyo
(like public.budgets including all);

create table if not exists public.customer_merge_candidates_kansai
(like public.customer_merge_candidates including all);

create table if not exists public.customer_merge_candidates_tokyo
(like public.customer_merge_candidates including all);

create table if not exists public.sales_import_rows_kansai (
  source_raw_id bigint primary key,
  delivery_date date not null,
  customer_code text not null,
  customer_name text,
  external_staff_code text,
  amount bigint not null default 0,
  import_batch_id text,
  imported_at timestamptz not null default now()
);

create table if not exists public.sales_import_rows_tokyo (
  source_raw_id bigint primary key,
  delivery_date date not null,
  customer_code text not null,
  customer_name text,
  external_staff_code text,
  amount bigint not null default 0,
  import_batch_id text,
  imported_at timestamptz not null default now()
);

create index if not exists idx_sales_import_rows_kansai_delivery_date
  on public.sales_import_rows_kansai (delivery_date);

create index if not exists idx_sales_import_rows_tokyo_delivery_date
  on public.sales_import_rows_tokyo (delivery_date);

create index if not exists idx_sales_import_rows_kansai_customer_code
  on public.sales_import_rows_kansai (customer_code);

create index if not exists idx_sales_import_rows_tokyo_customer_code
  on public.sales_import_rows_tokyo (customer_code);

create index if not exists idx_sales_import_rows_kansai_external_staff_code
  on public.sales_import_rows_kansai (external_staff_code);

create index if not exists idx_sales_import_rows_tokyo_external_staff_code
  on public.sales_import_rows_tokyo (external_staff_code);

create index if not exists idx_sales_import_rows_kansai_import_batch_id
  on public.sales_import_rows_kansai (import_batch_id);

create index if not exists idx_sales_import_rows_tokyo_import_batch_id
  on public.sales_import_rows_tokyo (import_batch_id);

alter table public.customers_kansai enable row level security;
alter table public.customers_tokyo enable row level security;
alter table public.customer_external_staff_maps_kansai enable row level security;
alter table public.customer_external_staff_maps_tokyo enable row level security;
alter table public.profile_external_staff_maps_kansai enable row level security;
alter table public.profile_external_staff_maps_tokyo enable row level security;
alter table public.prospect_customers_kansai enable row level security;
alter table public.prospect_customers_tokyo enable row level security;
alter table public.deals_kansai enable row level security;
alter table public.deals_tokyo enable row level security;
alter table public.budgets_kansai enable row level security;
alter table public.budgets_tokyo enable row level security;
alter table public.customer_merge_candidates_kansai enable row level security;
alter table public.customer_merge_candidates_tokyo enable row level security;
alter table public.sales_import_rows_kansai enable row level security;
alter table public.sales_import_rows_tokyo enable row level security;

comment on table public.customers_kansai is '関西向けの取引先マスタ';
comment on table public.customers_tokyo is '東京向けの取引先マスタ';
comment on table public.customer_external_staff_maps_kansai is '関西向けの取引先担当者紐付け';
comment on table public.customer_external_staff_maps_tokyo is '東京向けの取引先担当者紐付け';
comment on table public.profile_external_staff_maps_kansai is '関西向けのプロフィール担当者紐付け';
comment on table public.profile_external_staff_maps_tokyo is '東京向けのプロフィール担当者紐付け';
comment on table public.prospect_customers_kansai is '関西向けの見込み顧客';
comment on table public.prospect_customers_tokyo is '東京向けの見込み顧客';
comment on table public.deals_kansai is '関西向けの商談';
comment on table public.deals_tokyo is '東京向けの商談';
comment on table public.budgets_kansai is '関西向けの予算';
comment on table public.budgets_tokyo is '東京向けの予算';
comment on table public.customer_merge_candidates_kansai is '関西向けの顧客マージ候補';
comment on table public.customer_merge_candidates_tokyo is '東京向けの顧客マージ候補';
comment on table public.sales_import_rows_kansai is '関西向けの正規化済み売上行';
comment on table public.sales_import_rows_tokyo is '東京向けの正規化済み売上行';

commit;
