create index if not exists ireba_delivery_headers_dashboard_scope_idx
  on public.ireba_delivery_headers (
    department_id,
    "担当者コード",
    "納品日",
    "得意先コード"
  )
  include ("内部コード", "得意先名");

create index if not exists ireba_order_headers_dashboard_scope_idx
  on public.ireba_order_headers (
    department_id,
    "担当者コード",
    "受注日",
    "得意先コード"
  )
  include ("内部コード", "得意先名");

create or replace view public.ireba_sales_rows as
select
  concat_ws(
    ':',
    'ireba_delivery',
    h.department_id::text,
    h."内部コード"::text,
    d."行No"::text
  ) as source_raw_id,
  h.department_id::bigint as department_id,
  'delivery'::text as data_kind,
  h."得意先コード"::text as customer_code,
  h."得意先名"::text as customer_name,
  h."担当者コード"::text as external_staff_code,
  d."金額"::numeric as amount,
  h."納品日"::date as delivery_date,
  null::date as order_date,
  d."補綴物コード"::text as normalized_product_code,
  d."補綴物名"::text as normalized_product_name
from public.ireba_delivery_headers h
join public.ireba_delivery_details d
  on d.department_id = h.department_id
 and d."内部コード" = h."内部コード"
where h.department_id in (1, 2)
  and h."納品日" is not null

union all

select
  concat_ws(
    ':',
    'ireba_order',
    h.department_id::text,
    h."内部コード"::text,
    d."行No"::text
  ) as source_raw_id,
  h.department_id::bigint as department_id,
  'order'::text as data_kind,
  h."得意先コード"::text as customer_code,
  h."得意先名"::text as customer_name,
  h."担当者コード"::text as external_staff_code,
  d."金額"::numeric as amount,
  null::date as delivery_date,
  h."受注日"::date as order_date,
  d."補綴物コード"::text as normalized_product_code,
  d."補綴物名"::text as normalized_product_name
from public.ireba_order_headers h
join public.ireba_order_details d
  on d.department_id = h.department_id
 and d."内部コード" = h."内部コード"
where h.department_id in (1, 2)
  and h."受注日" is not null;

comment on view public.ireba_sales_rows is
  'Dashboard-compatible sales rows sourced from iReba delivery/order tables. Fukuoka department_id=6 is intentionally excluded.';

grant select on public.ireba_sales_rows to anon, authenticated, service_role;

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
  from public.ireba_sales_rows sir
  where sir.data_kind = coalesce(nullif(p_data_kind, ''), 'delivery')
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

create or replace function public.dashboard_sales_import_aggregates(
  p_start_date date,
  p_end_date date,
  p_department_ids bigint[],
  p_external_staff_codes text[],
  p_data_kind text
)
returns table (
  department_id bigint,
  external_staff_code text,
  normalized_product_code text,
  sales_total bigint
)
language sql
security definer
set search_path = public
as $$
  select
    sir.department_id::bigint as department_id,
    sir.external_staff_code,
    coalesce(nullif(sir.normalized_product_code, ''), '') as normalized_product_code,
    coalesce(sum(coalesce(sir.amount, 0)), 0)::bigint as sales_total
  from public.ireba_sales_rows sir
  where sir.data_kind = coalesce(nullif(p_data_kind, ''), 'delivery')
    and (
      case
        when coalesce(nullif(p_data_kind, ''), 'delivery') = 'order'
          then sir.order_date
        else sir.delivery_date
      end
    ) >= p_start_date
    and (
      case
        when coalesce(nullif(p_data_kind, ''), 'delivery') = 'order'
          then sir.order_date
        else sir.delivery_date
      end
    ) < p_end_date
    and (
      p_department_ids is null
      or sir.department_id = any(p_department_ids)
    )
    and (
      p_external_staff_codes is null
      or sir.external_staff_code = any(p_external_staff_codes)
    )
  group by
    sir.department_id,
    sir.external_staff_code,
    coalesce(nullif(sir.normalized_product_code, ''), '');
$$;

create or replace function public.dashboard_sales_import_aggregates_json(
  p_start_date date,
  p_end_date date,
  p_department_ids bigint[],
  p_external_staff_codes text[],
  p_data_kind text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(rows)), '[]'::jsonb)
  from (
    select
      sir.department_id::bigint as department_id,
      sir.external_staff_code,
      coalesce(nullif(sir.normalized_product_code, ''), '') as normalized_product_code,
      max(nullif(sir.normalized_product_name, '')) as normalized_product_name,
      coalesce(sum(coalesce(sir.amount, 0)), 0)::bigint as sales_total
    from public.ireba_sales_rows sir
    where sir.data_kind = coalesce(nullif(p_data_kind, ''), 'delivery')
      and (
        case
          when coalesce(nullif(p_data_kind, ''), 'delivery') = 'order'
            then sir.order_date
          else sir.delivery_date
        end
      ) >= p_start_date
      and (
        case
          when coalesce(nullif(p_data_kind, ''), 'delivery') = 'order'
            then sir.order_date
          else sir.delivery_date
        end
      ) < p_end_date
      and (p_department_ids is null or sir.department_id = any(p_department_ids))
      and (p_external_staff_codes is null or sir.external_staff_code = any(p_external_staff_codes))
    group by
      sir.department_id,
      sir.external_staff_code,
      coalesce(nullif(sir.normalized_product_code, ''), '')
  ) rows;
$$;

create or replace function public.clinic_asset_sales_aggregates(
  p_start_date date,
  p_end_date date,
  p_department_ids bigint[],
  p_external_staff_codes text[],
  p_data_kind text
)
returns table (
  department_id bigint,
  customer_code text,
  customer_name text,
  external_staff_code text,
  sales_month text,
  sales_total bigint
)
language sql
security definer
set search_path = public
as $$
  select
    sir.department_id::bigint as department_id,
    sir.customer_code,
    max(sir.customer_name) as customer_name,
    sir.external_staff_code,
    to_char(
      date_trunc(
        'month',
        case
          when coalesce(nullif(p_data_kind, ''), 'delivery') = 'order'
            then sir.order_date
          else sir.delivery_date
        end
      ),
      'YYYY-MM'
    ) as sales_month,
    coalesce(sum(coalesce(sir.amount, 0)), 0)::bigint as sales_total
  from public.ireba_sales_rows sir
  where sir.data_kind = coalesce(nullif(p_data_kind, ''), 'delivery')
    and (
      case
        when coalesce(nullif(p_data_kind, ''), 'delivery') = 'order'
          then sir.order_date
        else sir.delivery_date
      end
    ) >= p_start_date
    and (
      case
        when coalesce(nullif(p_data_kind, ''), 'delivery') = 'order'
          then sir.order_date
        else sir.delivery_date
      end
    ) < p_end_date
    and (p_department_ids is null or sir.department_id = any(p_department_ids))
    and (p_external_staff_codes is null or sir.external_staff_code = any(p_external_staff_codes))
    and sir.customer_code is not null
  group by
    sir.department_id,
    sir.customer_code,
    sir.external_staff_code,
    date_trunc(
      'month',
      case
        when coalesce(nullif(p_data_kind, ''), 'delivery') = 'order'
          then sir.order_date
        else sir.delivery_date
      end
    );
$$;

create or replace function public.clinic_asset_sales_aggregates_json(
  p_start_date date,
  p_end_date date,
  p_department_ids bigint[],
  p_external_staff_codes text[],
  p_data_kind text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(rows)), '[]'::jsonb)
  from (
    select *
    from public.clinic_asset_sales_aggregates(
      p_start_date,
      p_end_date,
      p_department_ids,
      p_external_staff_codes,
      p_data_kind
    )
  ) rows;
$$;

create or replace function public.sales_prior_customer_codes(
  p_start_date date,
  p_end_date date,
  p_department_ids bigint[],
  p_external_staff_codes text[],
  p_customer_codes text[],
  p_data_kind text
)
returns table (
  customer_code text
)
language sql
security definer
set search_path = public
as $$
  select distinct sir.customer_code
  from public.ireba_sales_rows sir
  where sir.data_kind = coalesce(nullif(p_data_kind, ''), 'delivery')
    and sir.customer_code = any(p_customer_codes)
    and (p_department_ids is null or sir.department_id = any(p_department_ids))
    and (p_external_staff_codes is null or sir.external_staff_code = any(p_external_staff_codes))
    and (
      case
        when coalesce(nullif(p_data_kind, ''), 'delivery') = 'order'
          then sir.order_date
        else sir.delivery_date
      end
    ) >= p_start_date
    and (
      case
        when coalesce(nullif(p_data_kind, ''), 'delivery') = 'order'
          then sir.order_date
        else sir.delivery_date
      end
    ) < p_end_date;
$$;

grant execute on function public.sum_sales_import_rows_amount(date, date, text[], bigint, text)
  to anon, authenticated, service_role;

grant execute on function public.sum_sales_import_rows_amount(date, date, text[], bigint)
  to anon, authenticated, service_role;

grant execute on function public.dashboard_sales_import_aggregates(date, date, bigint[], text[], text)
  to anon, authenticated, service_role;

grant execute on function public.dashboard_sales_import_aggregates_json(date, date, bigint[], text[], text)
  to anon, authenticated, service_role;

grant execute on function public.clinic_asset_sales_aggregates(date, date, bigint[], text[], text)
  to anon, authenticated, service_role;

grant execute on function public.clinic_asset_sales_aggregates_json(date, date, bigint[], text[], text)
  to anon, authenticated, service_role;

grant execute on function public.sales_prior_customer_codes(date, date, bigint[], text[], text[], text)
  to anon, authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
