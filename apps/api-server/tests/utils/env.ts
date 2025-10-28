import { resetEnvCache } from '../../lib/config/env';

const DEFAULT_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://test:test@localhost:5432/chaincontest',
  NEXTAUTH_SECRET: 'test-secret-chaincontest-1234567890',
  NEXTAUTH_URL: 'https://app.chaincontest.local',
  PG_BOSS_SCHEMA: 'boss',
  CHAIN_RPC_PRIMARY: 'https://rpc.chaincontest.local',
  CHAIN_RPC_PUBLIC_URL: 'https://public-rpc.chaincontest.local',
  RATE_LIMIT_WINDOW: '60000',
  RATE_LIMIT_MAX: '10',
  LOG_LEVEL: 'silent'
};

export const applyTestEnv = (overrides: Record<string, string> = {}): void => {
  const merged = { ...DEFAULT_ENV, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    process.env[key] = value;
  }

  resetEnvCache();
};

export const clearTestEnv = (): void => {
  for (const key of Object.keys(DEFAULT_ENV)) {
    delete process.env[key];
  }

  resetEnvCache();
};
