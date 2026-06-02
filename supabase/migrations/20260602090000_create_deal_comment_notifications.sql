create table if not exists public.deal_comment_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  comment_id uuid not null references public.deal_comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  unique (recipient_user_id, comment_id)
);

create index if not exists idx_deal_comment_notifications_recipient_created_at
  on public.deal_comment_notifications(recipient_user_id, created_at desc);

create index if not exists idx_deal_comment_notifications_recipient_unread
  on public.deal_comment_notifications(recipient_user_id, created_at desc)
  where read_at is null;

alter table public.deal_comment_notifications enable row level security;

drop policy if exists "deal_comment_notifications_select_own" on public.deal_comment_notifications;
create policy "deal_comment_notifications_select_own"
on public.deal_comment_notifications
for select
to authenticated
using (recipient_user_id = auth.uid() or public.is_admin_user());

drop policy if exists "deal_comment_notifications_update_own" on public.deal_comment_notifications;
create policy "deal_comment_notifications_update_own"
on public.deal_comment_notifications
for update
to authenticated
using (recipient_user_id = auth.uid() or public.is_admin_user())
with check (recipient_user_id = auth.uid() or public.is_admin_user());
