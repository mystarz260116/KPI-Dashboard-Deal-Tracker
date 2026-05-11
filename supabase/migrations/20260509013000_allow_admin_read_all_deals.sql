begin;

drop policy if exists "deals_select_own" on public.deals;
create policy "deals_select_own"
on public.deals
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
);

drop policy if exists "deals_update_own" on public.deals;
create policy "deals_update_own"
on public.deals
for update
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
);

drop policy if exists "deals_delete_own" on public.deals;
create policy "deals_delete_own"
on public.deals
for delete
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
);

drop policy if exists "prospect_customers_select_own" on public.prospect_customers;
create policy "prospect_customers_select_own"
on public.prospect_customers
for select
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
);

commit;
