function readConfig(env = process.env) {
  const apiSecret = String(env.API_SECRET || '');
  if (!apiSecret) throw new Error('API_SECRET is required');
  const port = Number(env.PORT || 4310);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be a valid TCP port');
  const databaseUrl = String(env.DATABASE_URL || '');
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  return { apiSecret, port, databaseUrl };
}

module.exports = { readConfig };
