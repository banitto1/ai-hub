import { db } from "@/lib/db";
import { hasSession } from "@/lib/security";

export async function GET(request: Request) {
  if (!(await hasSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const days = Math.max(1, Math.min(90, Number(params.get("days")) || 30));
  const exportAll = params.get("export") === "1";
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const summary = db.prepare(`SELECT COUNT(*) AS requests, SUM(COALESCE(input_tokens,0)) AS inputTokens, SUM(COALESCE(output_tokens,0)) AS outputTokens,
    SUM(CASE WHEN input_tokens IS NULL OR output_tokens IS NULL THEN 1 ELSE 0 END) AS missingUsage,
    AVG(CASE WHEN status='success' THEN latency_ms END) AS avgLatency,
    SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errors FROM usage_logs WHERE created_at>=?`).get(since);
  const byProvider = db.prepare(`SELECT provider,COUNT(*) AS requests,SUM(COALESCE(input_tokens,0)) AS inputTokens,SUM(COALESCE(output_tokens,0)) AS outputTokens,
    SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS successes FROM usage_logs WHERE created_at>=? GROUP BY provider ORDER BY requests DESC`).all(since);
  const trend = db.prepare(`SELECT substr(created_at,1,10) AS day,COUNT(*) AS requests,SUM(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)) AS tokens
    FROM usage_logs WHERE created_at>=? GROUP BY day ORDER BY day`).all(since);
  const recent = exportAll
    ? db.prepare("SELECT provider,model,status,error,latency_ms AS latency,created_at AS createdAt,input_tokens AS inputTokens,output_tokens AS outputTokens FROM usage_logs WHERE created_at>=? ORDER BY created_at DESC LIMIT 10000").all(since)
    : db.prepare("SELECT provider,model,status,error,latency_ms AS latency,created_at AS createdAt,input_tokens AS inputTokens,output_tokens AS outputTokens FROM usage_logs WHERE created_at>=? ORDER BY created_at DESC LIMIT 10").all(since);
  return Response.json({ days, summary, byProvider, trend, recent, accounting: { requests: "observed API call attempts", tokens: "provider-reported usage where returned", cost: "unavailable until explicit provider pricing is configured", quota: "provider remaining quota is not exposed by this dashboard" } });
}
