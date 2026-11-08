import { db } from "@/lib/db";
import { hasSession } from "@/lib/security";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const chat = db.prepare("SELECT id,title,mode,project_path AS projectPath,created_at AS createdAt,updated_at AS updatedAt FROM chats WHERE id=?").get(id);
  if (!chat) return Response.json({ error: "Chat not found." }, { status: 404 });
  const messages = db.prepare("SELECT id,role,provider,model,content,created_at AS createdAt FROM messages WHERE chat_id=? ORDER BY created_at ASC LIMIT 500").all(id);
  return Response.json({ chat, messages });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const result = db.prepare("DELETE FROM chats WHERE id=?").run(id);
  return Response.json({ deleted: result.changes > 0 });
}
