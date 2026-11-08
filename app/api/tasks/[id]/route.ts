import { db } from "@/lib/db";
import { hasSession } from "@/lib/security";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { done?: unknown } | null;
  if (typeof body?.done !== "boolean") return Response.json({ error: "Expected a done flag." }, { status: 400 });
  return Response.json({ updated: db.prepare("UPDATE tasks SET done=? WHERE id=?").run(body.done ? 1 : 0,id).changes > 0 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  return Response.json({ deleted: db.prepare("DELETE FROM tasks WHERE id=?").run(id).changes > 0 });
}
