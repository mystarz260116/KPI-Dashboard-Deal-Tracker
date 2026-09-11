create materialized view if not exists public.product_category_fiscal_clinics as
select distinct
  coalesce(nullif(btrim(pd.name), ''), '未分類') as category_name,
  extract(year from (h."納品日"::date - interval '3 months'))::integer as fiscal_year,
  nullif(btrim(h."得意先コード"::text), '') as clinic_key
from public.ireba_delivery_headers h
join public.ireba_delivery_details d
  on d.department_id = h.department_id
 and d."内部コード" = h."内部コード"
left join public.product_category_masters pcm
  on pcm.department_id = h.department_id
 and pcm.normalized_product_code = nullif(btrim(d."補綴物コード"::text), '')
left join public.product_departments pd
  on pd.id = pcm.product_department_id
 and pd.department_id = h.department_id
where h.department_id in (1, 2)
  and h."納品日" is not null
  and nullif(btrim(h."得意先コード"::text), '') is not null
  and btrim(coalesce(d."明細区分", '')) = '1技工';

create unique index if not exists product_category_fiscal_clinics_unique_idx
  on public.product_category_fiscal_clinics (category_name, fiscal_year, clinic_key);

revoke all on table public.product_category_fiscal_clinics from public, anon, authenticated;
grant select on table public.product_category_fiscal_clinics to service_role;

create or replace function public.product_category_fiscal_clinic_keys(
  p_as_of_date date default current_date
)
returns table (category_name text, fiscal_year integer, clinic_key text)
language sql
security definer
set search_path = public
as $$
  select clinics.category_name, clinics.fiscal_year, clinics.clinic_key
  from public.product_category_fiscal_clinics clinics
  where clinics.fiscal_year between
    extract(year from (p_as_of_date - interval '3 months'))::integer - 2
    and extract(year from (p_as_of_date - interval '3 months'))::integer;
$$;

revoke all on function public.product_category_fiscal_clinic_keys(date) from public, anon, authenticated;
grant execute on function public.product_category_fiscal_clinic_keys(date) to service_role;

select pg_notify('pgrst', 'reload schema');
