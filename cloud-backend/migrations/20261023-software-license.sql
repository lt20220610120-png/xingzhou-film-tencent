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
 user_id uuid references app_users(id), created_at timestamptz not null default now()
);
create table if not exists software_license_cards (
 id uuid primary key default gen_random_uuid(), digest text unique not null, hint text not null,
 note text not null default '', order_id uuid references software_license_orders(id), month_number int,
 disabled boolean not null default false, redeemed_by uuid references app_users(id), redeemed_at timestamptz,
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
alter table software_license_cards drop constraint if exists software_license_cards_order_id_month_number_key;
alter table software_licenses add column if not exists previous_device_key text;
-- Previously bound devices retain read-only task settlement after a machine change.
create table if not exists software_license_devices (
 user_id uuid not null references app_users(id) on delete cascade,
 device_key text not null, bound_at timestamptz not null default now(),
 primary key(user_id,device_key)
);
insert into software_license_devices(user_id,device_key)
select user_id,device_key from software_licenses where device_key is not null on conflict do nothing;
insert into software_license_devices(user_id,device_key)
select user_id,previous_device_key from software_licenses where previous_device_key is not null on conflict do nothing;
