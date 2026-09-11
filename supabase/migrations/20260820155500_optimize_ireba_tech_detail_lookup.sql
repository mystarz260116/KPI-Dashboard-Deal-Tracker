create index if not exists ireba_delivery_details_tech_internal_code_idx
  on public.ireba_delivery_details (
    department_id,
    "内部コード"
  )
  include ("行No", "金額", "補綴物コード", "補綴物名")
  where btrim(coalesce("明細区分", '')) = '1技工';

create index if not exists ireba_order_details_tech_internal_code_idx
  on public.ireba_order_details (
    department_id,
    "内部コード"
  )
  include ("行No", "金額", "補綴物コード", "補綴物名")
  where btrim(coalesce("明細区分", '')) = '1技工';

select pg_notify('pgrst', 'reload schema');
