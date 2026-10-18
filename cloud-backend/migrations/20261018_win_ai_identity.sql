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
