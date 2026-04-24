begin;

alter table public.sales_import_raw_rows
  add column if not exists department_id bigint references public.departments(id);

update public.sales_import_raw_rows
set department_id = case region
  when 'kansai' then 1
  when 'tokyo' then 2
  else department_id
end
where department_id is null;

alter table public.sales_import_raw_rows
  alter column department_id set not null;

alter table public.sales_import_raw_rows
  alter column region drop not null;

create index if not exists idx_sales_import_raw_rows_department_id
  on public.sales_import_raw_rows (department_id);

create index if not exists idx_sales_import_raw_rows_department_batch
  on public.sales_import_raw_rows (department_id, import_batch_id);

alter table public.sales_import_rows
  add column if not exists department_id bigint references public.departments(id);

update public.sales_import_rows
set department_id = case region
  when 'kansai' then 1
  when 'tokyo' then 2
  else department_id
end
where department_id is null;

alter table public.sales_import_rows
  alter column department_id set not null;

alter table public.sales_import_rows
  drop constraint if exists sales_import_rows_pkey;

alter table public.sales_import_rows
  alter column region drop not null;

alter table public.sales_import_rows
  add constraint sales_import_rows_pkey primary key (department_id, source_raw_id);

create index if not exists idx_sales_import_rows_department_delivery_date
  on public.sales_import_rows (department_id, delivery_date);

create index if not exists idx_sales_import_rows_department_customer_code
  on public.sales_import_rows (department_id, customer_code);

create index if not exists idx_sales_import_rows_department_external_staff_code
  on public.sales_import_rows (department_id, external_staff_code);

alter table public.external_staffs
  add column if not exists department_id bigint references public.departments(id);

update public.external_staffs
set department_id = case region
  when 'kansai' then 1
  when 'tokyo' then 2
  else department_id
end
where department_id is null;

alter table public.external_staffs
  alter column department_id set not null;

alter table public.external_staffs
  drop constraint if exists external_staffs_pkey;

alter table public.external_staffs
  alter column region drop not null;

alter table public.external_staffs
  add constraint external_staffs_pkey primary key (department_id, code);

create index if not exists idx_external_staffs_department_code
  on public.external_staffs (department_id, code);

alter table public.customer_external_staff_maps
  add column if not exists department_id bigint references public.departments(id);

update public.customer_external_staff_maps
set department_id = case region
  when 'kansai' then 1
  when 'tokyo' then 2
  else department_id
end
where department_id is null;

alter table public.customer_external_staff_maps
  alter column department_id set not null;

alter table public.customer_external_staff_maps
  alter column region drop not null;

create unique index if not exists idx_customer_external_staff_maps_department_customer_staff
  on public.customer_external_staff_maps (department_id, customer_code, external_staff_code);

create index if not exists idx_customer_external_staff_maps_department_staff
  on public.customer_external_staff_maps (department_id, external_staff_code);

alter table public.profile_external_staff_maps
  add column if not exists department_id bigint references public.departments(id);

update public.profile_external_staff_maps
set department_id = case region
  when 'kansai' then 1
  when 'tokyo' then 2
  else department_id
end
where department_id is null;

alter table public.profile_external_staff_maps
  alter column department_id set not null;

alter table public.profile_external_staff_maps
  alter column region drop not null;

create unique index if not exists idx_profile_external_staff_maps_department_profile_staff
  on public.profile_external_staff_maps (department_id, profile_id, external_staff_code);

create index if not exists idx_profile_external_staff_maps_department_profile_id
  on public.profile_external_staff_maps (department_id, profile_id);

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

  insert into public.external_staffs (department_id, code, raw_label, name)
  values (new.department_id, v_code, v_raw_label, v_name)
  on conflict (department_id, code)
  do update set
    raw_label = excluded.raw_label,
    name = excluded.name;

  return new;
end;
$$;

drop trigger if exists sync_external_staffs_from_raw on public.sales_import_raw_rows;
create trigger sync_external_staffs_from_raw
after insert or update of "担当者コード", department_id
on public.sales_import_raw_rows
for each row
execute function public.sync_external_staff_from_raw();

create or replace function public.sum_sales_import_rows_amount(
  p_start_date date,
  p_end_date date,
  p_customer_codes text[] default null,
  p_department_id bigint default null
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
    and (p_department_id is null or sir.department_id = p_department_id)
    and (p_customer_codes is null or sir.customer_code = any(p_customer_codes));
$$;

grant execute on function public.sum_sales_import_rows_amount(date, date, text[], bigint)
  to anon, authenticated, service_role;

commit;
