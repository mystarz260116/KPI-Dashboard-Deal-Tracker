create table if not exists deal_reactions (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  reactor_user_id uuid not null references profiles(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like', 'helpful', 'congrats')),
  created_at timestamptz not null default now(),
  unique (deal_id, reactor_user_id, reaction_type)
);

create index if not exists idx_deal_reactions_deal_created_at
  on deal_reactions(deal_id, created_at desc);

create index if not exists idx_deal_reactions_reactor_created_at
  on deal_reactions(reactor_user_id, created_at desc);
