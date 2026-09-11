create index if not exists ireba_delivery_headers_customer_date_idx
  on public.ireba_delivery_headers (
    "得意先コード",
    "納品日",
    department_id
  )
  include ("内部コード", "得意先名", "担当者コード");

create index if not exists ireba_order_headers_customer_date_idx
  on public.ireba_order_headers (
    "得意先コード",
    "受注日",
    department_id
  )
  include ("内部コード", "得意先名", "担当者コード");

select pg_notify('pgrst', 'reload schema');
