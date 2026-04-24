begin;

do $$
declare
  trigger_name text;
begin
  for trigger_name in
    select tg.tgname
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth'
      and c.relname = 'users'
      and tg.tgisinternal = false
  loop
    execute format('drop trigger if exists %I on auth.users', trigger_name);
  end loop;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;
