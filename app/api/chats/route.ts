import { db, now } from "@/lib/db";
import { hasSession } from "@/lib/security";

export async function GET() {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const chats = db.prepare(`SELECT c.id, c.title, c.mode, c.project_path AS projectPath, c.created_at AS createdAt, c.updated_at AS updatedAt,
    (SELECT content FROM messages WHERE chat_id=c.id ORDER BY created_at DESC LIMIT 1) AS preview
    FROM chats c ORDER BY c.updated_at DESC LIMIT 100`).all();
  return Response.json({ chats });
}

export async function POST(request: Request) {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { title?: unknown; mode?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "New chat";
  const mode = ["single", "compare", "team"].includes(String(body?.mode)) ? String(body?.mode) : "single";
  const id = crypto.randomUUID();
  const timestamp = now();
  db.prepare("INSERT INTO chats(id,title,mode,created_at,updated_at) VALUES(?,?,?,?,?)").run(id, title || "New chat", mode, timestamp, timestamp);
  return Response.json({ id, title: title || "New chat", mode }, { status: 201 });
}
