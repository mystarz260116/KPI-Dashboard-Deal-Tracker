begin;

alter table public.deals
  add column if not exists proposal_categories text[];

update public.deals
set proposal_categories = array[proposal_category]
where proposal_category is not null
  and (proposal_categories is null or array_length(proposal_categories, 1) is null);

create index if not exists idx_deals_proposal_categories_gin
on public.deals
using gin (proposal_categories);

comment on column public.deals.proposal_categories is '提案カテゴリ（複数選択）';

commit;
