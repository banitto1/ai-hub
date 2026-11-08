import { readFile, unlink } from "node:fs/promises";
import { db } from "@/lib/db";
import { hasSession } from "@/lib/security";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const row = db.prepare("SELECT name,mime_type AS mimeType,storage_path AS path FROM files WHERE id=?").get(id) as { name: string; mimeType: string; path: string } | undefined;
  if (!row) return Response.json({ error: "File not found." }, { status: 404 });
  try {
    const data = await readFile(row.path);
    // The stored MIME type is client-supplied; never let an uploaded HTML/SVG render on the hub origin.
    return new Response(data, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`, "Content-Security-Policy": "sandbox; default-src 'none'", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Stored file is unavailable." }, { status: 404 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const row = db.prepare("SELECT storage_path AS path FROM files WHERE id=?").get(id) as { path: string } | undefined;
  if (!row) return Response.json({ deleted: false });
  try { await unlink(row.path); } catch { /* Metadata can still be removed if the file was already missing. */ }
  db.prepare("DELETE FROM files WHERE id=?").run(id);
  return Response.json({ deleted: true });
}
