-- The product forecast UI originally labelled department 1 as Tokyo and 2 as Osaka.
-- Canonical department mapping is Osaka=1 and Tokyo=2. Preserve the location the
-- user selected by swapping previously saved forecast inputs and their audit data.
begin;

alter table public.product_category_forecast_inputs
  disable trigger product_category_forecast_input_audit;

-- Temporarily move the unique-key category component out of the way so rows for
-- the same scenario/category/year can safely exchange department ids.
update public.product_category_forecast_inputs
set category_name = '__department_swap_' || department_id || '__' || category_name;

update public.product_category_forecast_inputs
set department_id = case department_id when 1 then 2 when 2 then 1 end;

update public.product_category_forecast_inputs
set category_name = regexp_replace(category_name, '^__department_swap_[12]__', '');

alter table public.product_category_forecast_inputs
  enable trigger product_category_forecast_input_audit;

update public.product_category_forecast_input_history
set
  old_value = case
    when old_value ? 'department_id' then jsonb_set(
      old_value,
      '{department_id}',
      to_jsonb(case (old_value->>'department_id')::integer when 1 then 2 when 2 then 1 end)
    )
    else old_value
  end,
  new_value = case
    when new_value ? 'department_id' then jsonb_set(
      new_value,
      '{department_id}',
      to_jsonb(case (new_value->>'department_id')::integer when 1 then 2 when 2 then 1 end)
    )
    else new_value
  end;

commit;
