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
  and btrim(coalesce(d."明細区分", '')) = '1技工'

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
  and h."受注日" is not null
  and btrim(coalesce(d."明細区分", '')) = '1技工';

comment on view public.ireba_sales_rows is
  'Dashboard-compatible sales rows sourced from iReba delivery/order tables. Only 明細区分=1技工 rows are included to match legacy CSV sales_import_rows. Fukuoka department_id=6 is intentionally excluded.';

grant select on public.ireba_sales_rows to anon, authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
