begin;

alter table public.deals
  add column if not exists contact_role text,
  add column if not exists decision_maker_contact text,
  add column if not exists proposal_category text,
  add column if not exists deal_temperature text,
  add column if not exists next_action_type text,
  add column if not exists next_action_date date;

alter table public.deals
  drop constraint if exists deals_decision_maker_contact_check,
  add constraint deals_decision_maker_contact_check
    check (decision_maker_contact is null or decision_maker_contact in ('yes', 'no', 'unknown')) not valid,
  drop constraint if exists deals_deal_temperature_check,
  add constraint deals_deal_temperature_check
    check (deal_temperature is null or deal_temperature in ('A', 'B', 'C', 'D', 'E')) not valid;

create index if not exists idx_deals_proposal_category on public.deals(proposal_category);
create index if not exists idx_deals_deal_temperature on public.deals(deal_temperature);
create index if not exists idx_deals_next_action_date on public.deals(next_action_date);

comment on column public.deals.contact_role is '商談で主に接触した相手の役割';
comment on column public.deals.decision_maker_contact is '決裁者接触: yes/no/unknown';
comment on column public.deals.proposal_category is '提案カテゴリ';
comment on column public.deals.deal_temperature is '商談温度: A=すぐ案件化, B=見込みあり, C=長期フォロー, D=可能性低い, E=失注/拒否';
comment on column public.deals.next_action_type is '次回アクション種別';
comment on column public.deals.next_action_date is '次回アクション予定日';

commit;
