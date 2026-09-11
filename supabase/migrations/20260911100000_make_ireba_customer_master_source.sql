begin;

alter table public.customers
  add column if not exists ireba_customer_code text,
  add column if not exists master_source text not null default 'legacy_csv',
  add column if not exists last_ireba_order_date date,
  add column if not exists last_ireba_delivery_date date,
  add column if not exists ireba_synced_at timestamptz;

create unique index if not exists customers_ireba_customer_code_uidx
  on public.customers (ireba_customer_code)
  where ireba_customer_code is not null;

create index if not exists ireba_order_headers_customer_code_idx
  on public.ireba_order_headers (department_id, "得意先コード");

create index if not exists ireba_delivery_headers_customer_code_idx
  on public.ireba_delivery_headers (department_id, "得意先コード");

-- Existing short customer codes are linked only when the derived iReba code
-- actually exists. This avoids inventing links for exceptional code schemes.
update public.customers c
set
  ireba_customer_code = '1' || lpad(c.code, 6, '0'),
  master_source = 'ireba',
  ireba_synced_at = now()
where c.ireba_customer_code is null
  and c.code ~ '^[0-9]{1,6}$'
  and exists (
    select 1
    from public.ireba_order_headers h
    where h."得意先コード"::text = '1' || lpad(c.code, 6, '0')
    union all
    select 1
    from public.ireba_delivery_headers h
    where h."得意先コード"::text = '1' || lpad(c.code, 6, '0')
  );

create or replace function public.sync_ireba_customer_master(
  p_department_id bigint,
  p_ireba_customer_code text,
  p_customer_name text,
  p_external_staff_code text default null,
  p_order_date date default null,
  p_delivery_date date default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ireba_code text := nullif(btrim(p_ireba_customer_code), '');
  v_name text := nullif(btrim(p_customer_name), '');
  v_staff_code text := nullif(
    btrim(split_part(split_part(coalesce(p_external_staff_code, ''), '：', 1), ':', 1)),
    ''
  );
  v_derived_code text;
  v_customer_code text;
  v_name_match_count integer := 0;
begin
  if v_ireba_code is null then
    return null;
  end if;

  if v_ireba_code ~ '^1[0-9]{6}$' then
    v_derived_code := nullif(ltrim(substr(v_ireba_code, 2), '0'), '');
    if v_derived_code is null then v_derived_code := '0'; end if;
  else
    v_derived_code := v_ireba_code;
  end if;

  select c.code into v_customer_code
  from public.customers c
  where c.ireba_customer_code = v_ireba_code
  limit 1;

  if v_customer_code is null then
    select c.code into v_customer_code
    from public.customers c
    where c.code = v_derived_code
    limit 1;
  end if;

  -- Reuse the existing master only when the name has exactly one match.
  if v_customer_code is null and v_name is not null then
    select count(*), min(c.code)
    into v_name_match_count, v_customer_code
    from public.customers c
    where btrim(c.name) = v_name;

    if v_name_match_count <> 1 then
      v_customer_code := null;
    end if;
  end if;

  if v_customer_code is null then
    v_customer_code := v_derived_code;
    if exists (select 1 from public.customers c where c.code = v_customer_code) then
      v_customer_code := v_ireba_code;
    end if;

    insert into public.customers (
      code,
      name,
      ireba_customer_code,
      master_source,
      last_ireba_order_date,
      last_ireba_delivery_date,
      ireba_synced_at
    ) values (
      v_customer_code,
      coalesce(v_name, v_customer_code),
      v_ireba_code,
      'ireba',
      p_order_date,
      p_delivery_date,
      now()
    );
  else
    update public.customers c
    set
      name = coalesce(v_name, c.name),
      ireba_customer_code = coalesce(c.ireba_customer_code, v_ireba_code),
      master_source = 'ireba',
      last_ireba_order_date = case
        when p_order_date is null then c.last_ireba_order_date
        else greatest(coalesce(c.last_ireba_order_date, p_order_date), p_order_date)
      end,
      last_ireba_delivery_date = case
        when p_delivery_date is null then c.last_ireba_delivery_date
        else greatest(coalesce(c.last_ireba_delivery_date, p_delivery_date), p_delivery_date)
      end,
      ireba_synced_at = now()
    where c.code = v_customer_code;
  end if;

  if v_staff_code is not null and p_department_id is not null then
    insert into public.customer_external_staff_maps (
      department_id,
      customer_code,
      external_staff_code
    ) values (
      p_department_id,
      v_customer_code,
      v_staff_code
    )
    on conflict (department_id, customer_code, external_staff_code) do nothing;
  end if;

  return v_customer_code;
end;
$$;

grant execute on function public.sync_ireba_customer_master(bigint, text, text, text, date, date)
  to service_role;

comment on function public.sync_ireba_customer_master(bigint, text, text, text, date, date) is
  'Upserts the official customer master and staff mapping from an iReba order or delivery header.';

commit;
