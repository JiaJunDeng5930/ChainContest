#!/usr/bin/env node

import { runCli } from "../cli.js";

try {
  const exitCode = await runCli();
  process.exit(exitCode);
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
