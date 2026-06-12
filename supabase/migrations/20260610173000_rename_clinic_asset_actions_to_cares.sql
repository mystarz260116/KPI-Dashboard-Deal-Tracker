create table if not exists public.clinic_asset_cares (
  customer_code text primary key,
  care_status text not null default '未対応',
  next_care_date date,
  care_memo text not null default '',
  department_id bigint,
  user_id uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.clinic_asset_actions') is not null then
    insert into public.clinic_asset_cares (
      customer_code,
      care_status,
      next_care_date,
      care_memo,
      department_id,
      user_id,
      updated_by,
      created_at,
      updated_at
    )
    select
      customer_code,
      case
        when status = '失注懸念' then '離反懸念'
        else coalesce(status, '未対応')
      end,
      next_action_date,
      coalesce(memo, ''),
      department_id,
      user_id,
      updated_by,
      created_at,
      updated_at
    from public.clinic_asset_actions
    on conflict (customer_code) do update set
      care_status = excluded.care_status,
      next_care_date = excluded.next_care_date,
      care_memo = excluded.care_memo,
      department_id = excluded.department_id,
      user_id = excluded.user_id,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;
  end if;
end $$;

update public.clinic_asset_cares
set care_status = '離反懸念'
where care_status = '失注懸念';

create index if not exists idx_clinic_asset_cares_status
  on public.clinic_asset_cares (care_status);

create index if not exists idx_clinic_asset_cares_next_care_date
  on public.clinic_asset_cares (next_care_date);

alter table public.clinic_asset_cares enable row level security;

drop policy if exists "clinic_asset_cares_service_role_all" on public.clinic_asset_cares;
create policy "clinic_asset_cares_service_role_all"
  on public.clinic_asset_cares
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
