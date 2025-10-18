import { afterAll, beforeEach } from 'vitest';
import { cleanupAllFixtures, resetAllFixtures } from '../fixtures/database.js';

beforeEach(async () => {
  await resetAllFixtures();
});

afterAll(async () => {
  await cleanupAllFixtures();
});
