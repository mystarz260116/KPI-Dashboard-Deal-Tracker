begin;

alter table public.departments
  add column if not exists is_sales_department boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists sort_order integer not null default 0;

alter table public.profiles
  add column if not exists is_salesperson boolean not null default false;

update public.departments
set is_sales_department = true
where name in ('営業部', '東京営業部', '大阪営業部', '関西営業部');

comment on column public.departments.is_sales_department is '営業組織として売上担当者を所属させる部署か';
comment on column public.profiles.is_salesperson is '売上・予算・医院を担当する営業部員か';

commit;
