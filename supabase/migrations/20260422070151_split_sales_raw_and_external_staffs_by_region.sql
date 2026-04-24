begin;

create table if not exists public.sales_import_raw_rows_kansai
(like public.sales_import_raw_rows including all);

create table if not exists public.sales_import_raw_rows_tokyo
(like public.sales_import_raw_rows including all);

create table if not exists public.external_staffs_kansai
(like public.external_staffs including all);

create table if not exists public.external_staffs_tokyo
(like public.external_staffs including all);

alter table public.sales_import_raw_rows_kansai enable row level security;
alter table public.sales_import_raw_rows_tokyo enable row level security;
alter table public.external_staffs_kansai enable row level security;
alter table public.external_staffs_tokyo enable row level security;

comment on table public.sales_import_raw_rows_kansai is '関西向けの売上CSV raw import テーブル';
comment on table public.sales_import_raw_rows_tokyo is '東京向けの売上CSV raw import テーブル';
comment on table public.external_staffs_kansai is '関西向けの external staff マスタ';
comment on table public.external_staffs_tokyo is '東京向けの external staff マスタ';

commit;
