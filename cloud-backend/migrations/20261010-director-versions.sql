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
