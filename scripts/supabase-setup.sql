-- 行舟影视 云端账号系统 数据库初始化脚本
-- 在 Supabase Dashboard → SQL Editor 中执行一次即可

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  display_name text,
  email text unique not null,
  password_hash text not null,
  roles text[] not null default '{}',
  active_role text,
  is_admin boolean not null default false,
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

-- 启用行级安全：不建任何策略，意味着只有服务端密钥（secret key）可以读写，
-- 客户端可发布密钥无法直接接触这两张表。
alter table app_users enable row level security;
alter table invites enable row level security;

-- 预置管理员注册码（仅限软件拥有者本人使用）
insert into invites (code, digest, kind, max_uses, note)
values ('XZADMIN-GVLF-CXKZ', '0251a0e2ce841a1fbf349c1a8d2d444811499310b9beb1f01573699ab963aa77', 'admin', 1, '管理员注册码（软件拥有者）')
on conflict (digest) do nothing;
