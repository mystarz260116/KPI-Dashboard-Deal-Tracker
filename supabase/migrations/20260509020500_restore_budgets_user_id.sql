begin;

alter table public.budgets
  add column if not exists user_id uuid;

update public.budgets as b
set user_id = map.profile_id
from (
  select distinct on (pfm.department_id, pfm.external_staff_code)
    pfm.department_id,
    pfm.external_staff_code,
    pfm.profile_id
  from public.profile_external_staff_maps as pfm
  order by pfm.department_id, pfm.external_staff_code, pfm.is_primary desc, pfm.created_at asc, pfm.profile_id asc
) as map
where b.user_id is null
  and b.department_id = map.department_id
  and b.external_staff_code = map.external_staff_code;

create index if not exists idx_budgets_user_id
  on public.budgets (user_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'budgets_user_id_fkey'
  ) then
    alter table public.budgets
      add constraint budgets_user_id_fkey
      foreign key (user_id)
      references public.profiles (id);
  end if;
end $$;

commit;
