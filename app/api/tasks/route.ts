import { db, now } from "@/lib/db";
import { hasSession } from "@/lib/security";

export async function GET() {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ tasks: db.prepare("SELECT id,title,notes,due_at AS dueAt,done,created_at AS createdAt FROM tasks ORDER BY done ASC,COALESCE(due_at,'9999') ASC,created_at DESC").all() });
}

export async function POST(request: Request) {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { title?: unknown; notes?: unknown; dueAt?: unknown } | null;
  if (typeof body?.title !== "string" || !body.title.trim() || body.title.length > 200) return Response.json({ error: "Task title is required." }, { status: 400 });
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO tasks(id,title,notes,due_at,done,created_at) VALUES(?,?,?,?,0,?)").run(id, body.title.trim(), typeof body.notes === "string" ? body.notes.slice(0,1000) : "", typeof body.dueAt === "string" && body.dueAt ? body.dueAt : null, now());
  return Response.json({ id }, { status: 201 });
}
