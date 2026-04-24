begin;

create unique index if not exists idx_profile_external_staff_maps_kansai_profile_staff
  on public.profile_external_staff_maps_kansai (profile_id, external_staff_code);

create unique index if not exists idx_profile_external_staff_maps_tokyo_profile_staff
  on public.profile_external_staff_maps_tokyo (profile_id, external_staff_code);

create index if not exists idx_profile_external_staff_maps_kansai_profile_id
  on public.profile_external_staff_maps_kansai (profile_id);

create index if not exists idx_profile_external_staff_maps_tokyo_profile_id
  on public.profile_external_staff_maps_tokyo (profile_id);

commit;
