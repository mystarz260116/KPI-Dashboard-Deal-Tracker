begin;

create table if not exists public.ireba_order_headers (
  internal_code bigint primary key,
  order_number text,
  order_date date not null,
  customer_code text not null,
  customer_name text,
  delivery_date date,
  set_date date,
  set_time time,
  delivery_type text,
  staff_code text,
  patient_name text,
  gender text,
  age text,
  color text,
  work_instruction_1 text,
  work_instruction_2 text,
  deposit_item_1 text,
  deposit_item_2 text,
  deposit_item_3 text,
  deposit_item_4 text,
  deposit_item_5 text,
  deposit_item_6 text,
  deposit_item_7 text,
  deposit_item_8 text,
  deposit_item_9 text,
  deposit_item_10 text,
  deposit_item_name text,
  memo text,
  prosthesis_department_code text,
  issued_flag text,
  articulator text,
  print_flag text,
  customer_input_code text,
  deposit_material_processing_code text,
  raw_payload jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ireba_order_details (
  internal_code bigint not null references public.ireba_order_headers(internal_code) on delete cascade,
  line_no integer not null,
  detail_type text,
  prosthesis_code text,
  prosthesis_name text,
  quantity numeric,
  unit text,
  patient_name text,
  tooth_upper_right text,
  tooth_upper_left text,
  tooth_lower_left text,
  tooth_lower_right text,
  technician_code text,
  user_input_item_code text,
  unit_price numeric,
  amount numeric,
  raw_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (internal_code, line_no)
);

create table if not exists public.ireba_delivery_headers (
  internal_code bigint primary key,
  delivery_date date not null,
  customer_code text not null,
  customer_name text,
  staff_code text,
  transaction_type text,
  closing_date date,
  slip_number text,
  estimate_number text,
  summary text,
  tax_transfer text,
  technique_total numeric,
  material_total numeric,
  external_tax_total numeric,
  print_flag text,
  insurance_technique_breakdown numeric,
  private_technique_breakdown numeric,
  insurance_material_breakdown numeric,
  private_material_breakdown numeric,
  customer_input_code text,
  customer_deposit_material_processing_code text,
  raw_payload jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ireba_delivery_details (
  internal_code bigint not null references public.ireba_delivery_headers(internal_code) on delete cascade,
  line_no integer not null,
  order_number text,
  tooth_upper_right text,
  tooth_upper_left text,
  tooth_lower_left text,
  tooth_lower_right text,
  prosthesis_code text,
  prosthesis_name text,
  unit text,
  detail_type text,
  quantity numeric,
  unit_price numeric,
  amount numeric,
  remaining_deposit numeric,
  patient_name text,
  technician_code text,
  user_input_item_code text,
  lab_record_id text,
  order_internal_code bigint,
  self_pay_insurance_flag text,
  raw_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (internal_code, line_no)
);

create index if not exists ireba_order_details_internal_code_idx
  on public.ireba_order_details (internal_code);

create index if not exists ireba_delivery_details_internal_code_idx
  on public.ireba_delivery_details (internal_code);

alter table public.ireba_order_headers enable row level security;
alter table public.ireba_order_details enable row level security;
alter table public.ireba_delivery_headers enable row level security;
alter table public.ireba_delivery_details enable row level security;

comment on table public.ireba_order_headers is 'いればくん外部連携: 受注ID';
comment on table public.ireba_order_details is 'いればくん外部連携: 受注明細';
comment on table public.ireba_delivery_headers is 'いればくん外部連携: 納品ID';
comment on table public.ireba_delivery_details is 'いればくん外部連携: 納品明細';

comment on column public.ireba_order_headers.internal_code is '内部コード';
comment on column public.ireba_order_details.internal_code is '内部コード';
comment on column public.ireba_order_details.line_no is '行No';
comment on column public.ireba_delivery_headers.internal_code is '内部コード';
comment on column public.ireba_delivery_details.internal_code is '内部コード';
comment on column public.ireba_delivery_details.line_no is '行No';

commit;
