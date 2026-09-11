alter function public.product_category_fiscal_actuals(date)
  set statement_timeout = '30s';

select pg_notify('pgrst', 'reload schema');
