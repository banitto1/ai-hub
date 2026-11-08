import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { dataDir } from "@/lib/local-config";
import { initializeDatabase } from "@/lib/db-schema.mjs";

const globalForDb = globalThis as typeof globalThis & { aiHubDb?: DatabaseSync };

function openDatabase() {
  if (globalForDb.aiHubDb) return globalForDb.aiHubDb;
  const building = process.env.NEXT_PHASE === "phase-production-build";
  const file = building ? ":memory:" : process.env.AI_HUB_DB_PATH || join(dataDir, "ai-hub.sqlite");
  if (!building) mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  initializeDatabase(db);
  globalForDb.aiHubDb = db;
  return db;
}

export const db = openDatabase();
export const now = () => new Date().toISOString();
