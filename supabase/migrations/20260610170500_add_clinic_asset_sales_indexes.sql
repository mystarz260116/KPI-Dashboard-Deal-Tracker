create index if not exists idx_sales_import_rows_kind_delivery_dept_staff_customer
  on public.sales_import_rows (
    data_kind,
    delivery_date,
    department_id,
    external_staff_code,
    customer_code
  )
  include (amount, customer_name);

create index if not exists idx_sales_import_rows_kind_order_dept_staff_customer
  on public.sales_import_rows (
    data_kind,
    order_date,
    department_id,
    external_staff_code,
    customer_code
  )
  include (amount, customer_name);
