create index if not exists ireba_delivery_headers_latest_date_idx
  on public.ireba_delivery_headers ("納品日" desc)
  where department_id in (1, 2);

create index if not exists ireba_order_headers_latest_date_idx
  on public.ireba_order_headers ("受注日" desc)
  where department_id in (1, 2);

select pg_notify('pgrst', 'reload schema');
