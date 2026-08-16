-- Login and collaboration queries include this field.
-- Existing projects created before producer support need it added explicitly.
alter table public.app_users
  add column if not exists is_producer boolean not null default false;
