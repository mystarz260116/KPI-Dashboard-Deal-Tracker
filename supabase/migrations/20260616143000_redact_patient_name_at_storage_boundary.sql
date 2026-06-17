-- Patient names must not be retained in raw import / external sync storage.

update public.sales_import_raw_rows
set "患者名" = null
where "患者名" is not null;

create or replace function public.redact_sales_import_patient_name()
returns trigger
language plpgsql
as $$
begin
  new."患者名" := null;
  return new;
end;
$$;

drop trigger if exists sales_import_raw_rows_redact_patient_name
  on public.sales_import_raw_rows;

create trigger sales_import_raw_rows_redact_patient_name
before insert or update of "患者名"
on public.sales_import_raw_rows
for each row
execute function public.redact_sales_import_patient_name();

update public.ireba_order_headers
set
  "患者名" = null,
  raw_payload = coalesce(raw_payload, '{}'::jsonb) - '患者名'
where "患者名" is not null
  or coalesce(raw_payload, '{}'::jsonb) ? '患者名';

update public.ireba_order_details
set
  "患者名" = null,
  raw_payload = coalesce(raw_payload, '{}'::jsonb) - '患者名'
where "患者名" is not null
  or coalesce(raw_payload, '{}'::jsonb) ? '患者名';

update public.ireba_delivery_details
set
  "患者名" = null,
  raw_payload = coalesce(raw_payload, '{}'::jsonb) - '患者名'
where "患者名" is not null
  or coalesce(raw_payload, '{}'::jsonb) ? '患者名';

update public.ireba_delivery_headers
set raw_payload = coalesce(raw_payload, '{}'::jsonb) - '患者名'
where coalesce(raw_payload, '{}'::jsonb) ? '患者名';

create or replace function public.redact_ireba_patient_name_and_payload()
returns trigger
language plpgsql
as $$
begin
  new."患者名" := null;
  new.raw_payload := coalesce(new.raw_payload, '{}'::jsonb) - '患者名';
  return new;
end;
$$;

create or replace function public.redact_ireba_raw_payload_patient_name()
returns trigger
language plpgsql
as $$
begin
  new.raw_payload := coalesce(new.raw_payload, '{}'::jsonb) - '患者名';
  return new;
end;
$$;

drop trigger if exists ireba_order_headers_redact_patient_name
  on public.ireba_order_headers;
drop trigger if exists ireba_order_details_redact_patient_name
  on public.ireba_order_details;
drop trigger if exists ireba_delivery_details_redact_patient_name
  on public.ireba_delivery_details;
drop trigger if exists ireba_delivery_headers_redact_patient_name
  on public.ireba_delivery_headers;

create trigger ireba_order_headers_redact_patient_name
before insert or update of "患者名", raw_payload
on public.ireba_order_headers
for each row
execute function public.redact_ireba_patient_name_and_payload();

create trigger ireba_order_details_redact_patient_name
before insert or update of "患者名", raw_payload
on public.ireba_order_details
for each row
execute function public.redact_ireba_patient_name_and_payload();

create trigger ireba_delivery_details_redact_patient_name
before insert or update of "患者名", raw_payload
on public.ireba_delivery_details
for each row
execute function public.redact_ireba_patient_name_and_payload();

create trigger ireba_delivery_headers_redact_patient_name
before insert or update of raw_payload
on public.ireba_delivery_headers
for each row
execute function public.redact_ireba_raw_payload_patient_name();
