ALTER TABLE collab_projects ADD COLUMN IF NOT EXISTS analysis_progress jsonb NOT NULL DEFAULT '{}';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS avatar_data text NOT NULL DEFAULT '';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT '';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS profile_tags text[] NOT NULL DEFAULT '{}';
