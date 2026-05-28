begin;

create table if not exists public.product_category_masters (
  id uuid primary key default gen_random_uuid(),
  normalized_product_code text not null,
  normalized_product_name text not null,
  proposal_category text,
  major_category text,
  is_kpi_target boolean not null default false,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_product_category_masters_code
  on public.product_category_masters (normalized_product_code);

create index if not exists idx_product_category_masters_proposal_category
  on public.product_category_masters (proposal_category);

alter table public.sales_import_rows
  add column if not exists normalized_product_code text,
  add column if not exists normalized_product_name text;

create index if not exists idx_sales_import_rows_normalized_product_code
  on public.sales_import_rows (normalized_product_code);

update public.sales_import_rows sir
set
  normalized_product_code = nullif(btrim(raw."補綴物コード"), ''),
  normalized_product_name = coalesce(
    nullif(btrim(raw."補綴物名"), ''),
    nullif(btrim(raw."明細区分"), '')
  )
from public.sales_import_raw_rows raw
where raw.id = sir.source_raw_id
  and raw.department_id = sir.department_id
  and (
    sir.normalized_product_code is distinct from nullif(btrim(raw."補綴物コード"), '')
    or sir.normalized_product_name is distinct from coalesce(
      nullif(btrim(raw."補綴物名"), ''),
      nullif(btrim(raw."明細区分"), '')
    )
  );

create or replace function public.sync_sales_import_batch(
  p_department_id bigint,
  p_import_batch_id text
)
returns table (
  customer_codes text[],
  customers_upserted integer,
  sales_rows_upserted integer,
  customer_external_staff_maps_upserted integer
)
language plpgsql
security definer
set search_path = public
set statement_timeout = '0'
as $$
declare
  v_customer_codes text[];
  v_customers_upserted integer := 0;
  v_sales_rows_upserted integer := 0;
  v_customer_external_staff_maps_upserted integer := 0;
begin
  with raw_customers as (
    select distinct on (code)
      code,
      name
    from (
      select
        nullif(btrim("得意先コード"), '') as code,
        coalesce(nullif(btrim("得意先名"), ''), nullif(btrim("得意先コード"), '')) as name
      from public.sales_import_raw_rows
      where department_id = p_department_id
        and import_batch_id = p_import_batch_id
        and nullif(btrim("得意先コード"), '') is not null
    ) source
    order by code, name nulls last
  ),
  upserted as (
    insert into public.customers (code, name)
    select code, name
    from raw_customers
    on conflict (code) do update set
      name = excluded.name
    returning code
  )
  select coalesce(array_agg(code), '{}'::text[]), count(*)::integer
  into v_customer_codes, v_customers_upserted
  from upserted;

  with normalized as (
    select
      id as source_raw_id,
      p_department_id as department_id,
      public.normalize_sales_import_date("納品日") as delivery_date,
      nullif(btrim("得意先コード"), '') as customer_code,
      coalesce(nullif(btrim("得意先名"), ''), nullif(btrim("得意先コード"), '')) as customer_name,
      nullif(btrim(split_part(coalesce("担当者コード", ''), '：', 1)), '') as external_staff_code,
      public.parse_sales_import_amount("金額") as amount,
      import_batch_id,
      imported_at,
      btrim(coalesce("明細区分", '')) as detail_category,
      nullif(btrim("補綴物コード"), '') as normalized_product_code,
      coalesce(
        nullif(btrim("補綴物名"), ''),
        nullif(btrim("明細区分"), '')
      ) as normalized_product_name
    from public.sales_import_raw_rows
    where department_id = p_department_id
      and import_batch_id = p_import_batch_id
  ),
  valid_rows as (
    select *
    from normalized
    where delivery_date is not null
      and customer_code is not null
      and detail_category = '1技工'
  ),
  upserted as (
    insert into public.sales_import_rows (
      source_raw_id,
      department_id,
      delivery_date,
      customer_code,
      customer_name,
      external_staff_code,
      amount,
      import_batch_id,
      imported_at,
      normalized_product_code,
      normalized_product_name
    )
    select
      source_raw_id,
      department_id,
      delivery_date,
      customer_code,
      customer_name,
      external_staff_code,
      amount,
      import_batch_id,
      imported_at,
      normalized_product_code,
      normalized_product_name
    from valid_rows
    on conflict (department_id, source_raw_id) do update set
      delivery_date = excluded.delivery_date,
      customer_code = excluded.customer_code,
      customer_name = excluded.customer_name,
      external_staff_code = excluded.external_staff_code,
      amount = excluded.amount,
      import_batch_id = excluded.import_batch_id,
      imported_at = excluded.imported_at,
      normalized_product_code = excluded.normalized_product_code,
      normalized_product_name = excluded.normalized_product_name
    returning source_raw_id
  )
  select count(*)::integer
  into v_sales_rows_upserted
  from upserted;

  with map_rows as (
    select distinct
      department_id,
      customer_code,
      external_staff_code
    from public.sales_import_rows
    where department_id = p_department_id
      and import_batch_id = p_import_batch_id
      and customer_code is not null
      and external_staff_code is not null
  ),
  upserted as (
    insert into public.customer_external_staff_maps (
      department_id,
      customer_code,
      external_staff_code
    )
    select department_id, customer_code, external_staff_code
    from map_rows
    on conflict (department_id, customer_code, external_staff_code) do nothing
    returning id
  )
  select count(*)::integer
  into v_customer_external_staff_maps_upserted
  from upserted;

  customer_codes := coalesce(v_customer_codes, '{}'::text[]);
  customers_upserted := coalesce(v_customers_upserted, 0);
  sales_rows_upserted := coalesce(v_sales_rows_upserted, 0);
  customer_external_staff_maps_upserted := coalesce(v_customer_external_staff_maps_upserted, 0);
  return next;
end;
$$;

commit;
