import { db } from "@/lib/db";
import { hasSession } from "@/lib/security";
import { deleteProviderConfig, getProviderStatus, isProviderId, saveProviderConfig, readConfig } from "@/lib/providers";

export async function GET() {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ providers: getProviderStatus() });
}

export async function POST(request: Request) {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { provider?: unknown; apiKey?: unknown; model?: unknown } | null;
  if (!isProviderId(body?.provider) || (typeof body.apiKey !== "string" || body.apiKey.length > 512) || typeof body.model !== "string" || !body.model.trim() || body.model.length > 128) {
    return Response.json({ error: "Enter a provider, API key and model name." }, { status: 400 });
  }
  try {
    if(body.provider==="argon") throw new Error("Argon API is not specified.");
    const key=body.apiKey.trim() || readConfig(body.provider)?.apiKey;
    if(!key || key.length<8) throw new Error("Enter a valid API key.");
    saveProviderConfig(body.provider,key,body.model.trim());
  }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not save settings." }, { status: 400 }); }
  return Response.json({ providers: getProviderStatus() });
}

export async function DELETE(request: Request) {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const provider = new URL(request.url).searchParams.get("provider");
  if (!isProviderId(provider)) return Response.json({ error: "Unknown provider." }, { status: 400 });
  deleteProviderConfig(provider);
  return Response.json({ providers: getProviderStatus() });
}
