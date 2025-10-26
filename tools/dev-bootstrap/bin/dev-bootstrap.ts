#!/usr/bin/env node

const start = async () => {
  await import('../dist/cli.js');
};

void start();
