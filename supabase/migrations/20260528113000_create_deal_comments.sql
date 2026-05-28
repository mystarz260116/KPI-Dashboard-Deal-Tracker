create table if not exists deal_comments (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid null references deals(id) on delete set null,
  clinic_kind text not null check (clinic_kind in ('customer', 'prospect')),
  clinic_id text not null,
  author_user_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_deal_comments_clinic_created_at
  on deal_comments(clinic_kind, clinic_id, created_at desc);

create index if not exists idx_deal_comments_author_created_at
  on deal_comments(author_user_id, created_at desc);
