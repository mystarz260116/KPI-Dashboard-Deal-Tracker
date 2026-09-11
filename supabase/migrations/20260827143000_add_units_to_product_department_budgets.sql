begin;

alter table public.product_department_budgets
  add column if not exists target_units numeric not null default 0;

comment on column public.product_department_budgets.target_units is
  '対象月における商品部門別の数量予算';

-- The first Tokyo/Osaka budget import stored quantity in notes so the
-- budget data could be loaded before this migration reached production.
update public.product_department_budgets
set target_units = coalesce(
  case
    when nullif(btrim(notes), '') is not null
      and left(btrim(notes), 1) = '{'
    then (notes::jsonb ->> 'target_units')::numeric
    else null
  end,
  target_units
)
where target_units = 0
  and nullif(btrim(notes), '') is not null
  and left(btrim(notes), 1) = '{'
  and notes::jsonb ? 'target_units';

commit;
