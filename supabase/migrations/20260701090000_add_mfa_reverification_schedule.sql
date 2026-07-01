begin;

alter table public.profiles
  add column if not exists mfa_verified_at timestamptz,
  add column if not exists mfa_reverify_after timestamptz;

update public.profiles
set
  mfa_verified_at = coalesce(mfa_verified_at, now()),
  mfa_reverify_after = coalesce(
    mfa_reverify_after,
    now() + ((3 + random() * 4) * interval '1 day')
  );

commit;
