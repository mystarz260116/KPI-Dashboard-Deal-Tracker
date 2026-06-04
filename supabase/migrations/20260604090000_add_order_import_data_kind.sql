begin;

alter table public.sales_import_raw_rows
  add column if not exists data_kind text not null default 'delivery',
  add column if not exists "受注番号" text,
  add column if not exists "受注日" text,
  add column if not exists "セット日" text,
  add column if not exists "セット時間" text,
  add column if not exists "納品タイプ" text,
  add column if not exists "患者名" text,
  add column if not exists "性別" text,
  add column if not exists "年齢" text,
  add column if not exists "色" text,
  add column if not exists "作業指示1" text,
  add column if not exists "作業指示2" text,
  add column if not exists "預り品1" text,
  add column if not exists "預り品2" text,
  add column if not exists "預り品3" text,
  add column if not exists "預り品4" text,
  add column if not exists "預り品5" text,
  add column if not exists "預り品6" text,
  add column if not exists "預り品7" text,
  add column if not exists "預り品8" text,
  add column if not exists "預り品9" text,
  add column if not exists "預り品10" text,
  add column if not exists "預り品名" text,
  add column if not exists "メモ" text,
  add column if not exists "補綴物部門コード" text,
  add column if not exists "発行済" text,
  add column if not exists "咬合器" text,
  add column if not exists "印刷F" text,
  add column if not exists "得意先入力コード" text,
  add column if not exists "預り材料処理コード" text,
  add column if not exists "行No" text,
  add column if not exists "数量" text,
  add column if not exists "単位" text,
  add column if not exists "歯式右上" text,
  add column if not exists "歯式左上" text,
  add column if not exists "歯式左下" text,
  add column if not exists "歯式右下" text,
  add column if not exists "技工士コード" text,
  add column if not exists "ユーザー入力項目コード" text,
  add column if not exists "単価" text;

alter table public.sales_import_raw_rows
  drop constraint if exists sales_import_raw_rows_data_kind_check;

alter table public.sales_import_raw_rows
  add constraint sales_import_raw_rows_data_kind_check
  check (data_kind in ('delivery', 'order'));

create index if not exists idx_sales_import_raw_rows_department_kind_batch
  on public.sales_import_raw_rows (department_id, data_kind, import_batch_id);

alter table public.sales_import_rows
  add column if not exists data_kind text not null default 'delivery',
  add column if not exists order_date date;

alter table public.sales_import_rows
  drop constraint if exists sales_import_rows_data_kind_check;

alter table public.sales_import_rows
  add constraint sales_import_rows_data_kind_check
  check (data_kind in ('delivery', 'order'));

create index if not exists idx_sales_import_rows_department_kind_delivery_date
  on public.sales_import_rows (department_id, data_kind, delivery_date);

create index if not exists idx_sales_import_rows_department_kind_order_date
  on public.sales_import_rows (department_id, data_kind, order_date);

alter table public.sales_import_month_closures
  add column if not exists data_kind text not null default 'delivery';

alter table public.sales_import_month_closures
  drop constraint if exists sales_import_month_closures_data_kind_check;

alter table public.sales_import_month_closures
  add constraint sales_import_month_closures_data_kind_check
  check (data_kind in ('delivery', 'order'));

alter table public.sales_import_month_closures
  drop constraint if exists sales_import_month_closures_department_id_target_year_month_key;

create unique index if not exists idx_sales_import_month_closures_department_kind_month
  on public.sales_import_month_closures (department_id, data_kind, target_year_month);

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

create or replace function public.sum_sales_import_rows_amount(
  p_start_date date,
  p_end_date date,
  p_customer_codes text[],
  p_department_id bigint,
  p_data_kind text
)
returns table (sales_total bigint)
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(coalesce(sir.amount, 0)), 0)::bigint as sales_total
  from public.sales_import_rows sir
  where coalesce(sir.data_kind, 'delivery') = coalesce(nullif(p_data_kind, ''), 'delivery')
    and (
      case
        when coalesce(nullif(p_data_kind, ''), 'delivery') = 'order' then sir.order_date
        else sir.delivery_date
      end
    ) >= p_start_date
    and (
      case
        when coalesce(nullif(p_data_kind, ''), 'delivery') = 'order' then sir.order_date
        else sir.delivery_date
      end
    ) < p_end_date
    and (p_department_id is null or sir.department_id = p_department_id)
    and (p_customer_codes is null or sir.customer_code = any(p_customer_codes));
$$;

create or replace function public.sum_sales_import_rows_amount(
  p_start_date date,
  p_end_date date,
  p_customer_codes text[] default null,
  p_department_id bigint default null
)
returns table (sales_total bigint)
language sql
security definer
set search_path = public
as $$
  select sales_total
  from public.sum_sales_import_rows_amount(
    p_start_date,
    p_end_date,
    p_customer_codes,
    p_department_id,
    'delivery'
  );
$$;

grant execute on function public.sum_sales_import_rows_amount(date, date, text[], bigint, text)
  to anon, authenticated, service_role;

grant execute on function public.sum_sales_import_rows_amount(date, date, text[], bigint)
  to anon, authenticated, service_role;

commit;
