const MIGRATION_TABLES = [
  'app_users', 'app_sessions', 'invites',
  'collab_projects', 'collab_members', 'collab_assets', 'collab_media',
  'collab_tasks', 'collab_messages', 'collab_activity',
];

function buildMigrationManifest() {
  return {
    version: 1,
    tables: [...MIGRATION_TABLES],
    sensitiveFields: ['password_hash', 'token_hash', 'api_key', 'secret_key'],
    includeSecrets: false,
    storage: { provider: 'supabase-storage', migrateTo: 'tencent-cos', includeObjectBytes: true },
  };
}

module.exports = { MIGRATION_TABLES, buildMigrationManifest };
