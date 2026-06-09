alter table public.budgets
  add column if not exists "KPI_visit" integer,
  add column if not exists "KPI_closure" integer,
  add column if not exists "KPI_new_order_amount" bigint;

update public.budgets
set "KPI_visit" = coalesce("KPI_visit", "KPI")
where "KPI" is not null;

comment on column public.budgets."KPI_visit" is '月次の訪問目標数';
comment on column public.budgets."KPI_closure" is '月次の商談受注目標数';
comment on column public.budgets."KPI_new_order_amount" is '月次の新規開拓金額目標';
