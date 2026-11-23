ALTER TABLE collab_assets ADD COLUMN IF NOT EXISTS no_reference_image boolean NOT NULL DEFAULT false;
