create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  display_name text default '',
  email text unique not null,
  password_hash text not null,
  roles text[] not null default '{}',
  active_role text,
  is_admin boolean not null default false,
  is_producer boolean not null default false,
  banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  digest text unique not null,
  kind text not null check (kind in ('role','full','unlock','admin')),
  role text check (role in ('creator','director') or role is null),
  max_uses int,
  used_count int not null default 0,
  disabled boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists collab_projects (
  id uuid primary key default gen_random_uuid(), name text not null,
  owner_id uuid not null, owner_name text default '', style text default '', genre text default '',
  script text default '', analysis_output text default '', episodes jsonb default '[]'::jsonb,
  deleted_at timestamptz, purge_after timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists collab_members (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references collab_projects(id) on delete cascade,
  user_id uuid not null, username text not null, display_name text default '',
  role text not null check (role in ('producer','artist','collaborator','artist_collaborator')),
  created_at timestamptz default now(), unique(project_id,user_id)
);
create table if not exists collab_assets (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references collab_projects(id) on delete cascade,
  category text not null check (category in ('character','scene','prop')), name text not null,
  description text default '', first_episode int default 1, episodes int[] default '{}', image_url text default '',
  updated_by text default '', created_at timestamptz default now(), updated_at timestamptz default now(), unique(project_id,name)
);
create table if not exists collab_tasks (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references collab_projects(id) on delete cascade,
  episode int not null, title text default '', assignee_id uuid, assignee_name text default '', status text default '进行中',
  assigned_at timestamptz default now(), done_at timestamptz
);
create table if not exists collab_media (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references collab_projects(id) on delete cascade,
  asset_id uuid references collab_assets(id) on delete cascade, episode int default 0, scene text default '', kind text default 'video',
  url text default '', object_path text default '', filename text default '', mime text default '', note text default '',
  user_id uuid, username text default '', created_at timestamptz default now()
);
create table if not exists collab_messages (
  id bigint generated always as identity primary key, project_id uuid not null references collab_projects(id) on delete cascade,
  user_id uuid, username text default '', content text default '', image_url text default '', created_at timestamptz default now()
);
create table if not exists collab_activity (
  id bigint generated always as identity primary key, project_id uuid not null references collab_projects(id) on delete cascade,
  user_id uuid, username text default '', role text default '', action text default '', detail text default '', created_at timestamptz default now()
);
create table if not exists app_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references app_users(id) on delete cascade,
  token_hash text unique not null, expires_at timestamptz not null, created_at timestamptz default now()
);
create index if not exists app_sessions_token_idx on app_sessions(token_hash, expires_at);
create table if not exists email_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists collab_media_project_idx on collab_media(project_id, kind, created_at);
