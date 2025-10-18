import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { DrizzleDatabase } from '../../src/adapters/connection.js';

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(CURRENT_DIR, '../../migrations');

export interface TestDatabaseFixture {
  readonly name: string;
  readonly connectionString: string;
  readonly pool: Pool;
  readonly db: DrizzleDatabase;
  reset(): Promise<void>;
  cleanup(): Promise<void>;
}

const activeFixtures = new Set<TestDatabaseFixture>();

export async function createDatabaseFixture(connectionString?: string): Promise<TestDatabaseFixture> {
  const baseUrl = resolveConnectionString(connectionString);
  const { admin, databaseName } = buildDatabaseUrls(baseUrl);

  const testDatabaseName = `${databaseName}_test_${randomUUID().replace(/-/g, '')}`;

  await withAdminPool(admin.href, async (pool) => {
    await pool.query(`CREATE DATABASE "${testDatabaseName}"`);
  });

  const testDatabaseUrl = new URL(baseUrl.href);
  testDatabaseUrl.pathname = `/${testDatabaseName}`;

  const pool = new Pool({ connectionString: testDatabaseUrl.href });
  const db = drizzle(pool);

  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  const fixture: TestDatabaseFixture = {
    name: testDatabaseName,
    connectionString: testDatabaseUrl.href,
    pool,
    db,
    reset: () => resetDatabase(pool, db),
    cleanup: async () => {
      activeFixtures.delete(fixture);
      await cleanupDatabase(admin.href, testDatabaseName, pool);
    }
  };

  activeFixtures.add(fixture);
  return fixture;
}

export async function resetAllFixtures(): Promise<void> {
  await Promise.all(Array.from(activeFixtures).map((fixture) => fixture.reset()));
}

export async function cleanupAllFixtures(): Promise<void> {
  await Promise.all(Array.from(activeFixtures).map((fixture) => fixture.cleanup()));
  activeFixtures.clear();
}

const resolveConnectionString = (connectionString?: string): URL => {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL must be provided for database tests');
  }
  return new URL(url);
};

const buildDatabaseUrls = (base: URL): { admin: URL; databaseName: string } => {
  const admin = new URL(base.href);
  const databaseName = base.pathname.replace(/^\//, '') || 'postgres';
  admin.pathname = '/postgres';
  return { admin, databaseName };
};

const withAdminPool = async (connectionString: string, handler: (pool: Pool) => Promise<void>) => {
  const pool = new Pool({ connectionString });
  try {
    await handler(pool);
  } finally {
    await pool.end();
  }
};

const cleanupDatabase = async (adminConnectionString: string, databaseName: string, pool: Pool) => {
  await pool.end();
  await withAdminPool(adminConnectionString, async (adminPool) => {
    await adminPool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [databaseName]
    );
    await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  });
};

const resetDatabase = async (pool: Pool, db: DrizzleDatabase): Promise<void> => {
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public AUTHORIZATION CURRENT_USER');
  await pool.query('GRANT ALL ON SCHEMA public TO public');
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
};
