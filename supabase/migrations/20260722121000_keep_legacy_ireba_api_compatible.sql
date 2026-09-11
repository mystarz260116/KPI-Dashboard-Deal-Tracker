begin;

-- Temporary bridge for the currently deployed single-location Edge Function.
-- Drop these constraints immediately after the three-location function and
-- secrets have been deployed and verified.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ireba_order_headers_legacy_internal_code_key'
      and conrelid = 'public.ireba_order_headers'::regclass
  ) then
    alter table public.ireba_order_headers
      add constraint ireba_order_headers_legacy_internal_code_key
      unique ("内部コード");
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ireba_delivery_headers_legacy_internal_code_key'
      and conrelid = 'public.ireba_delivery_headers'::regclass
  ) then
    alter table public.ireba_delivery_headers
      add constraint ireba_delivery_headers_legacy_internal_code_key
      unique ("内部コード");
  end if;
end
$$;

commit;
