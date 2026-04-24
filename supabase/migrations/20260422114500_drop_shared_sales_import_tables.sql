begin;

drop function if exists public.sum_sales_import_rows_amount(date, date, text[]);

do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'sales_import_rows'
      and c.relkind in ('v', 'm')
  ) then
    execute 'drop view public.sales_import_rows';
  elsif exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'sales_import_rows'
      and c.relkind in ('r', 'p')
  ) then
    execute 'drop table public.sales_import_rows';
  end if;
end
$$;

create view public.sales_import_rows as
select
  delivery_date,
  customer_code,
  customer_name,
  external_staff_code,
  amount
from public.sales_import_rows_kansai
union all
select
  delivery_date,
  customer_code,
  customer_name,
  external_staff_code,
  amount
from public.sales_import_rows_tokyo;

create or replace function public.sum_sales_import_rows_amount(
  p_start_date date,
  p_end_date date,
  p_external_staff_codes text[] default null
)
returns table (sales_total bigint)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(sum(coalesce(sir.amount, 0)), 0)::bigint as sales_total
  from public.sales_import_rows sir
  where sir.delivery_date >= p_start_date
    and sir.delivery_date < p_end_date
    and (
      p_external_staff_codes is null
      or sir.external_staff_code = any(p_external_staff_codes)
    );
$$;

grant execute on function public.sum_sales_import_rows_amount(date, date, text[]) to anon, authenticated, service_role;

create sequence if not exists public.customer_external_staff_maps_kansai_id_seq;
create sequence if not exists public.customer_external_staff_maps_tokyo_id_seq;
create sequence if not exists public.sales_import_raw_rows_kansai_id_seq;
create sequence if not exists public.sales_import_raw_rows_tokyo_id_seq;

select setval(
  'public.customer_external_staff_maps_kansai_id_seq',
  greatest((select coalesce(max(id), 0) from public.customer_external_staff_maps_kansai), 1),
  true
);

select setval(
  'public.customer_external_staff_maps_tokyo_id_seq',
  greatest((select coalesce(max(id), 0) from public.customer_external_staff_maps_tokyo), 1),
  true
);

select setval(
  'public.sales_import_raw_rows_kansai_id_seq',
  greatest((select coalesce(max(id), 0) from public.sales_import_raw_rows_kansai), 1),
  true
);

select setval(
  'public.sales_import_raw_rows_tokyo_id_seq',
  greatest((select coalesce(max(id), 0) from public.sales_import_raw_rows_tokyo), 1),
  true
);

alter table public.customer_external_staff_maps_kansai
  alter column id set default nextval('public.customer_external_staff_maps_kansai_id_seq');

alter table public.customer_external_staff_maps_tokyo
  alter column id set default nextval('public.customer_external_staff_maps_tokyo_id_seq');

alter table public.sales_import_raw_rows_kansai
  alter column id set default nextval('public.sales_import_raw_rows_kansai_id_seq');

alter table public.sales_import_raw_rows_tokyo
  alter column id set default nextval('public.sales_import_raw_rows_tokyo_id_seq');

do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'customer_external_staff_maps'
      and c.relkind in ('r', 'p')
  ) then
    execute 'alter table public.customer_external_staff_maps drop constraint if exists customer_external_staff_maps_external_staff_code_fkey';
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'profile_external_staff_maps'
      and c.relkind in ('r', 'p')
  ) then
    execute 'alter table public.profile_external_staff_maps drop constraint if exists profile_external_staff_maps_external_staff_code_fkey';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'external_staffs'
      and c.relkind in ('v', 'm')
  ) then
    execute 'drop view public.external_staffs';
  elsif exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'external_staffs'
      and c.relkind in ('r', 'p')
  ) then
    execute 'drop table public.external_staffs';
  end if;
end
$$;

create view public.external_staffs as
select code, raw_label, name, created_at, department_id
from public.external_staffs_kansai
union all
select code, raw_label, name, created_at, department_id
from public.external_staffs_tokyo;

do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'customer_external_staff_maps'
      and c.relkind in ('v', 'm')
  ) then
    execute 'drop view public.customer_external_staff_maps';
  elsif exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'customer_external_staff_maps'
      and c.relkind in ('r', 'p')
  ) then
    execute 'drop table public.customer_external_staff_maps';
  end if;
end
$$;

create view public.customer_external_staff_maps as
select id, customer_code, external_staff_code, created_at
from public.customer_external_staff_maps_kansai
union all
select id, customer_code, external_staff_code, created_at
from public.customer_external_staff_maps_tokyo;

do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'sales_import_raw_rows'
      and c.relkind in ('v', 'm')
  ) then
    execute 'drop view public.sales_import_raw_rows';
  elsif exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'sales_import_raw_rows'
      and c.relkind in ('r', 'p')
  ) then
    execute 'drop table public.sales_import_raw_rows';
  end if;
end
$$;

commit;
