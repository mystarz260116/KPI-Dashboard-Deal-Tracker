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
    where n.nspname = 'public'
      and c.relname = 'profiles'
      and tg.tgisinternal = false
  loop
    execute format('drop trigger if exists %I on public.profiles', trigger_name);
  end loop;
end
$$;

commit;
