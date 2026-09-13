// Preload for tests/dbMigrateRedact.test.js. Replaces child_process.execSync
// BEFORE scripts/db-migrate.js destructures it, so `npx prisma migrate deploy`
// "fails" with an error whose message, stack and stdout carry the connection
// string in THROW_WITH — the shape a real driver-level failure can take.
//
// Also stubs @prisma/client + @prisma/adapter-pg: CI's api job runs `npm ci`
// without `prisma generate`, so the real client cannot load there, and the
// runner would crash at require time instead of reaching its failure handler.
'use strict';
const cp = require('node:child_process');
const Module = require('node:module');

cp.execSync = () => {
  const url = process.env.THROW_WITH || '';
  const err = new Error(`Command failed: npx prisma migrate deploy\nError: P1001: Can't reach database server at ${url}`);
  err.stdout = Buffer.from(`Datasource "db": PostgreSQL database at ${url}`);
  err.code = 'P1001';
  throw err;
};

const stubs = {
  '@prisma/client': { PrismaClient: class { async $disconnect() {} } },
  '@prisma/adapter-pg': { PrismaPg: class {} },
};
const originalLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
  return originalLoad.call(this, request, ...rest);
};
