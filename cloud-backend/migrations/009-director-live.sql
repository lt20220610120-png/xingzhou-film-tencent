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
