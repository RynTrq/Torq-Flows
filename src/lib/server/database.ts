import 'server-only';

import { Pool, type PoolClient, type QueryResult } from 'pg';

declare global {
  var __torqFlowsPool: Pool | undefined;
  var __torqFlowsSchemaPromise: Promise<void> | undefined;
}

const schemaSql = `
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
`;

function getSslConfig() {
  const sslPreference = process.env.DATABASE_SSL?.toLowerCase();
  const connectionString = process.env.DATABASE_URL ?? '';

  if (sslPreference === 'false') {
    return false;
  }

  if (sslPreference === 'true') {
    return { rejectUnauthorized: false };
  }

  return /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false };
}

function getPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required to use the PostgreSQL backend.');
  }

  if (!global.__torqFlowsPool) {
    global.__torqFlowsPool = new Pool({
      connectionString,
      ssl: getSslConfig(),
    });
  }

  return global.__torqFlowsPool;
}

export async function ensureDatabaseSchema() {
  if (!global.__torqFlowsSchemaPromise) {
    global.__torqFlowsSchemaPromise = getPool()
      .query(schemaSql)
      .then(() => undefined)
      .catch((error: unknown) => {
        global.__torqFlowsSchemaPromise = undefined;
        throw error;
      });
  }

  await global.__torqFlowsSchemaPromise;
}

export async function query<T = unknown>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  await ensureDatabaseSchema();
  return getPool().query<T>(text, params);
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  await ensureDatabaseSchema();
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
