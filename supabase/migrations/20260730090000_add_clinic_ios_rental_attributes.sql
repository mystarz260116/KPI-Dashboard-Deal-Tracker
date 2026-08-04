create table if not exists public.clinic_attributes (
  clinic_kind text not null check (clinic_kind in ('customer', 'prospect')),
  clinic_id text not null,
  ios_rental_enabled boolean not null default false,
  ios_rental_start_date date,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_kind, clinic_id),
  check (not ios_rental_enabled or ios_rental_start_date is not null)
);

alter table public.clinic_attributes enable row level security;
