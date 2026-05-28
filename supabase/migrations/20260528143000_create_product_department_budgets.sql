begin;

create table if not exists public.product_department_budgets (
  id uuid primary key default gen_random_uuid(),
  department_id bigint not null
    references public.departments (id)
    on delete cascade,
  target_year_month text not null,
  product_department_name text not null,
  target_amount bigint not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_product_department_budgets_unique
  on public.product_department_budgets (
    department_id,
    target_year_month,
    product_department_name
  );

create index if not exists idx_product_department_budgets_department_month
  on public.product_department_budgets (department_id, target_year_month);

comment on table public.product_department_budgets is '商品部門別売上パネル向けの月次予算';
comment on column public.product_department_budgets.target_year_month is 'YYYY-MM 形式の対象月';
comment on column public.product_department_budgets.product_department_name is '商品部門別売上パネルで使う分類名（例: CADCAM冠, ジルコニア）';
comment on column public.product_department_budgets.target_amount is '対象月における商品部門別の目標予算';

commit;
