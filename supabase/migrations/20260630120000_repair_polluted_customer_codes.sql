begin;

create temp table tmp_polluted_customer_code_pairs on commit drop as
select
  code as polluted_code,
  nullif(btrim(split_part(split_part(code, '：', 1), ':', 1)), '') as normalized_code,
  nullif(
    btrim(coalesce(nullif(split_part(code, '：', 2), ''), nullif(split_part(code, ':', 2), ''))),
    ''
  ) as normalized_name,
  name as polluted_name
from public.customers
where code like '%：%' or code like '%:%';

delete from tmp_polluted_customer_code_pairs
where normalized_code is null
  or normalized_code = polluted_code;

insert into public.customers (code, name)
select
  normalized_code,
  coalesce(nullif(normalized_name, ''), nullif(polluted_name, ''), normalized_code)
from tmp_polluted_customer_code_pairs
on conflict (code) do nothing;

update public.sales_import_rows sir
set
  customer_code = p.normalized_code,
  customer_name = coalesce(
    nullif(p.normalized_name, ''),
    nullif(sir.customer_name, ''),
    p.normalized_code
  )
from tmp_polluted_customer_code_pairs p
where sir.customer_code = p.polluted_code;

update public.deals d
set customer_code = p.normalized_code
from tmp_polluted_customer_code_pairs p
where d.customer_code = p.polluted_code;

update public.prospect_customers pc
set merged_customer_code = p.normalized_code
from tmp_polluted_customer_code_pairs p
where pc.merged_customer_code = p.polluted_code;

insert into public.customer_external_staff_maps (
  department_id,
  customer_code,
  external_staff_code
)
select distinct
  cesm.department_id,
  p.normalized_code,
  cesm.external_staff_code
from public.customer_external_staff_maps cesm
join tmp_polluted_customer_code_pairs p
  on p.polluted_code = cesm.customer_code
on conflict (department_id, customer_code, external_staff_code) do nothing;

delete from public.customer_external_staff_maps cesm
using tmp_polluted_customer_code_pairs p
where cesm.customer_code = p.polluted_code;

insert into public.customer_merge_candidates (
  prospect_customer_id,
  customer_code,
  match_score,
  match_reason,
  decision,
  created_at
)
select
  cmc.prospect_customer_id,
  p.normalized_code,
  cmc.match_score,
  cmc.match_reason,
  cmc.decision,
  cmc.created_at
from public.customer_merge_candidates cmc
join tmp_polluted_customer_code_pairs p
  on p.polluted_code = cmc.customer_code
on conflict (prospect_customer_id, customer_code) do update set
  match_score = greatest(public.customer_merge_candidates.match_score, excluded.match_score),
  match_reason = excluded.match_reason,
  decision = case
    when public.customer_merge_candidates.decision = 'rejected' then 'rejected'
    else excluded.decision
  end;

delete from public.customer_merge_candidates cmc
using tmp_polluted_customer_code_pairs p
where cmc.customer_code = p.polluted_code;

update public.detected_new_orders dno
set
  customer_code = p.normalized_code,
  customer_name = coalesce(nullif(p.normalized_name, ''), dno.customer_name, p.normalized_code),
  updated_at = now()
from tmp_polluted_customer_code_pairs p
where dno.customer_code = p.polluted_code
  and not exists (
    select 1
    from public.detected_new_orders existing
    where existing.source = dno.source
      and existing.data_kind = dno.data_kind
      and existing.detected_month = dno.detected_month
      and existing.customer_code = p.normalized_code
      and existing.id <> dno.id
  );

delete from public.detected_new_orders dno
using tmp_polluted_customer_code_pairs p
where dno.customer_code = p.polluted_code
  and exists (
    select 1
    from public.detected_new_orders existing
    where existing.source = dno.source
      and existing.data_kind = dno.data_kind
      and existing.detected_month = dno.detected_month
      and existing.customer_code = p.normalized_code
      and existing.id <> dno.id
  );

do $$
begin
  if to_regclass('public.clinic_asset_cares') is not null then
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
      p.normalized_code,
      cac.care_status,
      cac.next_care_date,
      cac.care_memo,
      cac.department_id,
      cac.user_id,
      cac.updated_by,
      cac.created_at,
      cac.updated_at
    from public.clinic_asset_cares cac
    join tmp_polluted_customer_code_pairs p
      on p.polluted_code = cac.customer_code
    on conflict (customer_code) do update set
      care_status = excluded.care_status,
      next_care_date = excluded.next_care_date,
      care_memo = excluded.care_memo,
      department_id = excluded.department_id,
      user_id = excluded.user_id,
      updated_by = excluded.updated_by,
      updated_at = greatest(public.clinic_asset_cares.updated_at, excluded.updated_at);

    delete from public.clinic_asset_cares cac
    using tmp_polluted_customer_code_pairs p
    where cac.customer_code = p.polluted_code;
  end if;

  if to_regclass('public.clinic_asset_actions') is not null then
    insert into public.clinic_asset_actions (
      customer_code,
      status,
      next_action_date,
      memo,
      department_id,
      user_id,
      updated_by,
      created_at,
      updated_at
    )
    select
      p.normalized_code,
      caa.status,
      caa.next_action_date,
      caa.memo,
      caa.department_id,
      caa.user_id,
      caa.updated_by,
      caa.created_at,
      caa.updated_at
    from public.clinic_asset_actions caa
    join tmp_polluted_customer_code_pairs p
      on p.polluted_code = caa.customer_code
    on conflict (customer_code) do update set
      status = excluded.status,
      next_action_date = excluded.next_action_date,
      memo = excluded.memo,
      department_id = excluded.department_id,
      user_id = excluded.user_id,
      updated_by = excluded.updated_by,
      updated_at = greatest(public.clinic_asset_actions.updated_at, excluded.updated_at);

    delete from public.clinic_asset_actions caa
    using tmp_polluted_customer_code_pairs p
    where caa.customer_code = p.polluted_code;
  end if;
end $$;

delete from public.customers c
using tmp_polluted_customer_code_pairs p
where c.code = p.polluted_code;

commit;
