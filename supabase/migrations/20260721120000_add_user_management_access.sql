begin;

alter table public.profiles
  add column if not exists can_manage_users boolean not null default false;

update public.profiles
set can_manage_users = true
where role = 'admin';

comment on column public.profiles.can_manage_users is
  'ユーザーマスタでアカウントの追加・停止・再開・削除を行える権限';

commit;
