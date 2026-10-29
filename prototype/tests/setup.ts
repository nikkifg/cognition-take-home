// Loaded via `node --import` before every test file: points Prisma at a fresh
// throwaway SQLite file and applies all migrations to it.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const TEST_DB = "test.db";
process.env.DATABASE_URL = `file:./${TEST_DB}`;
(process.env as Record<string, string>).NODE_ENV = "test";

for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(TEST_DB + suffix, { force: true });
execSync("npx prisma migrate deploy", { stdio: "ignore", env: process.env });
