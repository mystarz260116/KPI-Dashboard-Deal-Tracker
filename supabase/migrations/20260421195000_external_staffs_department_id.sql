begin;

alter table public.external_staffs
  add column if not exists department_id bigint references public.departments(id);

update public.external_staffs
set department_id = 1
where department_id is null;

create index if not exists idx_external_staffs_department_id
  on public.external_staffs(department_id);

commit;
