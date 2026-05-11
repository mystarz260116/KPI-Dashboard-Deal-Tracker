begin;

alter table public.budgets
  add column if not exists external_staff_code text;

update public.budgets as b
set external_staff_code = map.external_staff_code
from (
  select distinct on (pfm.department_id, pfm.profile_id)
    pfm.department_id,
    pfm.profile_id,
    pfm.external_staff_code
  from public.profile_external_staff_maps as pfm
  order by pfm.department_id, pfm.profile_id, pfm.is_primary desc, pfm.created_at asc, pfm.external_staff_code asc
) as map
where b.external_staff_code is null
  and b.department_id = map.department_id
  and b.user_id = map.profile_id;

create index if not exists idx_budgets_department_external_staff_code
  on public.budgets (department_id, external_staff_code);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'budgets_department_external_staff_code_fkey'
  ) then
    alter table public.budgets
      add constraint budgets_department_external_staff_code_fkey
      foreign key (department_id, external_staff_code)
      references public.external_staffs (department_id, code);
  end if;
end $$;

commit;
