begin;

create or replace function public.sync_external_staff_from_regional_raw(
  p_target_table text,
  p_department_id bigint,
  p_raw_label text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw_label text;
  v_code text;
  v_name text;
begin
  v_raw_label := nullif(btrim(coalesce(p_raw_label, '')), '');

  if v_raw_label is null then
    return;
  end if;

  v_code := nullif(btrim(split_part(v_raw_label, '：', 1)), '');
  v_name := nullif(btrim(split_part(v_raw_label, '：', 2)), '');

  if v_code is null then
    return;
  end if;

  if v_name is null then
    v_name := v_raw_label;
  end if;

  execute format(
    'insert into public.%I (code, raw_label, name, department_id)
     values ($1, $2, $3, $4)
     on conflict (code)
     do update set
       raw_label = excluded.raw_label,
       name = excluded.name,
       department_id = excluded.department_id',
    p_target_table
  )
  using v_code, v_raw_label, v_name, p_department_id;
end;
$$;

create or replace function public.trg_sync_external_staffs_kansai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_external_staff_from_regional_raw(
    'external_staffs_kansai',
    1,
    new."担当者コード"
  );
  return new;
end;
$$;

create or replace function public.trg_sync_external_staffs_tokyo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_external_staff_from_regional_raw(
    'external_staffs_tokyo',
    2,
    new."担当者コード"
  );
  return new;
end;
$$;

drop trigger if exists sync_external_staffs_kansai_from_raw on public.sales_import_raw_rows_kansai;
create trigger sync_external_staffs_kansai_from_raw
after insert or update of "担当者コード"
on public.sales_import_raw_rows_kansai
for each row
execute function public.trg_sync_external_staffs_kansai();

drop trigger if exists sync_external_staffs_tokyo_from_raw on public.sales_import_raw_rows_tokyo;
create trigger sync_external_staffs_tokyo_from_raw
after insert or update of "担当者コード"
on public.sales_import_raw_rows_tokyo
for each row
execute function public.trg_sync_external_staffs_tokyo();

commit;
