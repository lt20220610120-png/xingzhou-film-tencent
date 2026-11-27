create table if not exists collab_asset_image_cleanup (
  project_id uuid not null,
  candidate text not null check (length(candidate) between 1 and 2048),
  next_attempt_at timestamptz not null default (now() + interval '20 minutes'),
  attempts integer not null default 0,
  primary key (project_id, candidate)
);
create index if not exists collab_asset_image_cleanup_due
  on collab_asset_image_cleanup(next_attempt_at);
