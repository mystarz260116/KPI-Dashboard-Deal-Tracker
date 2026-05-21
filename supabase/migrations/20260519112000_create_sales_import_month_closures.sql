create table if not exists public.sales_import_month_closures (
  id bigserial primary key,
  department_id bigint not null references public.departments(id) on delete cascade,
  target_year_month text not null,
  closed_at timestamptz not null default now(),
  closed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (department_id, target_year_month)
);

alter table public.sales_import_month_closures enable row level security;

comment on table public.sales_import_month_closures is '売上CSV取込の月次締め管理';
comment on column public.sales_import_month_closures.target_year_month is '対象月(YYYY-MM)';
comment on column public.sales_import_month_closures.closed_at is '月締め実行日時';
comment on column public.sales_import_month_closures.closed_by is '月締め実行者';
