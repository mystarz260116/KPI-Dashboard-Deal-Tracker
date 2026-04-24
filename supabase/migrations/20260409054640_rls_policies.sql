begin;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'departments',
    'profiles',
    'deals',
    'customers',
    'prospect_customers',
    'budgets',
    'customer_merge_candidates',
    'profile_external_staff_maps',
    'customer_external_staff_maps',
    'external_staffs',
    'sales_import_rows',
    'sales_import_raw_rows'
  ]
  loop
    if exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = relation_name
        and c.relkind in ('r', 'p')
    ) then
      execute format('alter table public.%I enable row level security', relation_name);
    end if;
  end loop;
end
$$;

drop policy if exists "departments_read_all" on public.departments;
create policy "departments_read_all"
on public.departments
for select
to anon, authenticated
using (true);

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "customers_read_all_authenticated" on public.customers;
create policy "customers_read_all_authenticated"
on public.customers
for select
to authenticated
using (true);

drop policy if exists "deals_select_own" on public.deals;
create policy "deals_select_own"
on public.deals
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "deals_insert_own" on public.deals;
create policy "deals_insert_own"
on public.deals
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "deals_update_own" on public.deals;
create policy "deals_update_own"
on public.deals
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "deals_delete_own" on public.deals;
create policy "deals_delete_own"
on public.deals
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "prospect_customers_select_own" on public.prospect_customers;
create policy "prospect_customers_select_own"
on public.prospect_customers
for select
to authenticated
using (created_by = auth.uid());

drop policy if exists "prospect_customers_insert_own" on public.prospect_customers;
create policy "prospect_customers_insert_own"
on public.prospect_customers
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "prospect_customers_update_own" on public.prospect_customers;
create policy "prospect_customers_update_own"
on public.prospect_customers
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

commit;
