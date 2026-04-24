begin;

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
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'external_staffs'
      and c.relkind in ('v', 'm')
  ) then
    execute 'drop view public.external_staffs';
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'customer_external_staff_maps'
      and c.relkind in ('v', 'm')
  ) then
    execute 'drop view public.customer_external_staff_maps';
  end if;
end
$$;

create table if not exists public.sales_import_raw_rows
(like public.sales_import_raw_rows_kansai including all);

alter table public.sales_import_raw_rows
  add column if not exists region text;

update public.sales_import_raw_rows
set region = 'kansai'
where region is null;

alter table public.sales_import_raw_rows
  alter column region set not null;

alter table public.sales_import_raw_rows
  drop constraint if exists sales_import_raw_rows_region_check;

alter table public.sales_import_raw_rows
  add constraint sales_import_raw_rows_region_check
  check (region in ('kansai', 'tokyo'));

create sequence if not exists public.sales_import_raw_rows_id_seq;

alter table public.sales_import_raw_rows
  alter column id set default nextval('public.sales_import_raw_rows_id_seq');

alter sequence public.sales_import_raw_rows_id_seq
  owned by public.sales_import_raw_rows.id;

insert into public.sales_import_raw_rows
select *, 'kansai' as region
from public.sales_import_raw_rows_kansai
on conflict (id) do nothing;

insert into public.sales_import_raw_rows
select *, 'tokyo' as region
from public.sales_import_raw_rows_tokyo
on conflict (id) do nothing;

select setval(
  'public.sales_import_raw_rows_id_seq',
  greatest((select coalesce(max(id), 0) from public.sales_import_raw_rows), 1),
  true
);

create table if not exists public.sales_import_rows (
  region text not null,
  source_raw_id bigint not null,
  delivery_date date not null,
  customer_code text not null,
  customer_name text,
  external_staff_code text,
  amount bigint not null default 0,
  import_batch_id text,
  imported_at timestamptz not null default now(),
  primary key (region, source_raw_id),
  constraint sales_import_rows_region_check check (region in ('kansai', 'tokyo'))
);

insert into public.sales_import_rows (
  region,
  source_raw_id,
  delivery_date,
  customer_code,
  customer_name,
  external_staff_code,
  amount,
  import_batch_id,
  imported_at
)
select
  'kansai',
  source_raw_id,
  delivery_date,
  customer_code,
  customer_name,
  external_staff_code,
  amount,
  import_batch_id,
  imported_at
from public.sales_import_rows_kansai
on conflict (region, source_raw_id) do update set
  delivery_date = excluded.delivery_date,
  customer_code = excluded.customer_code,
  customer_name = excluded.customer_name,
  external_staff_code = excluded.external_staff_code,
  amount = excluded.amount,
  import_batch_id = excluded.import_batch_id,
  imported_at = excluded.imported_at;

insert into public.sales_import_rows (
  region,
  source_raw_id,
  delivery_date,
  customer_code,
  customer_name,
  external_staff_code,
  amount,
  import_batch_id,
  imported_at
)
select
  'tokyo',
  source_raw_id,
  delivery_date,
  customer_code,
  customer_name,
  external_staff_code,
  amount,
  import_batch_id,
  imported_at
from public.sales_import_rows_tokyo
on conflict (region, source_raw_id) do update set
  delivery_date = excluded.delivery_date,
  customer_code = excluded.customer_code,
  customer_name = excluded.customer_name,
  external_staff_code = excluded.external_staff_code,
  amount = excluded.amount,
  import_batch_id = excluded.import_batch_id,
  imported_at = excluded.imported_at;

create index if not exists idx_sales_import_rows_region_delivery_date
  on public.sales_import_rows (region, delivery_date);

create index if not exists idx_sales_import_rows_delivery_date
  on public.sales_import_rows (delivery_date);

create index if not exists idx_sales_import_rows_region_customer_code
  on public.sales_import_rows (region, customer_code);

create index if not exists idx_sales_import_rows_region_external_staff_code
  on public.sales_import_rows (region, external_staff_code);

create index if not exists idx_sales_import_rows_import_batch_id
  on public.sales_import_rows (import_batch_id);

create table if not exists public.external_staffs (
  region text not null,
  code text not null,
  raw_label text,
  name text,
  created_at timestamptz not null default now(),
  department_id bigint,
  primary key (region, code),
  constraint external_staffs_region_check check (region in ('kansai', 'tokyo'))
);

insert into public.external_staffs (region, code, raw_label, name, created_at, department_id)
select 'kansai', code, raw_label, name, created_at, department_id
from public.external_staffs_kansai
on conflict (region, code) do update set
  raw_label = excluded.raw_label,
  name = excluded.name,
  department_id = excluded.department_id;

insert into public.external_staffs (region, code, raw_label, name, created_at, department_id)
select 'tokyo', code, raw_label, name, created_at, department_id
from public.external_staffs_tokyo
on conflict (region, code) do update set
  raw_label = excluded.raw_label,
  name = excluded.name,
  department_id = excluded.department_id;

create index if not exists idx_external_staffs_department_id
  on public.external_staffs (department_id);

create table if not exists public.customer_external_staff_maps (
  id bigint generated by default as identity primary key,
  region text not null,
  customer_code text not null,
  external_staff_code text not null,
  created_at timestamptz not null default now(),
  constraint customer_external_staff_maps_region_check check (region in ('kansai', 'tokyo'))
);

alter table public.customer_external_staff_maps
  add column if not exists region text;

update public.customer_external_staff_maps
set region = 'kansai'
where region is null;

alter table public.customer_external_staff_maps
  alter column region set not null;

create unique index if not exists idx_customer_external_staff_maps_region_customer_staff
  on public.customer_external_staff_maps (region, customer_code, external_staff_code);

insert into public.customer_external_staff_maps (region, customer_code, external_staff_code, created_at)
select 'kansai', customer_code, external_staff_code, created_at
from public.customer_external_staff_maps_kansai
on conflict (region, customer_code, external_staff_code) do nothing;

insert into public.customer_external_staff_maps (region, customer_code, external_staff_code, created_at)
select 'tokyo', customer_code, external_staff_code, created_at
from public.customer_external_staff_maps_tokyo
on conflict (region, customer_code, external_staff_code) do nothing;

create index if not exists idx_customer_external_staff_maps_region_staff
  on public.customer_external_staff_maps (region, external_staff_code);

alter table public.profile_external_staff_maps
  add column if not exists region text;

update public.profile_external_staff_maps
set region = 'kansai'
where region is null;

alter table public.profile_external_staff_maps
  alter column region set not null;

alter table public.profile_external_staff_maps
  drop constraint if exists profile_external_staff_maps_region_check;

alter table public.profile_external_staff_maps
  add constraint profile_external_staff_maps_region_check
  check (region in ('kansai', 'tokyo'));

create unique index if not exists idx_profile_external_staff_maps_region_profile_staff
  on public.profile_external_staff_maps (region, profile_id, external_staff_code);

insert into public.profile_external_staff_maps (region, profile_id, external_staff_code, is_primary, created_at)
select 'kansai', profile_id, external_staff_code, is_primary, created_at
from public.profile_external_staff_maps_kansai
on conflict (region, profile_id, external_staff_code) do update set
  is_primary = excluded.is_primary;

insert into public.profile_external_staff_maps (region, profile_id, external_staff_code, is_primary, created_at)
select 'tokyo', profile_id, external_staff_code, is_primary, created_at
from public.profile_external_staff_maps_tokyo
on conflict (region, profile_id, external_staff_code) do update set
  is_primary = excluded.is_primary;

create index if not exists idx_profile_external_staff_maps_region_profile_id
  on public.profile_external_staff_maps (region, profile_id);

alter table public.sales_import_raw_rows enable row level security;
alter table public.sales_import_rows enable row level security;
alter table public.external_staffs enable row level security;
alter table public.customer_external_staff_maps enable row level security;
alter table public.profile_external_staff_maps enable row level security;

create or replace function public.sync_external_staff_from_raw()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw_label text;
  v_code text;
  v_name text;
  v_department_id bigint;
begin
  v_raw_label := nullif(btrim(coalesce(new."担当者コード", '')), '');

  if v_raw_label is null then
    return new;
  end if;

  v_code := nullif(btrim(split_part(v_raw_label, '：', 1)), '');
  v_name := nullif(btrim(split_part(v_raw_label, '：', 2)), '');

  if v_code is null then
    return new;
  end if;

  if v_name is null then
    v_name := v_raw_label;
  end if;

  v_department_id := case new.region
    when 'kansai' then 1
    when 'tokyo' then 2
    else null
  end;

  insert into public.external_staffs (region, code, raw_label, name, department_id)
  values (new.region, v_code, v_raw_label, v_name, v_department_id)
  on conflict (region, code)
  do update set
    raw_label = excluded.raw_label,
    name = excluded.name,
    department_id = excluded.department_id;

  return new;
end;
$$;

drop trigger if exists sync_external_staffs_from_raw on public.sales_import_raw_rows;
create trigger sync_external_staffs_from_raw
after insert or update of "担当者コード", region
on public.sales_import_raw_rows
for each row
execute function public.sync_external_staff_from_raw();

create or replace function public.sum_sales_import_rows_amount(
  p_start_date date,
  p_end_date date,
  p_customer_codes text[] default null,
  p_region text default null
)
returns table (sales_total bigint)
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(coalesce(sir.amount, 0)), 0)::bigint as sales_total
  from public.sales_import_rows sir
  where sir.delivery_date >= p_start_date
    and sir.delivery_date < p_end_date
    and (p_region is null or sir.region = p_region)
    and (p_customer_codes is null or sir.customer_code = any(p_customer_codes));
$$;

grant execute on function public.sum_sales_import_rows_amount(date, date, text[], text)
  to anon, authenticated, service_role;

commit;
