alter table public.collab_media add column if not exists asset_id uuid references public.collab_assets(id) on delete cascade;
alter table public.collab_media add column if not exists object_path text default '';
alter table public.collab_media add column if not exists filename text default '';
alter table public.collab_media add column if not exists mime text default '';
create index if not exists collab_media_asset_images_idx on public.collab_media(project_id, asset_id, kind, created_at);
