const test = require('node:test');
const assert = require('node:assert/strict');
const { MIGRATION_TABLES, buildMigrationManifest } = require('../src/migration-manifest.cjs');

test('迁移清单覆盖账号、协作项目、资产、媒体和任务消息数据', () => {
  for (const table of ['app_users', 'app_sessions', 'invites', 'collab_projects', 'collab_members', 'collab_assets', 'collab_media', 'collab_tasks', 'collab_messages', 'collab_activity']) {
    assert.ok(MIGRATION_TABLES.includes(table), `missing ${table}`);
  }
});

test('迁移清单默认脱敏，不包含密码哈希、会话令牌或服务端密钥字段', () => {
  const manifest = buildMigrationManifest();
  assert.deepEqual(manifest.sensitiveFields, ['password_hash', 'token_hash', 'api_key', 'secret_key']);
  assert.equal(manifest.includeSecrets, false);
});
