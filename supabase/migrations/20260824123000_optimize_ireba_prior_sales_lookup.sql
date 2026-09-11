create index if not exists ireba_delivery_headers_normalized_customer_date_idx
  on public.ireba_delivery_headers (
    (nullif(btrim(split_part(split_part(coalesce("得意先コード"::text, ''), '：', 1), ':', 1)), '')),
    "納品日",
    department_id
  )
  include ("内部コード", "担当者コード");

create index if not exists ireba_order_headers_normalized_customer_date_idx
  on public.ireba_order_headers (
    (nullif(btrim(split_part(split_part(coalesce("得意先コード"::text, ''), '：', 1), ':', 1)), '')),
    "受注日",
    department_id
  )
  include ("内部コード", "担当者コード");

create or replace function public.sales_prior_customer_codes(
  p_start_date date,
  p_end_date date,
  p_department_ids bigint[],
  p_external_staff_codes text[],
  p_customer_codes text[],
  p_data_kind text
)
returns table (
  customer_code text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(nullif(p_data_kind, ''), 'delivery') = 'order' then
    return query
      select distinct
        nullif(
          btrim(split_part(split_part(coalesce(h."得意先コード"::text, ''), '：', 1), ':', 1)),
          ''
        ) as customer_code
      from public.ireba_order_headers h
      where h."受注日" >= p_start_date
        and h."受注日" < p_end_date
        and (
          p_department_ids is null
          or h.department_id = any(p_department_ids)
        )
        and (
          p_external_staff_codes is null
          or nullif(
            btrim(split_part(split_part(coalesce(h."担当者コード"::text, ''), '：', 1), ':', 1)),
            ''
          ) = any(p_external_staff_codes)
        )
        and nullif(
          btrim(split_part(split_part(coalesce(h."得意先コード"::text, ''), '：', 1), ':', 1)),
          ''
        ) = any(p_customer_codes)
        and exists (
          select 1
          from public.ireba_order_details d
          where d.department_id = h.department_id
            and d."内部コード" = h."内部コード"
            and btrim(coalesce(d."明細区分", '')) = '1技工'
        );

    return;
  end if;

  return query
    select distinct
      nullif(
        btrim(split_part(split_part(coalesce(h."得意先コード"::text, ''), '：', 1), ':', 1)),
        ''
      ) as customer_code
    from public.ireba_delivery_headers h
    where h."納品日" >= p_start_date
      and h."納品日" < p_end_date
      and (
        p_department_ids is null
        or h.department_id = any(p_department_ids)
      )
      and (
        p_external_staff_codes is null
        or nullif(
          btrim(split_part(split_part(coalesce(h."担当者コード"::text, ''), '：', 1), ':', 1)),
          ''
        ) = any(p_external_staff_codes)
      )
      and nullif(
        btrim(split_part(split_part(coalesce(h."得意先コード"::text, ''), '：', 1), ':', 1)),
        ''
      ) = any(p_customer_codes)
      and exists (
        select 1
        from public.ireba_delivery_details d
        where d.department_id = h.department_id
          and d."内部コード" = h."内部コード"
          and btrim(coalesce(d."明細区分", '')) = '1技工'
      );
end;
$$;

comment on function public.sales_prior_customer_codes(date, date, bigint[], text[], text[], text) is
  'Returns customers with prior iReba technical sales using indexed header lookups and detail existence checks.';

grant execute on function public.sales_prior_customer_codes(date, date, bigint[], text[], text[], text)
  to service_role;

select pg_notify('pgrst', 'reload schema');
