-- 行舟影视 项目协作 云端表结构（在 Supabase SQL Editor 中执行一次）
-- 全部表启用 RLS 且不建策略：只有 secret key（Electron 主进程）能读写。

alter table app_users add column if not exists is_producer boolean not null default false;

create table if not exists collab_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null,
  owner_name text default '',
  style text default '',
  genre text default '',
  script text default '',
  analysis_output text default '',
  episodes jsonb default '[]'::jsonb,
  deleted_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table collab_projects add column if not exists deleted_at timestamptz;
alter table collab_projects add column if not exists purge_after timestamptz;

create table if not exists collab_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references collab_projects(id) on delete cascade,
  user_id uuid not null,
  username text not null,
  display_name text default '',
  role text not null check (role in ('producer','artist','collaborator','artist_collaborator')),
  created_at timestamptz default now(),
  unique(project_id, user_id)
);
do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.collab_members'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%role%';
  if constraint_name is not null then
    execute format('alter table public.collab_members drop constraint %I', constraint_name);
  end if;
  alter table public.collab_members add constraint collab_members_role_check
    check (role in ('producer','artist','collaborator','artist_collaborator'));
end $$;

create table if not exists collab_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references collab_projects(id) on delete cascade,
  category text not null check (category in ('character','scene','prop')),
  name text not null,
  description text default '',
  first_episode int default 1,
  episodes int[] default '{}',
  image_url text default '',
  updated_by text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(project_id, name)
);

create table if not exists collab_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references collab_projects(id) on delete cascade,
  episode int not null,
  title text default '',
  assignee_id uuid,
  assignee_name text default '',
  status text default '进行中',
  assigned_at timestamptz default now(),
  done_at timestamptz
);

create table if not exists collab_media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references collab_projects(id) on delete cascade,
  asset_id uuid references collab_assets(id) on delete cascade,
  episode int default 0,
  scene text default '',
  kind text default 'video',
  url text default '',
  object_path text default '',
  filename text default '',
  mime text default '',
  note text default '',
  user_id uuid,
  username text default '',
  created_at timestamptz default now()
);
alter table collab_media add column if not exists asset_id uuid references collab_assets(id) on delete cascade;
alter table collab_media add column if not exists object_path text default '';
alter table collab_media add column if not exists filename text default '';
alter table collab_media add column if not exists mime text default '';

create table if not exists collab_messages (
  id bigint generated always as identity primary key,
  project_id uuid not null references collab_projects(id) on delete cascade,
  user_id uuid,
  username text default '',
  content text default '',
  image_url text default '',
  created_at timestamptz default now()
);

create table if not exists collab_activity (
  id bigint generated always as identity primary key,
  project_id uuid not null references collab_projects(id) on delete cascade,
  user_id uuid,
  username text default '',
  role text default '',
  action text default '',
  detail text default '',
  created_at timestamptz default now()
);

alter table collab_projects enable row level security;
alter table collab_members enable row level security;
alter table collab_assets enable row level security;
alter table collab_tasks enable row level security;
alter table collab_media enable row level security;
alter table collab_messages enable row level security;
alter table collab_activity enable row level security;

-- 协作素材桶（公开读取，写入只走 secret key）
insert into storage.buckets (id, name, public) values ('collab', 'collab', true)
on conflict (id) do update set public = true;

-- 每天执行一次（Supabase Dashboard -> Database -> Extensions 开启 pg_cron 后创建）：
-- select cron.schedule('purge-expired-collab-projects', '0 3 * * *', $$
--   delete from public.collab_projects where purge_after is not null and purge_after <= now();
-- $$);
