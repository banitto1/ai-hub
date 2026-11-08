import { db } from "@/lib/db";
import { hasSession } from "@/lib/security";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  return Response.json({ deleted: db.prepare("DELETE FROM agents WHERE id=?").run(id).changes > 0 });
}
