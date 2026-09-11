begin;

-- Applied after the three-location Edge Function and secrets were verified.
-- Removing these constraints permits the same internal code to exist
-- independently in multiple locations.
alter table public.ireba_order_headers
  drop constraint if exists ireba_order_headers_legacy_internal_code_key;

alter table public.ireba_delivery_headers
  drop constraint if exists ireba_delivery_headers_legacy_internal_code_key;

commit;
