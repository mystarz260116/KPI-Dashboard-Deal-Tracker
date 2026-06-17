begin;

create table if not exists public.ireba_sync_api_logs (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,
  operation text not null,
  request_mode text not null,
  received_count integer not null default 0,
  success_count integer not null default 0,
  failed_count integer not null default 0,
  internal_codes bigint[] not null default '{}'::bigint[],
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ireba_sync_api_logs_created_at_idx
  on public.ireba_sync_api_logs (created_at desc);

create index if not exists ireba_sync_api_logs_endpoint_created_at_idx
  on public.ireba_sync_api_logs (endpoint, created_at desc);

alter table public.ireba_sync_api_logs enable row level security;

comment on table public.ireba_sync_api_logs is 'いればくん外部連携APIの受付・処理結果ログ';

commit;
