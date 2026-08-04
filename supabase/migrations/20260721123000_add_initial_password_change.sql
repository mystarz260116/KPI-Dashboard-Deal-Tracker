begin;

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  '管理者発行の初期パスワードから、利用者本人のパスワードへの変更が必要か';

commit;
