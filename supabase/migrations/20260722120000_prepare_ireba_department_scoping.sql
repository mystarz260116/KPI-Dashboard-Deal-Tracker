begin;

do $$
declare
  v_fukuoka_id bigint;
  v_department_sequence text;
begin
  select id into v_fukuoka_id
  from public.departments
  where name = '福岡営業部';

  if v_fukuoka_id is null then
    if exists (select 1 from public.departments where id = 6) then
      raise exception 'Department id 6 is already used';
    end if;

    insert into public.departments (id, name)
    values (6, '福岡営業部');
  elsif v_fukuoka_id <> 6 then
    raise exception 'Expected 福岡営業部 with department id 6, found %', v_fukuoka_id;
  end if;

  v_department_sequence := pg_get_serial_sequence('public.departments', 'id');
  if v_department_sequence is not null then
    perform setval(
      v_department_sequence,
      greatest((select max(id) from public.departments), 1),
      true
    );
  end if;
end
$$;

-- Existing ireba data has been verified as belonging to 大阪営業部 (id = 1).
-- Fail safely if department ids differ in another environment.
do $$
begin
  if not exists (
    select 1
    from public.departments
    where id = 1
      and name = '大阪営業部'
  ) then
    raise exception 'Expected 大阪営業部 with department id 1';
  end if;
end
$$;

alter table public.ireba_order_headers
  add column if not exists department_id bigint
  references public.departments(id);

alter table public.ireba_order_details
  add column if not exists department_id bigint
  references public.departments(id);

alter table public.ireba_delivery_headers
  add column if not exists department_id bigint
  references public.departments(id);

alter table public.ireba_delivery_details
  add column if not exists department_id bigint
  references public.departments(id);

alter table public.ireba_sync_api_logs
  add column if not exists department_id bigint
  references public.departments(id);

update public.ireba_order_headers
set department_id = 1
where department_id is null;

update public.ireba_order_details as detail
set department_id = header.department_id
from public.ireba_order_headers as header
where detail."内部コード" = header."内部コード"
  and detail.department_id is null;

update public.ireba_delivery_headers
set department_id = 1
where department_id is null;

update public.ireba_delivery_details as detail
set department_id = header.department_id
from public.ireba_delivery_headers as header
where detail."内部コード" = header."内部コード"
  and detail.department_id is null;

update public.ireba_sync_api_logs
set department_id = 1
where department_id is null;

alter table public.ireba_order_details
  drop constraint if exists ireba_order_details_internal_code_fkey;

alter table public.ireba_delivery_details
  drop constraint if exists ireba_delivery_details_internal_code_fkey;

alter table public.ireba_order_headers
  drop constraint if exists ireba_order_headers_pkey;

alter table public.ireba_order_details
  drop constraint if exists ireba_order_details_pkey;

alter table public.ireba_delivery_headers
  drop constraint if exists ireba_delivery_headers_pkey;

alter table public.ireba_delivery_details
  drop constraint if exists ireba_delivery_details_pkey;

alter table public.ireba_order_headers
  alter column department_id set default 1,
  alter column department_id set not null,
  add constraint ireba_order_headers_pkey
    primary key (department_id, "内部コード");

alter table public.ireba_order_details
  alter column department_id set default 1,
  alter column department_id set not null,
  add constraint ireba_order_details_pkey
    primary key (department_id, "内部コード", "行No"),
  add constraint ireba_order_details_department_header_fkey
    foreign key (department_id, "内部コード")
    references public.ireba_order_headers (department_id, "内部コード")
    on delete cascade;

alter table public.ireba_delivery_headers
  alter column department_id set default 1,
  alter column department_id set not null,
  add constraint ireba_delivery_headers_pkey
    primary key (department_id, "内部コード");

alter table public.ireba_delivery_details
  alter column department_id set default 1,
  alter column department_id set not null,
  add constraint ireba_delivery_details_pkey
    primary key (department_id, "内部コード", "行No"),
  add constraint ireba_delivery_details_department_header_fkey
    foreign key (department_id, "内部コード")
    references public.ireba_delivery_headers (department_id, "内部コード")
    on delete cascade;

alter table public.ireba_sync_api_logs
  alter column department_id set default 1,
  alter column department_id set not null;

create index if not exists ireba_order_headers_department_internal_code_idx
  on public.ireba_order_headers (department_id, "内部コード");

create index if not exists ireba_order_details_department_internal_code_idx
  on public.ireba_order_details (department_id, "内部コード");

create index if not exists ireba_delivery_headers_department_internal_code_idx
  on public.ireba_delivery_headers (department_id, "内部コード");

create index if not exists ireba_delivery_details_department_internal_code_idx
  on public.ireba_delivery_details (department_id, "内部コード");

create index if not exists ireba_sync_api_logs_department_created_at_idx
  on public.ireba_sync_api_logs (department_id, created_at desc);

comment on column public.ireba_order_headers.department_id is
  'いればくんデータの受信元部署。拠点別APIキーからサーバー側で設定する。';

comment on column public.ireba_order_details.department_id is
  'いればくんデータの受信元部署。親受注と同じ部署を設定する。';

comment on column public.ireba_delivery_headers.department_id is
  'いればくんデータの受信元部署。拠点別APIキーからサーバー側で設定する。';

comment on column public.ireba_delivery_details.department_id is
  'いればくんデータの受信元部署。親納品と同じ部署を設定する。';

comment on column public.ireba_sync_api_logs.department_id is
  'APIキーから特定した、いればくんデータの受信元部署。';

commit;
