begin;

create table if not exists public.product_departments (
  id uuid primary key default gen_random_uuid(),
  department_id bigint not null
    references public.departments (id)
    on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_product_departments_department_name
  on public.product_departments (department_id, name);

create index if not exists idx_product_departments_department_sort
  on public.product_departments (department_id, sort_order, name);

alter table public.product_category_masters
  add column if not exists product_department_id uuid;

alter table public.product_department_budgets
  add column if not exists product_department_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_category_masters_product_department_id_fkey'
  ) then
    alter table public.product_category_masters
      add constraint product_category_masters_product_department_id_fkey
      foreign key (product_department_id)
      references public.product_departments (id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_department_budgets_product_department_id_fkey'
  ) then
    alter table public.product_department_budgets
      add constraint product_department_budgets_product_department_id_fkey
      foreign key (product_department_id)
      references public.product_departments (id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_product_category_masters_product_department_id
  on public.product_category_masters (product_department_id);

create index if not exists idx_product_department_budgets_product_department_id
  on public.product_department_budgets (product_department_id);

insert into public.product_departments (
  department_id,
  name,
  sort_order,
  created_at,
  updated_at
)
select distinct
  pcm.department_id,
  btrim(pcm.major_category) as name,
  coalesce(min(pcm.sort_order), 0) as sort_order,
  now(),
  now()
from public.product_category_masters pcm
where pcm.department_id is not null
  and nullif(btrim(pcm.major_category), '') is not null
group by pcm.department_id, btrim(pcm.major_category)
on conflict (department_id, name) do update set
  sort_order = least(public.product_departments.sort_order, excluded.sort_order),
  updated_at = now();

insert into public.product_departments (
  department_id,
  name,
  sort_order,
  created_at,
  updated_at
)
select distinct
  pdb.department_id,
  btrim(pdb.product_department_name) as name,
  0 as sort_order,
  now(),
  now()
from public.product_department_budgets pdb
where nullif(btrim(pdb.product_department_name), '') is not null
on conflict (department_id, name) do update set
  updated_at = now();

update public.product_category_masters pcm
set product_department_id = pd.id
from public.product_departments pd
where pcm.department_id = pd.department_id
  and nullif(btrim(pcm.major_category), '') = pd.name
  and pcm.product_department_id is null;

update public.product_department_budgets pdb
set product_department_id = pd.id
from public.product_departments pd
where pdb.department_id = pd.department_id
  and nullif(btrim(pdb.product_department_name), '') = pd.name
  and pdb.product_department_id is null;

commit;
