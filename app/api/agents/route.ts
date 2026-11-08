import { db, now } from "@/lib/db";
import { hasSession } from "@/lib/security";
import { isProviderId } from "@/lib/providers";

export async function GET() {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ agents: db.prepare("SELECT id,name,description,system_prompt AS systemPrompt,provider,model,created_at AS createdAt FROM agents ORDER BY updated_at DESC").all() });
}

export async function POST(request: Request) {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (typeof body?.name !== "string" || !body.name.trim() || body.name.length > 80 || typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > 5000 || !isProviderId(body.provider) || typeof body.model !== "string") return Response.json({ error: "Name, instructions and a provider are required." }, { status: 400 });
  const timestamp = now(); const id = crypto.randomUUID();
  db.prepare("INSERT INTO agents(id,name,description,system_prompt,provider,model,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(id, body.name.trim(), typeof body.description === "string" ? body.description.slice(0,240) : "", body.prompt.trim(), body.provider, body.model.slice(0,128), timestamp, timestamp);
  return Response.json({ id }, { status: 201 });
}
