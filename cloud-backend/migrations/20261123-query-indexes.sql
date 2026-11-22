-- Run with psql ON_ERROR_STOP outside a transaction.
set lock_timeout = '3s';

create or replace function collab_source_markers(genre text) returns text[]
language sql immutable parallel safe
as $$
  select array(select match[1] from regexp_matches(genre, '\[COLLAB_SOURCE:([^]]+)\]', 'g') as matches(match))
$$;

create index concurrently if not exists app_sessions_user_idx on app_sessions(user_id);
create index concurrently if not exists collab_members_user_project_idx on collab_members(user_id,project_id);
create index concurrently if not exists collab_projects_owner_updated_idx on collab_projects(owner_id,updated_at desc);
create index concurrently if not exists collab_projects_purge_after_idx on collab_projects(purge_after) where purge_after is not null;
create index concurrently if not exists collab_projects_director_source_idx on collab_projects(director_project_id);
create index concurrently if not exists collab_projects_director_alias_idx on collab_projects(analysis_output) where genre like '%[DIRECTOR_PROJECT]%' and length(analysis_output)<=500;
create index concurrently if not exists collab_projects_id_text_idx on collab_projects((id::text));
create index concurrently if not exists collab_projects_source_marker_idx on collab_projects using gin(collab_source_markers(genre));
create index concurrently if not exists collab_assets_project_created_idx on collab_assets(project_id,created_at);
create index concurrently if not exists collab_tasks_project_episode_idx on collab_tasks(project_id,episode,assigned_at);
create index concurrently if not exists collab_messages_project_created_idx on collab_messages(project_id,created_at);
create index concurrently if not exists collab_activity_project_created_idx on collab_activity(project_id,created_at desc);
create index concurrently if not exists collab_media_project_created_idx on collab_media(project_id,created_at desc);
create index concurrently if not exists collab_media_project_asset_idx on collab_media(project_id,asset_id,created_at desc,id desc) where kind='asset-image';
create index concurrently if not exists collab_media_asset_idx on collab_media(asset_id) where asset_id is not null;
create index concurrently if not exists collab_media_object_path_idx on collab_media(object_path);
create index concurrently if not exists software_license_cards_redeemer_idx on software_license_cards(redeemed_by);
create index concurrently if not exists software_license_orders_user_idx on software_license_orders(user_id);
create index concurrently if not exists win_ai_auth_grants_session_idx on win_ai_auth_grants(session_id);
create index concurrently if not exists win_ai_session_links_session_idx on win_ai_session_links(session_id);
