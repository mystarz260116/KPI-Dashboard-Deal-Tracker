begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_role text;
  v_department_id bigint;
begin
  v_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'name', '')), '');
  v_role := nullif(trim(coalesce(new.raw_user_meta_data ->> 'role', '')), '');

  begin
    v_department_id := nullif(trim(coalesce(new.raw_user_meta_data ->> 'department_id', '')), '')::bigint;
  exception
    when others then
      v_department_id := null;
  end;

  insert into public.profiles (
    id,
    name,
    email,
    role,
    department_id,
    can_view_dashboard
  )
  values (
    new.id,
    coalesce(v_name, split_part(coalesce(new.email, ''), '@', 1), '未設定'),
    new.email,
    coalesce(v_role, 'user'),
    v_department_id,
    true
  )
  on conflict (id) do update
  set
    name = excluded.name,
    email = excluded.email,
    role = excluded.role,
    department_id = excluded.department_id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;
