import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { hasSession } from "@/lib/security";

export const runtime = "nodejs";

const SKIP = new Set([".git", "node_modules", ".next", ".next-verify", ".data", "vendor", "win-app", "dist", "build"]);
// Credential stores and key material are never shown in the explorer or sent to a model as an attachment.
const SECRET_DIR = /(^|\/)(\.data|\.ssh|\.gnupg|\.aws|\.azure|\.kube|\.docker|\.codex|\.gemini|\.config\/gcloud)(\/|$)/i;
const SECRET_FILE = /(^|\/)(\.env(\..*)?|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|.*\.(pem|key|p12|pfx|jks|keystore|kdbx)|credentials(\.json)?|auth\.json|token(s)?\.json|security\.json|mobile-tls\.json|android-signing.*)$/i;
function isSecret(rel: string) {
  return SECRET_DIR.test(rel) || SECRET_FILE.test(rel);
}

function resolveInside(baseDir: string, subPath: string) {
  const root = resolve(/*turbopackIgnore: true*/ baseDir);
  const target = resolve(/*turbopackIgnore: true*/ root, subPath || ".");
  const rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Выход за пределы папки проекта запрещён.");
  const clean = rel ? rel.split(sep).join("/") : "";
  if (clean && isSecret(clean)) throw new Error("Файл с ключами или учётными данными скрыт из проводника.");
  return { root, target, rel: clean };
}

export async function GET(request: Request) {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const dir = url.searchParams.get("dir") || "";
  if (!dir || !isAbsolute(dir) || dir.length > 1000) {
    return Response.json({ error: "Выберите существующую папку проекта." }, { status: 400 });
  }
  try {
    const rootStat = await stat(/*turbopackIgnore: true*/ dir);
    if (!rootStat.isDirectory()) return Response.json({ error: "Папка не найдена." }, { status: 400 });

    const findQuery = url.searchParams.get("find");
    if (findQuery !== null) {
      const rootDir = resolve(/*turbopackIgnore: true*/ dir);
      const needle = findQuery.trim().toLowerCase();
      const files: string[] = [];
      const walk = async (cur: string, depth: number) => {
        if (files.length >= 40 || depth > 5) return;
        const list = await readdir(/*turbopackIgnore: true*/ cur, { withFileTypes: true }).catch(() => []);
        for (const entry of list) {
          if (files.length >= 40) break;
          if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
          const full = resolve(/*turbopackIgnore: true*/ cur, entry.name);
          const rel = relative(rootDir, full).split(sep).join("/");
          if (entry.isDirectory()) {
            if (!SKIP.has(entry.name)) await walk(full, depth + 1);
          } else if (entry.isFile() && !isSecret(rel) && (!needle || rel.toLowerCase().includes(needle))) {
            files.push(rel);
          }
        }
      };
      await walk(rootDir, 0);
      return Response.json({ files });
    }

    const fileParam = url.searchParams.get("file");
    if (fileParam) {
      const { target, rel } = resolveInside(dir, fileParam);
      const st = await stat(/*turbopackIgnore: true*/ target);
      if (!st.isFile()) return Response.json({ error: "Это не файл." }, { status: 400 });
      if (st.size > 120000) return Response.json({ path: rel, sizeBytes: st.size, tooLarge: true, content: "" });
      const buf = await readFile(/*turbopackIgnore: true*/ target);
      if (buf.includes(0)) return Response.json({ path: rel, sizeBytes: st.size, binary: true, content: "" });
      return Response.json({ path: rel, sizeBytes: st.size, content: buf.toString("utf8") });
    }

    const sub = url.searchParams.get("sub") || "";
    const { target, rel } = resolveInside(dir, sub);
    const list = await readdir(/*turbopackIgnore: true*/ target, { withFileTypes: true });
    const entries = list
      .filter(e => !e.name.startsWith(".") || e.name === ".env.example" || e.name === ".gitignore")
      .filter(e => !isSecret(rel ? `${rel}/${e.name}` : e.name))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .slice(0, 250)
      .map(e => ({
        name: e.name,
        path: rel ? `${rel}/${e.name}` : e.name,
        kind: e.isDirectory() ? "dir" : "file",
      }));
    return Response.json({ current: rel, entries });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
