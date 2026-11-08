import { stat } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";
import { db, now } from "@/lib/db";
import { hasSession } from "@/lib/security";

export const runtime = "nodejs";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  let host = "";
  try { host = origin ? new URL(origin).host : ""; } catch {}
  return Boolean(host && host === request.headers.get("host"));
}

export async function GET() {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const projects = db.prepare("SELECT id, name, path, created_at AS createdAt, updated_at AS updatedAt FROM projects ORDER BY updated_at DESC LIMIT 50").all();
  return Response.json({ projects });
}

export async function POST(request: Request) {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as { path?: unknown; name?: unknown } | null;
  if (typeof body?.path !== "string" || !body.path.trim() || body.path.length > 1000) {
    return Response.json({ error: "Укажите полный путь к папке проекта." }, { status: 400 });
  }
  const cleanPath = resolve(/*turbopackIgnore: true*/ body.path.trim());
  if (!isAbsolute(cleanPath)) return Response.json({ error: "Путь должен быть абсолютным." }, { status: 400 });
  try {
    const s = await stat(/*turbopackIgnore: true*/ cleanPath);
    if (!s.isDirectory()) return Response.json({ error: "Указанный путь не является папкой." }, { status: 400 });
  } catch {
    return Response.json({ error: "Папка не найдена на этом ПК." }, { status: 400 });
  }
  const customName = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  const name = customName || basename(cleanPath) || cleanPath;
  const ts = now();
  const existing = db.prepare("SELECT id FROM projects WHERE path=?").get(cleanPath) as { id: string } | undefined;
  const id = existing?.id || crypto.randomUUID();
  if (existing) {
    db.prepare("UPDATE projects SET name=?, updated_at=? WHERE id=?").run(name, ts, id);
  } else {
    db.prepare("INSERT INTO projects(id, name, path, created_at, updated_at) VALUES(?,?,?,?,?)").run(id, name, cleanPath, ts, ts);
  }
  return Response.json({ project: { id, name, path: cleanPath, updatedAt: ts } });
}

export async function DELETE(request: Request) {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  if (typeof body?.id !== "string") return Response.json({ error: "Не указан проект." }, { status: 400 });
  db.prepare("DELETE FROM projects WHERE id=?").run(body.id);
  return Response.json({ deleted: true });
}
