function readConfig(env = process.env) {
  const apiSecret = String(env.API_SECRET || '');
  if (!apiSecret) throw new Error('API_SECRET is required');
  const port = Number(env.PORT || 4310);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be a valid TCP port');
  const databaseUrl = String(env.DATABASE_URL || '');
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const poolSize = Number(env.DATABASE_POOL_SIZE || 16);
  if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 64) throw new Error('DATABASE_POOL_SIZE must be between 1 and 64');
  return { apiSecret, port, databaseUrl, poolSize };
}

module.exports = { readConfig };
