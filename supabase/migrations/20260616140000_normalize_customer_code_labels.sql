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
        nullif(btrim(split_part(split_part("得意先コード", '：', 1), ':', 1)), '') as code,
        coalesce(
          nullif(btrim("得意先名"), ''),
          nullif(btrim(split_part("得意先コード", '：', 2)), ''),
          nullif(btrim(split_part("得意先コード", ':', 2)), ''),
          nullif(btrim(split_part(split_part("得意先コード", '：', 1), ':', 1)), '')
        ) as name
      from public.sales_import_raw_rows
      where department_id = p_department_id
        and import_batch_id = p_import_batch_id
        and nullif(btrim("得意先コード"), '') is not null
    ) source
    where code is not null
    order by code, name nulls last
  ),
  upserted as (
    insert into public.customers (code, name)
    select code, name
    from raw_customers
    on conflict (code) do update set
      name = coalesce(nullif(excluded.name, excluded.code), public.customers.name, excluded.name)
    returning code
  )
  select coalesce(array_agg(code), '{}'::text[]), count(*)::integer
  into v_customer_codes, v_customers_upserted
  from upserted;

  with normalized as (
    select
      id as source_raw_id,
      p_department_id as department_id,
      coalesce(nullif(data_kind, ''), 'delivery') as data_kind,
      case
        when coalesce(nullif(data_kind, ''), 'delivery') = 'order'
          then coalesce(public.normalize_sales_import_date("納品日"), public.normalize_sales_import_date("受注日"))
        else public.normalize_sales_import_date("納品日")
      end as delivery_date,
      public.normalize_sales_import_date("受注日") as order_date,
      nullif(btrim(split_part(split_part("得意先コード", '：', 1), ':', 1)), '') as customer_code,
      coalesce(
        nullif(btrim("得意先名"), ''),
        nullif(btrim(split_part("得意先コード", '：', 2)), ''),
        nullif(btrim(split_part("得意先コード", ':', 2)), ''),
        nullif(btrim(split_part(split_part("得意先コード", '：', 1), ':', 1)), '')
      ) as customer_name,
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
      and (
        data_kind = 'delivery'
        or order_date is not null
      )
  ),
  upserted as (
    insert into public.sales_import_rows (
      source_raw_id,
      department_id,
      data_kind,
      delivery_date,
      order_date,
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
      data_kind,
      delivery_date,
      order_date,
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
      data_kind = excluded.data_kind,
      delivery_date = excluded.delivery_date,
      order_date = excluded.order_date,
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

with code_pairs as (
  select
    code as polluted_code,
    nullif(btrim(split_part(split_part(code, '：', 1), ':', 1)), '') as normalized_code,
    nullif(btrim(coalesce(nullif(split_part(code, '：', 2), ''), nullif(split_part(code, ':', 2), ''))), '') as normalized_name
  from public.customers
  where code like '%：%' or code like '%:%'
),
valid_pairs as (
  select cp.*
  from code_pairs cp
  join public.customers c on c.code = cp.normalized_code
  where cp.normalized_code is not null
    and cp.normalized_code <> cp.polluted_code
)
update public.sales_import_rows sir
set
  customer_code = vp.normalized_code,
  customer_name = coalesce(nullif(vp.normalized_name, ''), sir.customer_name, vp.normalized_code)
from valid_pairs vp
where sir.customer_code = vp.polluted_code;

with code_pairs as (
  select
    code as polluted_code,
    nullif(btrim(split_part(split_part(code, '：', 1), ':', 1)), '') as normalized_code
  from public.customers
  where code like '%：%' or code like '%:%'
),
valid_pairs as (
  select cp.*
  from code_pairs cp
  join public.customers c on c.code = cp.normalized_code
  where cp.normalized_code is not null
    and cp.normalized_code <> cp.polluted_code
)
update public.deals d
set customer_code = vp.normalized_code
from valid_pairs vp
where d.customer_code = vp.polluted_code;

with code_pairs as (
  select
    code as polluted_code,
    nullif(btrim(split_part(split_part(code, '：', 1), ':', 1)), '') as normalized_code,
    nullif(btrim(coalesce(nullif(split_part(code, '：', 2), ''), nullif(split_part(code, ':', 2), ''))), '') as normalized_name
  from public.customers
  where code like '%：%' or code like '%:%'
),
valid_pairs as (
  select cp.*
  from code_pairs cp
  join public.customers c on c.code = cp.normalized_code
  where cp.normalized_code is not null
    and cp.normalized_code <> cp.polluted_code
)
update public.detected_new_orders dno
set
  customer_code = vp.normalized_code,
  customer_name = coalesce(nullif(vp.normalized_name, ''), dno.customer_name, vp.normalized_code),
  updated_at = now()
from valid_pairs vp
where dno.customer_code = vp.polluted_code
  and not exists (
    select 1
    from public.detected_new_orders existing
    where existing.source = dno.source
      and existing.data_kind = dno.data_kind
      and existing.detected_month = dno.detected_month
      and existing.customer_code = vp.normalized_code
      and existing.id <> dno.id
  );

with code_pairs as (
  select
    code as polluted_code,
    nullif(btrim(split_part(split_part(code, '：', 1), ':', 1)), '') as normalized_code
  from public.customers
  where code like '%：%' or code like '%:%'
),
valid_pairs as (
  select cp.*
  from code_pairs cp
  join public.customers c on c.code = cp.normalized_code
  where cp.normalized_code is not null
    and cp.normalized_code <> cp.polluted_code
),
inserted_maps as (
  insert into public.customer_external_staff_maps (
    department_id,
    customer_code,
    external_staff_code
  )
  select distinct
    cesm.department_id,
    vp.normalized_code,
    cesm.external_staff_code
  from public.customer_external_staff_maps cesm
  join valid_pairs vp on vp.polluted_code = cesm.customer_code
  on conflict (department_id, customer_code, external_staff_code) do nothing
  returning id
)
delete from public.customer_external_staff_maps cesm
using valid_pairs vp
where cesm.customer_code = vp.polluted_code;

with code_pairs as (
  select
    code as polluted_code,
    nullif(btrim(split_part(split_part(code, '：', 1), ':', 1)), '') as normalized_code
  from public.customers
  where code like '%：%' or code like '%:%'
),
valid_pairs as (
  select cp.*
  from code_pairs cp
  join public.customers c on c.code = cp.normalized_code
  where cp.normalized_code is not null
    and cp.normalized_code <> cp.polluted_code
)
delete from public.customers c
using valid_pairs vp
where c.code = vp.polluted_code;
