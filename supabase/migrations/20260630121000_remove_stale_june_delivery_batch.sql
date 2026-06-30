begin;

delete from public.sales_import_rows
where department_id = 1
  and data_kind = 'delivery'
  and import_batch_id = 'f1b0054c-6337-4d0a-89b3-6ec5b7b788c3'
  and delivery_date >= date '2026-06-01'
  and delivery_date < date '2026-07-01';

delete from public.sales_import_raw_rows
where department_id = 1
  and data_kind = 'delivery'
  and import_batch_id = 'f1b0054c-6337-4d0a-89b3-6ec5b7b788c3'
  and "納品日" ~ '^2026/06/';

commit;
