import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL ?? ''
  }
});
