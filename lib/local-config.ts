import "server-only";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
export const dataDir = process.env.AI_HUB_DATA_DIR || join(process.cwd(), ".data");
export function encryptionKey() {
  if (process.env.APP_ENCRYPTION_KEY) {
    if (!/^[a-f0-9]{64}$/i.test(process.env.APP_ENCRYPTION_KEY)) throw new Error("Invalid encryption key.");
    return Buffer.from(process.env.APP_ENCRYPTION_KEY, "hex");
  }
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = join(dataDir, "security.json");
  try { writeFileSync(file, JSON.stringify({ encryptionKey: randomBytes(32).toString("hex") }), { flag: "wx", mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const saved = JSON.parse(readFileSync(file,"utf8"));
  if (!/^[a-f0-9]{64}$/i.test(saved.encryptionKey)) throw new Error("Local security file is invalid.");
  return Buffer.from(saved.encryptionKey, "hex");
}
