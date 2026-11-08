import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db, now } from "@/lib/db";
import { hasSession } from "@/lib/security";
import { dataDir } from "@/lib/local-config";

export async function GET() {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ files: db.prepare("SELECT id,name,mime_type AS mimeType,size_bytes AS sizeBytes,created_at AS createdAt FROM files ORDER BY created_at DESC").all() });
}

export async function POST(request: Request) {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 21 * 1024 * 1024) return Response.json({ error: "Upload must be 20 MB or smaller." }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size < 1 || file.size > 20 * 1024 * 1024) return Response.json({ error: "Choose a file up to 20 MB." }, { status: 400 });
  const id = crypto.randomUUID(); const base = join(dataDir, "uploads");
  await mkdir(base, { recursive: true });
  const path = join(base, id);
  await writeFile(path, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
  db.prepare("INSERT INTO files(id,name,mime_type,size_bytes,storage_path,created_at) VALUES(?,?,?,?,?,?)").run(id, file.name.slice(0,255), file.type || "application/octet-stream", file.size, path, now());
  return Response.json({ id }, { status: 201 });
}
