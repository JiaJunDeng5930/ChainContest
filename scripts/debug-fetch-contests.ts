import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
process.env.NODE_ENV = 'development';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://chaincontest:chaincontest@localhost:55432/chaincontest';
const envFile = path.resolve('dev-bootstrap.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length > 0 && process.env[key] === undefined) {
      process.env[key] = rest.join('=').trim();
    }
  }
}

(async () => {
  const repo = await import(pathToFileURL(path.resolve('apps/api-server/lib/contests/repository.ts')).href);
  const result = await repo.listContests({});
  console.log(JSON.stringify(result, null, 2));
})();
