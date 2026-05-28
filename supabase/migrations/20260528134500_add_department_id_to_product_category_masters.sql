begin;

alter table public.product_category_masters
  add column if not exists department_id bigint references public.departments(id) on delete cascade;

drop index if exists idx_product_category_masters_code;

create unique index if not exists idx_product_category_masters_department_code
  on public.product_category_masters (department_id, normalized_product_code);

create index if not exists idx_product_category_masters_department_proposal_category
  on public.product_category_masters (department_id, proposal_category);

commit;
