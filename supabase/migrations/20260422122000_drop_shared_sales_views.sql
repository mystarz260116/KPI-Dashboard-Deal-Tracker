begin;

drop function if exists public.sum_sales_import_rows_amount(date, date, text[]);

drop view if exists public.sales_import_rows;
drop view if exists public.external_staffs;

commit;
