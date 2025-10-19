import { afterAll, afterEach } from 'vitest';
import { cleanupAllFixtures, resetAllFixtures } from '../fixtures/database.js';

afterEach(async () => {
  await resetAllFixtures();
});

afterAll(async () => {
  await cleanupAllFixtures();
});
