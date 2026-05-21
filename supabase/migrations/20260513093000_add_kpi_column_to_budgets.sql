alter table public.budgets
  add column if not exists "KPI" integer;

comment on column public.budgets."KPI" is 'ダッシュボード上の訪問目標に利用するKPI値';
