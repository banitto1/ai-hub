import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { dataDir, encryptionKey } from "@/lib/local-config";
const COOKIE = "aihub_session";
const duration = 7 * 86400;
const attempts = new Map<string,{ count: number; until: number; start: number }>();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function isAppConfigured() { return true; }
export function encryptSecret(value: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),body]).toString("base64");
}
export function decryptSecret(value: string) {
  const body=Buffer.from(value,"base64"), decipher=createDecipheriv("aes-256-gcm",encryptionKey(),body.subarray(0,12));
  decipher.setAuthTag(body.subarray(12,28));
  return Buffer.concat([decipher.update(body.subarray(28)),decipher.final()]).toString("utf8");
}
export async function createSession() {
  const token=randomBytes(32).toString("base64url");
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  db.prepare("INSERT INTO sessions(id,expires_at) VALUES(?,?)").run(hash(token),Date.now()+duration*1000);
  (await cookies()).set(COOKIE,token,{httpOnly:true,sameSite:"strict",secure:process.env.APP_HTTPS==="true",path:"/",maxAge:duration});
}
export async function clearSession() {
  const jar=await cookies(), token=jar.get(COOKIE)?.value;
  if(token) db.prepare("DELETE FROM sessions WHERE id=?").run(hash(token));
  jar.delete(COOKIE);
}
export async function hasSession() {
  const token=(await cookies()).get(COOKIE)?.value;
  if(!token || token.length>128) return false;
  return Boolean(db.prepare("SELECT id FROM sessions WHERE id=? AND expires_at>?").get(hash(token),Date.now()));
}
export function consumeLaunchTicket(ticket: unknown) {
  if(typeof ticket!=="string" || !/^[a-f0-9]{64}$/.test(ticket)) return false;
  const file=join(dataDir,"launch-"+hash(ticket)+".json");
  try {
    const saved=JSON.parse(readFileSync(file,"utf8")); unlinkSync(file);
    return saved.expiresAt>Date.now();
  } catch { return false; }
}
export function passwordMatches(input: string) {
  if(!process.env.APP_PASSWORD) return false;
  return timingSafeEqual(Buffer.from(hash(input)),Buffer.from(hash(process.env.APP_PASSWORD)));
}
export function checkLoginAttempt(address: string) {
  const now=Date.now(), entry=attempts.get(address);
  if(entry && entry.until>now) return {allowed:false,retryAfterSeconds:Math.ceil((entry.until-now)/1000)};
  if(!entry || now-entry.start>600000) attempts.set(address,{count:0,until:0,start:now});
  return {allowed:true,retryAfterSeconds:0};
}
export function registerLoginFailure(address: string) {
  const entry=attempts.get(address)||{count:0,until:0,start:Date.now()};
  entry.count++; if(entry.count>=5) entry.until=Date.now()+900000; attempts.set(address,entry);
}
export function clearLoginFailures(address: string) { attempts.delete(address); }
