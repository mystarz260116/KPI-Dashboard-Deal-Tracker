alter table public.budgets
  alter column "KPI_closure" type numeric
  using "KPI_closure"::numeric;

comment on column public.budgets."KPI_closure" is '月次の商談受注目標数（小数可）';
