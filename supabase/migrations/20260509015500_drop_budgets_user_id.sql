begin;

alter table public.budgets
  drop column if exists user_id;

commit;
