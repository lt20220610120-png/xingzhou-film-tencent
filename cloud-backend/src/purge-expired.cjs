// 3 天恢复期到期后物理清理协作项目，减少云端缓存负担。
// 由 systemd timer 每小时调用一次。
const { readConfig } = require('./config.cjs');
const { createRepository } = require('./postgres-repository.cjs');

async function main() {
  const config = readConfig();
  const repo = createRepository(config.databaseUrl);
  try {
    const removed = await repo.purgeExpiredProjects();
    process.stdout.write('purged expired collab projects: ' + JSON.stringify(removed) + '\n');
  } finally {
    await repo.close();
  }
}

main().catch((error) => { process.stderr.write(String(error.message || error) + '\n'); process.exit(1); });
