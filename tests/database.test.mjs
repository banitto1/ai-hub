import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "../lib/db-schema.mjs";

function createDb() {
  const db = new DatabaseSync(":memory:");
  initializeDatabase(db);
  return db;
}

test("initializes SQLite tables and required indexes", () => {
  const db = createDb();
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  for (const table of ["settings", "chats", "messages", "usage_logs", "agents", "tasks", "files", "projects"]) assert.ok(names.includes(table), `missing ${table}`);
  const chatCols = db.prepare("PRAGMA table_info(chats)").all().map((row) => row.name);
  assert.ok(chatCols.includes("project_path"), "missing chats.project_path");
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((row) => row.name);
  assert.ok(indexes.includes("messages_chat_idx"));
  assert.ok(indexes.includes("usage_created_idx"));
  // Re-running initializeDatabase must be idempotent and preserve existing data
  db.prepare("INSERT INTO projects(id,name,path,created_at,updated_at) VALUES(?,?,?,?,?)").run("p1", "Demo", "C:\\Demo", "2026-01-01", "2026-01-01");
  initializeDatabase(db);
  assert.equal(db.prepare("SELECT path FROM projects WHERE id='p1'").get().path, "C:\\Demo");
  db.close();
});

test("deleting a chat removes messages and preserves detached usage", () => {
  const db = createDb();
  db.prepare("INSERT INTO chats(id,title,mode,created_at,updated_at) VALUES(?,?,?,?,?)").run("c1", "Draft", "compare", "2026-01-01", "2026-01-01");
  db.prepare("INSERT INTO messages(id,chat_id,role,content,created_at) VALUES(?,?,?,?,?)").run("m1", "c1", "user", "Hello", "2026-01-01");
  db.prepare("INSERT INTO usage_logs(id,chat_id,provider,model,input_tokens,output_tokens,latency_ms,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)").run("u1", "c1", "openai", "example", 11, 7, 400, "success", "2026-01-01");
  db.prepare("DELETE FROM chats WHERE id=?").run("c1");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM messages").get().count, 0);
  assert.equal(db.prepare("SELECT chat_id AS chatId FROM usage_logs WHERE id=?").get("u1").chatId, null);
  db.close();
});

test("usage aggregates report only returned tokens and count failed attempts", () => {
  const db = createDb();
  const add = db.prepare("INSERT INTO usage_logs(id,provider,model,input_tokens,output_tokens,latency_ms,status,created_at) VALUES(?,?,?,?,?,?,?,?)");
  add.run("u1", "openai", "m1", 120, 30, 900, "success", "2026-10-28T10:00:00.000Z");
  add.run("u2", "gemini", "m2", null, null, 200, "error", "2026-10-28T11:00:00.000Z");
  const row = db.prepare("SELECT COUNT(*) AS requests,SUM(COALESCE(input_tokens,0)) AS inputTokens,SUM(COALESCE(output_tokens,0)) AS outputTokens,SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errors FROM usage_logs").get();
  assert.deepEqual({ requests: row.requests, inputTokens: row.inputTokens, outputTokens: row.outputTokens, errors: row.errors }, { requests: 2, inputTokens: 120, outputTokens: 30, errors: 1 });
  assert.equal(db.prepare("SELECT input_tokens AS inputTokens FROM usage_logs WHERE id='u2'").get().inputTokens, null);
  db.close();
});
