alter table public.budgets
  alter column "KPI_visit" type numeric
  using "KPI_visit"::numeric;

comment on column public.budgets."KPI_visit" is '月次の訪問目標数（小数可）';
