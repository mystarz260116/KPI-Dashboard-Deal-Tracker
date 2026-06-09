alter table public.budgets
  add column if not exists kpivisit numeric,
  add column if not exists kpiclosure numeric;

update public.budgets
set
  kpivisit = coalesce(kpivisit, "KPI_visit"),
  kpiclosure = coalesce(kpiclosure, "KPI_closure")
where "KPI_visit" is not null
  or "KPI_closure" is not null;

alter table public.budgets
  drop column if exists "KPI_visit",
  drop column if exists "KPI_closure";

comment on column public.budgets.kpivisit is '月次の訪問目標数（小数可）';
comment on column public.budgets.kpiclosure is '月次の商談受注目標数（小数可）';
