-- Secure gateway session store for the custom app_users account system.
create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash text unique not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists app_sessions_token_hash_idx on public.app_sessions(token_hash);
create index if not exists app_sessions_expires_at_idx on public.app_sessions(expires_at);
alter table public.app_sessions enable row level security;

-- The Edge Function uses the service role only; no public policies are created.
