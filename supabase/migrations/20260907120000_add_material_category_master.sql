begin;

create table if not exists public.material_category_masters (
  id uuid primary key default gen_random_uuid(),
  department_id integer not null references public.departments(id) on delete cascade,
  normalized_product_code text not null,
  normalized_product_name text not null,
  material_category text not null default '未分類',
  notes text not null default '',
  is_active boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, normalized_product_code, normalized_product_name)
);

create materialized view if not exists public.material_product_sales_summary as
select
  h.department_id,
  nullif(btrim(d."補綴物コード"::text), '') as normalized_product_code,
  coalesce(nullif(btrim(d."補綴物名"::text), ''), '名称なし') as normalized_product_name,
  min(h."納品日"::date) as first_sales_date,
  max(h."納品日"::date) as last_sales_date,
  count(*)::bigint as row_count,
  coalesce(sum(d."数量"), 0)::numeric as units_total,
  coalesce(sum(d."金額"), 0)::numeric as sales_total,
  coalesce(sum(d."金額") filter (where d."金額" < 0), 0)::numeric as return_sales_total
from public.ireba_delivery_headers h
join public.ireba_delivery_details d
  on d.department_id = h.department_id and d."内部コード" = h."内部コード"
where h.department_id in (1, 2)
  and h."納品日" is not null
  and btrim(coalesce(d."明細区分", '')) = '5材料'
group by h.department_id, nullif(btrim(d."補綴物コード"::text), ''),
  coalesce(nullif(btrim(d."補綴物名"::text), ''), '名称なし');

create unique index if not exists material_product_sales_summary_key_idx
  on public.material_product_sales_summary
  (department_id, normalized_product_code, normalized_product_name) nulls not distinct;

create or replace function public.refresh_material_product_sales_summary()
returns void language plpgsql security definer set search_path = public set statement_timeout = '0' as $$
begin
  refresh materialized view public.material_product_sales_summary;
end;
$$;

alter table public.material_category_masters enable row level security;
revoke all on public.material_category_masters from public, anon, authenticated;
revoke all on table public.material_product_sales_summary from public, anon, authenticated;
revoke all on function public.refresh_material_product_sales_summary() from public, anon, authenticated;
grant all on public.material_category_masters to service_role;
grant select on table public.material_product_sales_summary to service_role;
grant execute on function public.refresh_material_product_sales_summary() to service_role;

commit;
