alter table public.product_category_forecast_inputs
  add column if not exists baseline_units_growth_percent numeric,
  add column if not exists baseline_unit_price_growth_percent numeric,
  add column if not exists baseline_units numeric,
  add column if not exists baseline_unit_price numeric,
  add column if not exists adjusted_units numeric,
  add column if not exists adjusted_unit_price numeric;

comment on column public.product_category_forecast_inputs.baseline_units_growth_percent is '保存時点の自動予測本数成長率';
comment on column public.product_category_forecast_inputs.baseline_unit_price_growth_percent is '保存時点の自動予測平均単価成長率';
comment on column public.product_category_forecast_inputs.baseline_units is '保存時点の自動予測本数';
comment on column public.product_category_forecast_inputs.baseline_unit_price is '保存時点の自動予測平均単価';
comment on column public.product_category_forecast_inputs.adjusted_units is '手入力反映後の本数';
comment on column public.product_category_forecast_inputs.adjusted_unit_price is '手入力反映後の平均単価';
