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
  updated_at timestamptz not null default now(),
  avatar_data text not null default '', bio text not null default '', profile_tags text[] not null default '{}'
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
  director_project_id text default '', analysis_progress jsonb not null default '{}', image_composition text not null default 'portrait-four' check(image_composition in ('portrait-four','portrait-five')),
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
  no_reference_image boolean not null default false,
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
create index if not exists collab_media_id_text_idx on collab_media((id::text));
create index if not exists app_sessions_expiry_idx on app_sessions(expires_at);
create index if not exists email_codes_expiry_idx on email_codes(expires_at);

create table if not exists collab_asset_image_cleanup (
  project_id uuid not null,
  candidate text not null check (length(candidate) between 1 and 2048),
  next_attempt_at timestamptz not null default (now() + interval '20 minutes'),
  attempts integer not null default 0,
  primary key (project_id, candidate)
);
create index if not exists collab_asset_image_cleanup_due
  on collab_asset_image_cleanup(next_attempt_at);

CREATE TABLE IF NOT EXISTS director_live_documents (
 project_id uuid PRIMARY KEY REFERENCES collab_projects(id) ON DELETE CASCADE,
 state bytea NOT NULL, revision bigint NOT NULL DEFAULT 1,
 checkpoint_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS director_live_updates (
 project_id uuid NOT NULL REFERENCES collab_projects(id) ON DELETE CASCADE,
 update_id uuid NOT NULL, author_id text NOT NULL, author_name text NOT NULL,
 delta bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,update_id)
);
CREATE INDEX IF NOT EXISTS director_live_updates_expiry_idx ON director_live_updates(created_at) WHERE octet_length(delta)>0;

create table if not exists director_project_versions (
 id uuid primary key default gen_random_uuid(),
 sequence bigint generated always as identity unique,
 project_id uuid not null references collab_projects(id) on delete cascade,
 author_id text not null, author_name text not null default '',
 submission_id text not null,
 status text not null check(status in ('baseline','accepted','conflict','restore')),
 document jsonb not null, base_document jsonb, published_document jsonb,
 source_version_id uuid,
 created_at timestamptz not null default now(),
 unique(project_id,author_id,submission_id)
);
create index if not exists director_versions_project_sequence on director_project_versions(project_id,sequence desc);

create table if not exists win_ai_auth_grants (
 token_hash text primary key check(length(token_hash)=64),
 kind text not null check(kind in ('entry','identity','code','access')),
 user_id uuid not null references app_users(id) on delete cascade,
 session_id uuid not null references app_sessions(id) on delete cascade,
 challenge text not null default '', expires_at timestamptz not null
);
create index if not exists win_ai_auth_grants_expiry on win_ai_auth_grants(expires_at);
create table if not exists win_ai_session_links (
 native_sid text primary key,
 user_id uuid not null references app_users(id) on delete cascade,
 session_id uuid not null references app_sessions(id) on delete cascade,
 created_at timestamptz not null default now()
);
-- Keep a tombstone after source account deletion or OAuth unlinking.
create table if not exists win_ai_user_links (
 native_user_id integer primary key,
 source_user_id uuid not null
);

-- Additive schema; exemptions are seeded by a separately checked deployment.
create table if not exists software_license_exemptions (
 user_id uuid primary key references app_users(id) on delete cascade,
 reason text not null, created_at timestamptz not null default now()
);
create table if not exists software_licenses (
 user_id uuid primary key references app_users(id) on delete cascade,
 device_key text unique, previous_device_key text, expires_at timestamptz not null,
 revoked boolean not null default false, updated_at timestamptz not null default now()
);
create table if not exists software_license_orders (
 id uuid primary key default gen_random_uuid(), note text not null,
 user_id uuid references app_users(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists software_license_cards (
 id uuid primary key default gen_random_uuid(), digest text unique not null, hint text not null,
 note text not null default '', order_id uuid references software_license_orders(id), month_number int,
 disabled boolean not null default false, redeemed_by uuid references app_users(id) on delete set null, redeemed_at timestamptz,
 created_at timestamptz not null default now(),
 check ((order_id is null and month_number is null) or (order_id is not null and month_number between 1 and 12))
);
create table if not exists software_license_pending (
 token_hash text primary key, card_id uuid not null references software_license_cards(id),
 device_key text not null, expires_at timestamptz not null
);
create table if not exists software_license_challenges (
 nonce text primary key, device_key text not null, expires_at timestamptz not null
);
create table if not exists software_license_audit (
 id bigint generated always as identity primary key, actor_id uuid,
 action text not null, target text not null, reason text not null default '',
 created_at timestamptz not null default now()
);
create index if not exists license_challenge_expiry on software_license_challenges(expires_at);
create index if not exists license_pending_expiry on software_license_pending(expires_at);
create unique index if not exists software_license_cards_active_month_uq on software_license_cards(order_id,month_number) where order_id is not null and disabled=false;
-- Previously bound devices retain read-only task settlement after a machine change.
create table if not exists software_license_devices (
 user_id uuid not null references app_users(id) on delete cascade,
 device_key text not null, bound_at timestamptz not null default now(),
 primary key(user_id,device_key)
);

create or replace function collab_source_markers(genre text) returns text[]
language sql immutable parallel safe
as $$
  select array(select match[1] from regexp_matches(genre, '\[COLLAB_SOURCE:([^]]+)\]', 'g') as matches(match))
$$;

create index if not exists app_sessions_user_idx on app_sessions(user_id);
create index if not exists collab_members_user_project_idx on collab_members(user_id,project_id);
create index if not exists collab_projects_owner_updated_idx on collab_projects(owner_id,updated_at desc);
create index if not exists collab_projects_purge_after_idx on collab_projects(purge_after) where purge_after is not null;
create index if not exists collab_projects_director_source_idx on collab_projects(director_project_id);
create index if not exists collab_projects_director_alias_idx on collab_projects(analysis_output) where genre like '%[DIRECTOR_PROJECT]%' and length(analysis_output)<=500;
create index if not exists collab_projects_id_text_idx on collab_projects((id::text));
create index if not exists collab_projects_source_marker_idx on collab_projects using gin(collab_source_markers(genre));
create index if not exists collab_assets_project_created_idx on collab_assets(project_id,created_at);
create index if not exists collab_tasks_project_episode_idx on collab_tasks(project_id,episode,assigned_at);
create index if not exists collab_messages_project_created_idx on collab_messages(project_id,created_at);
create index if not exists collab_activity_project_created_idx on collab_activity(project_id,created_at desc);
create index if not exists collab_media_project_created_idx on collab_media(project_id,created_at desc);
create index if not exists collab_media_project_asset_idx on collab_media(project_id,asset_id,created_at desc,id desc) where kind='asset-image';
create index if not exists collab_media_asset_idx on collab_media(asset_id) where asset_id is not null;
create index if not exists collab_media_object_path_idx on collab_media(object_path);
create index if not exists software_license_cards_redeemer_idx on software_license_cards(redeemed_by);
create index if not exists software_license_orders_user_idx on software_license_orders(user_id);
create index if not exists win_ai_auth_grants_session_idx on win_ai_auth_grants(session_id);
create index if not exists win_ai_session_links_session_idx on win_ai_session_links(session_id);
