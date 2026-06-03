alter table public.deals
  add column if not exists expected_monthly_amounts jsonb not null default '{}'::jsonb;

comment on column public.deals.expected_monthly_amounts is 'カテゴリ別の受注予定額/月';
