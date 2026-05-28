alter table profiles
  add column if not exists last_login_at timestamptz null,
  add column if not exists login_count integer not null default 0;

create table if not exists login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  logged_in_at timestamptz not null default now()
);

create index if not exists idx_login_events_user_logged_in_at
  on login_events(user_id, logged_in_at desc);

create index if not exists idx_login_events_logged_in_at
  on login_events(logged_in_at desc);

create table if not exists deal_page_views (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid null references deals(id) on delete set null,
  clinic_kind text not null check (clinic_kind in ('customer', 'prospect')),
  clinic_id text not null,
  viewer_user_id uuid not null references profiles(id) on delete cascade,
  viewed_at timestamptz not null default now()
);

create index if not exists idx_deal_page_views_viewer_viewed_at
  on deal_page_views(viewer_user_id, viewed_at desc);

create index if not exists idx_deal_page_views_clinic_viewed_at
  on deal_page_views(clinic_kind, clinic_id, viewed_at desc);

create index if not exists idx_deal_page_views_deal_viewed_at
  on deal_page_views(deal_id, viewed_at desc);
