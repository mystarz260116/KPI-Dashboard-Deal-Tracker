begin;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.can_access_dashboard_data()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and (
        role = 'admin'
        or coalesce(can_view_dashboard, false) = true
      )
  );
$$;

grant execute on function public.is_admin_user() to authenticated;
grant execute on function public.can_access_dashboard_data() to authenticated;

alter table public.login_events enable row level security;
alter table public.deal_page_views enable row level security;
alter table public.deal_comments enable row level security;
alter table public.deal_reactions enable row level security;
alter table public.product_category_masters enable row level security;
alter table public.product_departments enable row level security;
alter table public.product_department_budgets enable row level security;
alter table public.sales_import_month_closures enable row level security;
alter table public.deal_board_states enable row level security;
alter table public.deal_board_month_closures enable row level security;

drop policy if exists "login_events_select_own" on public.login_events;
create policy "login_events_select_own"
on public.login_events
for select
to authenticated
using (user_id = auth.uid() or public.is_admin_user());

drop policy if exists "login_events_insert_own" on public.login_events;
create policy "login_events_insert_own"
on public.login_events
for insert
to authenticated
with check (user_id = auth.uid() or public.is_admin_user());

drop policy if exists "deal_page_views_select_own" on public.deal_page_views;
create policy "deal_page_views_select_own"
on public.deal_page_views
for select
to authenticated
using (viewer_user_id = auth.uid() or public.is_admin_user());

drop policy if exists "deal_page_views_insert_own" on public.deal_page_views;
create policy "deal_page_views_insert_own"
on public.deal_page_views
for insert
to authenticated
with check (viewer_user_id = auth.uid() or public.is_admin_user());

drop policy if exists "deal_comments_select_authenticated" on public.deal_comments;
create policy "deal_comments_select_authenticated"
on public.deal_comments
for select
to authenticated
using (true);

drop policy if exists "deal_comments_insert_own" on public.deal_comments;
create policy "deal_comments_insert_own"
on public.deal_comments
for insert
to authenticated
with check (author_user_id = auth.uid() or public.is_admin_user());

drop policy if exists "deal_comments_update_own" on public.deal_comments;
create policy "deal_comments_update_own"
on public.deal_comments
for update
to authenticated
using (author_user_id = auth.uid() or public.is_admin_user())
with check (author_user_id = auth.uid() or public.is_admin_user());

drop policy if exists "deal_comments_delete_own" on public.deal_comments;
create policy "deal_comments_delete_own"
on public.deal_comments
for delete
to authenticated
using (author_user_id = auth.uid() or public.is_admin_user());

drop policy if exists "deal_reactions_select_authenticated" on public.deal_reactions;
create policy "deal_reactions_select_authenticated"
on public.deal_reactions
for select
to authenticated
using (true);

drop policy if exists "deal_reactions_insert_own" on public.deal_reactions;
create policy "deal_reactions_insert_own"
on public.deal_reactions
for insert
to authenticated
with check (reactor_user_id = auth.uid() or public.is_admin_user());

drop policy if exists "deal_reactions_delete_own" on public.deal_reactions;
create policy "deal_reactions_delete_own"
on public.deal_reactions
for delete
to authenticated
using (reactor_user_id = auth.uid() or public.is_admin_user());

drop policy if exists "product_departments_read_dashboard" on public.product_departments;
create policy "product_departments_read_dashboard"
on public.product_departments
for select
to authenticated
using (public.can_access_dashboard_data());

drop policy if exists "product_category_masters_read_dashboard" on public.product_category_masters;
create policy "product_category_masters_read_dashboard"
on public.product_category_masters
for select
to authenticated
using (public.can_access_dashboard_data());

drop policy if exists "product_department_budgets_read_dashboard" on public.product_department_budgets;
create policy "product_department_budgets_read_dashboard"
on public.product_department_budgets
for select
to authenticated
using (public.can_access_dashboard_data());

drop policy if exists "sales_import_month_closures_read_dashboard" on public.sales_import_month_closures;
create policy "sales_import_month_closures_read_dashboard"
on public.sales_import_month_closures
for select
to authenticated
using (public.can_access_dashboard_data());

drop policy if exists "deal_board_states_read_dashboard" on public.deal_board_states;
create policy "deal_board_states_read_dashboard"
on public.deal_board_states
for select
to authenticated
using (public.can_access_dashboard_data());

drop policy if exists "deal_board_month_closures_read_dashboard" on public.deal_board_month_closures;
create policy "deal_board_month_closures_read_dashboard"
on public.deal_board_month_closures
for select
to authenticated
using (public.can_access_dashboard_data());

commit;
