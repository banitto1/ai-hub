import "server-only";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/security";

export type ProviderId = "openai" | "gemini" | "grok" | "argon";
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ProviderConfig = { apiKey: string; model: string };
export type ProviderResult = { text: string; inputTokens: number | null; outputTokens: number | null; model: string };

export const providerInfo: Record<ProviderId, { label: string; defaultModel: string; color: string }> = {
  openai: { label: "OpenAI", defaultModel: "gpt-5.4", color: "#77a9ff" },
  gemini: { label: "Gemini", defaultModel: "gemini-3.8-flash", color: "#b49cff" },
  grok: { label: "Grok", defaultModel: "grok-4.7", color: "#fff" },
  argon: { label: "Argon", defaultModel: "custom", color: "#54d6aa" },
};

const validProviders: ProviderId[] = ["openai", "gemini", "grok", "argon"];
export const isProviderId = (value: unknown): value is ProviderId => typeof value === "string" && validProviders.includes(value as ProviderId);

export function readConfig(provider: ProviderId): ProviderConfig | null {
  const row = db.prepare("SELECT encrypted_value FROM settings WHERE key = ?").get(`provider:${provider}`) as { encrypted_value: string } | undefined;
  if (row) {
    try { return JSON.parse(decryptSecret(row.encrypted_value)) as ProviderConfig; } catch { return null; }
  }
  const envKey = { openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY", grok: "XAI_API_KEY", argon: "ARGON_API_KEY" }[provider];
  return process.env[envKey] ? { apiKey: process.env[envKey]!, model: process.env[`${envKey.replace("_API_KEY", "_MODEL")}`] || providerInfo[provider].defaultModel } : null;
}

export function getProviderStatus() {
  return validProviders.map((id) => {
    const config = readConfig(id);
    return { id, name: providerInfo[id].label, model: config?.model || providerInfo[id].defaultModel, configured: id !== "argon" && Boolean(config?.apiKey), adapter: id === "argon" ? "placeholder" : "native" };
  });
}

export function configuredModel(provider: ProviderId) { return readConfig(provider)?.model || providerInfo[provider].defaultModel; }

async function requestJson(url: string, apiKey: string, body: unknown, header = "Authorization") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  headers[header] = header === "Authorization" ? `Bearer ${apiKey}` : apiKey;
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000), cache: "no-store" });
  const data = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) {
    const message = typeof data.error?.message === "string" ? data.error.message : `Provider request failed (${response.status}).`;
    throw new Error(message.slice(0, 500));
  }
  return data;
}

export async function callProvider(provider: ProviderId, messages: ChatMessage[], systemPrompt = "You are a helpful assistant.", modelOverride?: string): Promise<ProviderResult> {
  if (provider === "argon") throw new Error("Argon is reserved as an adapter. Add its API specification to implement this connection.");
  const config = readConfig(provider);
  if (!config?.apiKey) throw new Error(`${providerInfo[provider].label} API key is not configured.`);
  if (modelOverride) config.model = modelOverride;
  if (provider === "openai") {
    const data = await requestJson("https://api.openai.com/v1/responses", config.apiKey, {
      model: config.model, instructions: systemPrompt, max_output_tokens: 4096, store: false,
      input: messages.map((item) => ({ role: item.role, content: item.content })),
    });
    const text = data.output_text || data.output?.flatMap((item: any) => item.content || []).filter((item: any) => item.type === "output_text").map((item: any) => item.text).join("") || "";
    return { text: text || "The provider returned no text. Try a different prompt or increase the output limit.", inputTokens: numberOrNull(data.usage?.input_tokens), outputTokens: numberOrNull(data.usage?.output_tokens), model: data.model || data.modelVersion || config.model };
  }
  if (provider === "gemini") {
    const contents = messages.map((item) => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content }] }));
    const data = await requestJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`, config.apiKey, {
      systemInstruction: { parts: [{ text: systemPrompt }] }, contents,
      generationConfig: { maxOutputTokens: 4096 },
    }, "x-goog-api-key");
    const text = data.candidates?.flatMap((item: any) => item.content?.parts || []).filter((item: any) => !item.thought).map((item: any) => item.text || "").join("") || "";
    return { text: text || "The provider returned no text. Try a different prompt or increase the output limit.", inputTokens: numberOrNull(data.usageMetadata?.promptTokenCount), outputTokens: geminiOutput(data.usageMetadata), model: data.model || data.modelVersion || config.model };
  }
  const data = await requestJson("https://api.x.ai/v1/responses", config.apiKey, {
    model: config.model,
    input: [{ role: "system", content: systemPrompt }, ...messages.map((item) => ({ role: item.role, content: item.content }))],
    max_output_tokens: 4096, store: false,
  });
  const text = data.output_text || data.output?.flatMap((item: any) => item.content || []).filter((item: any) => item.type === "output_text").map((item: any) => item.text).join("") || "";
  return { text: text || "The provider returned no text. Try a different prompt or increase the output limit.", inputTokens: numberOrNull(data.usage?.input_tokens), outputTokens: numberOrNull(data.usage?.output_tokens), model: data.model || data.modelVersion || config.model };
}

function numberOrNull(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }

export function saveProviderConfig(provider: ProviderId, apiKey: string, model: string) {
  const encrypted = encryptSecret(JSON.stringify({ apiKey, model }));
  db.prepare(`INSERT INTO settings(key, encrypted_value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET encrypted_value=excluded.encrypted_value, updated_at=excluded.updated_at`).run(`provider:${provider}`, encrypted, new Date().toISOString());
}

export function deleteProviderConfig(provider: ProviderId) { db.prepare("DELETE FROM settings WHERE key = ?").run(`provider:${provider}`); }


function geminiOutput(usage: any): number | null {
 const total=numberOrNull(usage?.totalTokenCount), input=numberOrNull(usage?.promptTokenCount);
 if(total!==null && input!==null) return Math.max(0,total-input);
 const visible=numberOrNull(usage?.candidatesTokenCount);
 return visible===null ? null : visible+(numberOrNull(usage?.thoughtsTokenCount) ?? 0);
}
export async function verifyProvider(provider: ProviderId) {
 if(provider==="argon") throw new Error("Argon API is not specified.");
 const config=readConfig(provider); if(!config) throw new Error("Save a key first.");
 const endpoint=provider==="gemini" ? "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000" : provider==="openai" ? "https://api.openai.com/v1/models" : "https://api.x.ai/v1/models";
 const headers: Record<string,string>=provider==="gemini" ? {"x-goog-api-key":config.apiKey} : {Authorization:"Bearer "+config.apiKey};
 const response=await fetch(endpoint,{headers,signal:AbortSignal.timeout(20000),cache:"no-store"});
 if(!response.ok) throw new Error("Provider rejected the connection (HTTP "+response.status+"). Check the key and account permissions.");
 const data=await response.json();
 const models=(data.data || data.models || []).map((m: any)=>String(m.id || m.name || "").replace(/^models\//,"")).filter(Boolean);
 return {models,modelAvailable:models.includes(config.model),checkedAt:new Date().toISOString()};
}
