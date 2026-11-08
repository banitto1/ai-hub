"use client";
import {createPortal} from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  AtSign,
  BookmarkPlus,
  Check,
  ChevronDown,
  Copy,
  FileText,
  FolderGit2,
  FolderOpen,
  GitCompareArrows,
  LoaderCircle,
  MessageSquare,
  PanelRight,
  Paperclip,
  Plus,
  RefreshCw,
  Slash,
  Sparkles,
  Square,
  TerminalSquare,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { GeminiQuotas, QuotaPie } from "./quota-pie";
import MessageMarkdown from "./message-markdown";
import ApprovalCard from "./components/approval-card";
import StepCard from "./components/step-card";
import AuxPane from "./components/aux-pane";

type Model = { provider: string; id: string; name: string };
type Message = { id: string; role: string; content: string; provider?: string; model?: string };
type Project = { id: string; name: string; path: string };
type RuleItem = { id: string; name: string; systemPrompt: string };

async function api(path: string, body?: unknown, method?: string) {
  const r = await fetch("/api/" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || r.statusText);
  return d;
}

export function AccountPanel({ lang, limitsOnly = false }: { lang: string; limitsOnly?: boolean }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [notice, setNotice] = useState("");
  const t = (r: string, e: string) => (lang === "ru" ? r : e);

  async function refresh() {
    try {
      setError("");
      const value = await api("accounts");
      setData(value);
      if (value.gemini.connected || value.gemini.signedIn) {
        setAuthPending(false);
        setAuthCode("");
        setNotice("");
      } else if (value.gemini.authPending) setAuthPending(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60000);
    return () => clearInterval(id);
  }, []);

  async function login(provider: string) {
    setBusy(provider);
    setError("");
    try {
      const result = await api("accounts", { provider });
      if (result.browserLogin) {
        setNotice(t("Окно Chrome открыто. Войдите в аккаунт сервиса; затем нажмите «Обновить».", "Chrome is open. Sign in to the service, then refresh."));
      }
      if (result.awaitingCode) {
        setAuthPending(true);
        setNotice(t("Завершите вход в браузере и вставьте выданный Google код ниже.", "Finish signing in in your browser and paste the Google code below."));
      }
      if (result.authUrl) {
        const bridge = window.desktop as any;
        if (bridge?.openAuthUrl) await bridge.openAuthUrl(result.authUrl);
        else window.open(result.authUrl, "_blank", "noopener,noreferrer");
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function submitGoogleCode() {
    setBusy("gemini");
    setError("");
    try {
      await api("accounts", { provider: "gemini", code: authCode.trim() });
      setAuthCode("");
      setNotice(t("Google проверяет вход…", "Google is verifying sign-in…"));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="account-integrations">
      <div className="section-heading">
        <h2>{t(limitsOnly ? "Лимиты аккаунтов" : "Подключения по подписке", limitsOnly ? "Account limits" : "Subscription connections")}</h2>
        <button className="secondary" onClick={() => void refresh()}>
          <RefreshCw size={15} />
          {t("Обновить", "Refresh")}
        </button>
      </div>
      {error && <div className="alert">{error}</div>}
      {notice && <p className="muted">{notice}</p>}
      {!data ? (
        <div className="empty">
          <LoaderCircle className="spin" />
          {t("Проверяем подключения…", "Checking connections…")}
        </div>
      ) : (
        <div className="settings-grid">
          {(["openai", "gemini", "grok"] as const).map(provider => {
            const p = data[provider];
            if (!p) return null;
            return (
              <section className="panel" key={provider}>
                <div className="section-heading">
                  <h2>{provider === "openai" ? "ChatGPT / Codex" : provider === "grok" ? "Grok" : "Gemini"}</h2>
                  <span className="pill">
                    {p.connected
                      ? t("Подключён", "Connected")
                      : p.signedIn
                        ? t("Доступ ограничен", "Access restricted")
                        : t("Требуется вход", "Sign-in required")}
                  </span>
                </div>
                <p className="muted">
                  {provider === "openai"
                    ? t("Подписка ChatGPT через Codex. Используется аккаунт, в который выполнен вход на этом компьютере.", "ChatGPT subscription through Codex. Uses the account signed in on this computer.")
                    : provider === "grok"
                      ? t("Аккаунт Grok (grok.com / X) без API-ключей. Войдите в открывшемся окне Chrome; лимиты запросов считываются из сессии аккаунта.", "Grok account (grok.com / X) without API keys. Sign in to your account; rate limits are read from the session.")
                      : t("Gemini через официальный Antigravity. Войдите подходящим аккаунтом Google; модели и доступ проверяются после входа.", "Gemini through official Antigravity. Sign in with an eligible Google account.")}
                </p>
                {p.error && <p className="alert">{p.error}</p>}
                {provider === "gemini" && (authPending || p.authPending) && (
                  <div className="google-auth-form">
                    <p className="muted">{notice || t("Вставьте код, который показал Google после входа.", "Paste the code shown by Google after sign-in.")}</p>
                    <input
                      type="password"
                      autoComplete="off"
                      aria-label={t("Код авторизации Google", "Google authorization code")}
                      placeholder="4/…"
                      value={authCode}
                      onChange={e => setAuthCode(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") void submitGoogleCode();
                      }}
                    />
                    <button className="secondary" disabled={!!busy || !authCode.trim()} onClick={() => void submitGoogleCode()}>
                      {t("Завершить вход", "Complete sign-in")}
                    </button>
                  </div>
                )}
                {p.modelNotice && <p className="muted">{p.modelNotice}</p>}
                {p.authError && <p className="alert">{p.authError}</p>}
                {!limitsOnly && (!p.connected || provider !== "openai") && (
                  <button className="primary" disabled={!!busy} onClick={() => void login(provider)}>
                    {busy === provider ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}{" "}
                    {t("Войти через аккаунт", "Sign in with account")}
                  </button>
                )}
                {p.plan && (
                  <p className="muted">
                    {t("План", "Plan")}: {p.plan}
                  </p>
                )}
                {p.limitReport && <GeminiQuotas report={p.limitReport} lang={lang} />}
                {p.limits ? (
                  Object.entries(p.limits).map(([key, bucket]: [string, any]) => (
                    <div key={key} className="quota-bucket">
                      <strong>{bucket.limitName || key}</strong>
                      {(["primary", "secondary"] as const).map(slot => {
                        const w = bucket[slot];
                        return w && typeof w.usedPercent === "number" ? (
                          <div className="quota-window" key={slot}>
                            <div>
                              <span>{w.label || (w.windowDurationMins ? `${w.windowDurationMins / 60} ${t("ч", "h")}` : t("Окно", "Window"))}</span>
                              <strong>
                                {Math.max(0, 100 - w.usedPercent)}% {t("осталось", "remaining")}
                                {typeof w.remainingQueries === "number" && typeof w.totalQueries === "number"
                                  ? ` · ${w.remainingQueries}/${w.totalQueries}`
                                  : ""}
                              </strong>
                            </div>
                            <QuotaPie remaining={100 - w.usedPercent} lang={lang} />
                            <small>
                              {t("Обновление", "Resets")}: {w.resetsAt ? new Date(w.resetsAt * 1000).toLocaleString(lang === "ru" ? "ru-RU" : "en-US") : "—"}
                            </small>
                          </div>
                        ) : null;
                      })}
                    </div>
                  ))
                ) : (
                  !p.limitReport && <p className="muted">{t("Лимиты не получены. Это не означает безлимитный доступ.", "Limits not reported. This does not mean unlimited access.")}</p>
                )}
                {p.limitError && <p className="muted">{p.limitError}</p>}
                {!limitsOnly && p.models?.length > 0 && (
                  <details>
                    <summary>
                      {t("Модели подключения", "Connection models")} · {p.models.length}
                    </summary>
                    <div className="model-catalog">
                      {p.models.map((m: any) => (
                        <span key={m.id}>{m.name}</span>
                      ))}
                    </div>
                  </details>
                )}
              </section>
            );
          })}
        </div>
      )}
      <p className="muted">
        {t("Показаны только значения, возвращённые сервисом. Лимиты Antigravity показаны в отчёте сервиса.", "Only service-reported values are shown. Antigravity limits appear in the service report.")}
        {data?.checkedAt && " · " + new Date(data.checkedAt).toLocaleTimeString()}
      </p>
    </div>
  );
}

const SLASH_COMMANDS = [
  {
    cmd: "/plan",
    ru: "Составить подробный план перед правками",
    en: "Draft a step-by-step plan before editing",
    fillRu: "Сначала изучи задачу и составь краткий пошаговый план реализации с рисками, ничего не меняя без согласования:\n",
    fillEn: "Analyze the task first and propose a concise step-by-step implementation plan:\n",
  },
  {
    cmd: "/review",
    ru: "Код-ревью: ошибки, безопасность, регрессии",
    en: "Code review: bugs, security, regressions",
    fillRu: "Проведи внимательное ревью кода: укажи реальные ошибки, уязвимости и краевые случаи с точными путями и строками:\n",
    fillEn: "Perform a thorough code review focusing on bugs, security, and edge cases:\n",
  },
  {
    cmd: "/fix",
    ru: "Найти первопричину ошибки и исправить",
    en: "Diagnose root cause and fix",
    fillRu: "Найди точную первопричину проблемы, проверь связанные файлы и предложи минимальное надёжное исправление:\n",
    fillEn: "Diagnose the exact root cause and apply a minimal, safe fix:\n",
  },
  { cmd: "/agent", ru: "Включить агентский режим «Работа на ПК»", en: "Enable Agent (Work on PC) mode", action: "agent" as const },
  { cmd: "/compare", ru: "Сравнить ChatGPT и Gemini параллельно", en: "Compare ChatGPT + Gemini side by side", action: "compare" as const },
  { cmd: "/team", ru: "Совместный синтез ChatGPT + Gemini", en: "Team synthesis (ChatGPT + Gemini)", action: "team" as const },
];

export default function HubChat({ lang }: { lang: string }) {
  const t = (r: string, e: string) => (lang === "ru" ? r : e);
  const [sidebarTarget,setSidebarTarget]=useState<HTMLElement|null>(null);
  useEffect(()=>{setSidebarTarget(document.getElementById("hub-project-sidebar"));},[]);
  useEffect(()=>{const fresh=()=>newChat(),aux=()=>setAuxOpen(v=>!v),search=()=>document.querySelector<HTMLInputElement>(".ag-rail-search")?.focus();window.addEventListener("hub-new-chat",fresh);window.addEventListener("hub-toggle-aux",aux);window.addEventListener("hub-search",search);return()=>{window.removeEventListener("hub-new-chat",fresh);window.removeEventListener("hub-toggle-aux",aux);window.removeEventListener("hub-search",search);};});
  const [accounts, setAccounts] = useState<any>(null);
  const [chats, setChats] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [chatFilter, setChatFilter] = useState("");
  const [chatId, setChatId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [targets, setTargets] = useState<string[]>([]);
  const [mode, setMode] = useState("single");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [picker, setPicker] = useState(false);
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [work, setWork] = useState(false);
  const [workDir, setWorkDir] = useState("");
  const [approval, setApproval] = useState<any>(null);
  const [deciding, setDeciding] = useState(false);
  const [workStatus, setWorkStatus] = useState("");
  const [auxOpen, setAuxOpen] = useState(false);

  const [slashOpen, setSlashOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionFiles, setMentionFiles] = useState<string[]>([]);

  const bottom = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentId = useRef("");
  const followBottom = useRef(true);
  const busyRef = useRef(false);
  busyRef.current = busy;

  const models: Model[] = accounts
    ? ["openai", "gemini", "grok"].flatMap(provider =>
        accounts[provider]?.connected
          ? (accounts[provider].models || []).map((m: any) => ({ ...m, provider }))
          : []
      )
    : [];
  const key = (m: Model) => m.provider + ":" + m.id;

  async function refresh() {
    try {
      const [a, c, p, ag] = await Promise.all([
        api("accounts"),
        api("chats"),
        api("projects").catch(() => ({ projects: [] })),
        api("agents").catch(() => ({ agents: [] })),
      ]);
      setAccounts(a);
      setChats(c.chats || []);
      setProjects(p.projects || []);
      setRules(ag.agents || []);
      setTargets(old =>
        old.length
          ? old
          : a.openai.connected
            ? [`openai:${a.openai.models.find((m: any) => m.id === "gpt-6-astra")?.id || a.openai.models[0]?.id}`]
            : a.gemini.connected && a.gemini.models.length
              ? [`gemini:${a.gemini.models.find((m: any) => m.id === "gemini-4-argon-medium")?.id || a.gemini.models[0].id}`]
              : []
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !busyRef.current) void refresh();
    }, 60000);
    const visible = () => {
      if (document.visibilityState === "visible" && !busyRef.current) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  useEffect(() => {
    if (!followBottom.current) return;
    const frame = requestAnimationFrame(() => {
      const pane = bottom.current?.parentElement;
      if (pane) pane.scrollTop = pane.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages]);

  useEffect(() => {
    if (mentionQuery === null || !workDir.trim()) {
      setMentionFiles([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/workspace?dir=${encodeURIComponent(workDir)}&find=${encodeURIComponent(mentionQuery)}`, { signal: ctrl.signal })
        .then(r => (r.ok ? r.json() : { files: [] }))
        .then(d => setMentionFiles(d.files || []))
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [mentionQuery, workDir]);

  async function saveProject(dirPath: string) {
    if (!dirPath.trim()) return;
    try {
      const d = await api("projects", { path: dirPath.trim() });
      setWorkDir(d.project.path);
      const p = await api("projects");
      setProjects(p.projects || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function pickNativeFolder(activateWork = true) {
    try {
      const picked = await (window.desktop as any)?.pickDirectory?.();
      if (!picked) return;
      setWorkDir(picked);
      if (activateWork) {
        setWork(true);
        setMode("single");
        setTargets(old => old.slice(0, 1));
      }
      await saveProject(picked);
      if (typeof window !== "undefined" && window.innerWidth >= 1260) setAuxOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeProject(id: string) {
    try {
      await api("projects", { id }, "DELETE");
      setProjects(old => old.filter(x => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function openChat(id: string) {
    if (busy) return;
    try {
      const d = await api("chats/" + id);
      setChatId(id);
      currentId.current = id;
      setMessages(d.messages);
      if (d.chat?.projectPath) setWorkDir(d.chat.projectPath);
      setFiles([]);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeChat(id: string) {
    if (busy) return;
    try {
      await api("chats/" + id, undefined, "DELETE");
      setChats(old => old.filter(c => c.id !== id));
      if (chatId === id) newChat();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function newChat() {
    if (busy) return;
    setWork(false);
    setChatId("");
    currentId.current = "";
    setMessages([]);
    setPrompt("");
    setFiles([]);
    setError("");
  }

  function selectBothProviders(nextMode: "compare" | "team") {
    const o = models.find(m => m.provider === "openai" && m.id === "gpt-6-astra") || models.find(m => m.provider === "openai");
    const g = models.find(m => m.provider === "gemini" && m.id === "gemini-4-argon-medium") || models.find(m => m.provider === "gemini");
    setWork(false);
    setMode(nextMode);
    const pair = [o && key(o), g && key(g)].filter(Boolean) as string[];
    if (pair.length >= 2) setTargets(pair);
    else if (models.length >= 2) setTargets([key(models[0]), key(models[1])]);
    setPicker(false);
  }

  function applySlash(item: (typeof SLASH_COMMANDS)[number]) {
    setSlashOpen(false);
    if (item.action === "agent") {
      setWork(true);
      setMode("single");
      setTargets(old => old.slice(0, 1));
      if (prompt.trim() === "/agent") setPrompt("");
      return;
    }
    if (item.action === "compare" || item.action === "team") {
      selectBothProviders(item.action);
      if (prompt.trim().startsWith("/")) setPrompt("");
      return;
    }
    const prefix = lang === "ru" ? item.fillRu : item.fillEn;
    setPrompt(old => {
      const rest = old.replace(/^\/[a-z]*\s*/i, "");
      return (prefix || "") + rest;
    });
    textareaRef.current?.focus();
  }

  function insertMention(token: string) {
    setMentionQuery(null);
    setPrompt(old => {
      const replaced = old.replace(/@[^\s@]*$/, `@${token} `);
      return replaced === old ? (old ? `${old} @${token} ` : `@${token} `) : replaced;
    });
    textareaRef.current?.focus();
  }

  function handlePromptChange(val: string) {
    setPrompt(val);
    setSlashOpen(/^\/[a-z]*$/i.test(val.trim()));
    const atMatch = val.match(/(?:^|\s)@([^\s@]*)$/);
    setMentionQuery(atMatch ? atMatch[1] : null);
  }

  async function send() {
    if (busy || uploading || !prompt.trim()) return;
    if (!targets.length) {
      setError(t("Подключите аккаунт и выберите модель.", "Connect an account and select a model."));
      return;
    }
    if (work && !workDir.trim()) {
      setError(t("Укажите полный путь к папке ПК.", "Enter an absolute PC folder path."));
      return;
    }
    if (mode !== "single" && targets.length < 2) {
      setError(t("Выберите минимум две модели.", "Select at least two models."));
      return;
    }
    followBottom.current = true;
    setSlashOpen(false);
    setMentionQuery(null);
    const text = prompt;
    setPrompt("");
    setError("");
    setBusy(true);
    setPicker(false);
    setMessages(old => [
      ...old,
      {
        id: "local-user-" + Date.now(),
        role: "user",
        content: text + (files.length ? "\n\n" + files.map(f => "[Файл] " + f.name).join("\n") : ""),
      },
    ]);

    try {
      const r = await fetch("/api/hub-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chatId || undefined,
          prompt: text,
          targets: targets.map(k => {
            const [provider, model] = k.split(":");
            return { provider, model };
          }),
          mode,
          work,
          workDir,
          fileIds: files.map(f => f.id),
        }),
      });
      if (!r.ok) {
        const d = await r.json();
        throw Error(d.error);
      }
      const reader = r.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const consume = (line: string) => {
        if (!line.trim()) return;
        const e = JSON.parse(line);
        if (e.type === "work-approval") {
          setApproval(e);
          setWorkStatus(t("Ожидает разрешения", "Awaiting approval"));
        }
        if (e.type === "work-status") setWorkStatus(e.text);
        if (e.type === "work-result") {
          setApproval(null);
          setMessages(old => [
            ...old,
            {
              id: "work-" + Date.now() + Math.random(),
              role: "assistant",
              provider: targets[0]?.split(":")[0],
              model: "Работа · журнал",
              content: JSON.stringify(e.action, null, 2) + "\n\n" + e.result,
            },
          ]);
        }
        const id = e.provider + ":" + e.model + ":" + e.stage;
        if (e.type === "start") {
          currentId.current = e.chatId;
          setChatId(e.chatId);
          setFiles([]);
        }
        if (e.type === "model-start") {
          setMessages(old => [
            ...old,
            {
              id,
              role: "assistant",
              provider: e.provider,
              model: e.model + (e.stage === "synthesis" ? " · " + t("Общий итог", "Synthesis") : ""),
              content: "",
            },
          ]);
        }
        if (e.type === "delta") setMessages(old => old.map(m => (m.id === id ? { ...m, content: m.content + e.text } : m)));
        if (e.type === "model-done") setMessages(old => old.map(m => (m.id === id ? { ...m, content: e.text } : m)));
        if (e.type === "model-error") {
          setMessages(old => old.map(m => (m.id === id ? { ...m, model: "error", content: e.error } : m)));
          setError(e.error);
        }
        if (e.type === "warning" || e.type === "error") setError(e.text || e.error);
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf("\n")) >= 0) {
          consume(buffer.slice(0, end));
          buffer = buffer.slice(end + 1);
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) consume(buffer);
      if (currentId.current) {
        const d = await api("chats/" + currentId.current);
        setMessages(d.messages);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPrompt(text);
    } finally {
      setBusy(false);
      setApproval(null);
      setDeciding(false);
      setWorkStatus("");
    }
  }

  async function decide(allow: boolean) {
    if (!approval || deciding) return;
    setDeciding(true);
    try {
      await api("work", { id: approval.id, allow });
      setApproval(null);
    } catch (e) {
      setApproval(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeciding(false);
    }
  }

  async function upload(list: FileList | File[] | null) {
    if (!list || !list.length) return;
    const arr = Array.from(list);
    setUploading(true);
    try {
      if (files.length + arr.length > 3) throw Error(t("Не более трёх файлов.", "Up to three files."));
      const added: { id: string; name: string }[] = [];
      for (const file of arr) {
        const form = new FormData();
        form.append("file", file);
        const r = await fetch("/api/files", { method: "POST", body: form });
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        added.push({ id: d.id, name: file.name });
      }
      setFiles(old => [...old, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function attachWorkspaceFile(name: string, content: string) {
    const blob = new File([content], name, { type: "text/plain" });
    await upload([blob]);
  }

  const visibleChats = useMemo(
    () =>
      chatFilter.trim()
        ? chats.filter(c => (c.title || "").toLowerCase().includes(chatFilter.toLowerCase()))
        : chats,
    [chats, chatFilter]
  );

  const hasDesktopPicker = typeof window !== "undefined" && Boolean((window.desktop as any)?.pickDirectory);
  const matchingSlash = slashOpen
    ? SLASH_COMMANDS.filter(s => s.cmd.startsWith(prompt.trim().toLowerCase()))
    : [];
  const matchingRules =
    mentionQuery !== null
      ? rules.filter(r => r.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
      : [];

  return (
    <div className={"hub-layout" + (auxOpen ? " with-aux" : "")}>
      {sidebarTarget&&createPortal(<aside className="hub-history">
        <div className="ag-sidebar-head">
          <strong>Hub</strong>
          <span>GPT · Gemini · Grok</span>
        </div>

        <button className="secondary ag-new-chat" onClick={newChat} disabled={busy}>
          <Plus size={16} />
          {t("Новый чат", "New chat")}
        </button>

        <div className="ag-projects-box">
          <div className="ag-rail-heading">
            <span>{t("ПРОЕКТЫ", "PROJECTS")}</span>
            {hasDesktopPicker && (
              <button
                type="button"
                className="ag-mini-add"
                disabled={busy}
                onClick={() => void pickNativeFolder(true)}
                title={t("Открыть папку проекта", "Open project folder")}
              >
                <Plus size={13} /> {t("Папка", "Folder")}
              </button>
            )}
          </div>
          {projects.length > 0 ? (
            <div className="ag-project-list">
              {projects.map(proj => {
                const active = workDir.toLowerCase() === proj.path.toLowerCase();
                return (
                  <div key={proj.id} className={"ag-project-row" + (active ? " active" : "")}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setWorkDir(proj.path);
                        setWork(true);
                        setMode("single");
                        setTargets(old => old.slice(0, 1));
                        if (typeof window !== "undefined" && window.innerWidth >= 1260) setAuxOpen(true);
                      }}
                      title={proj.path}
                    >
                      <FolderGit2 size={14} />
                      <span>{proj.name}</span>
                    </button>
                    <button
                      type="button"
                      className="ag-row-del"
                      aria-label={t("Убрать проект", "Remove project")}
                      onClick={() => void removeProject(proj.id)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="ag-rail-hint">
              {t("Добавьте рабочую папку ПК для проводника и агента.", "Add a PC workspace folder for Explorer & Agent.")}
            </p>
          )}
        </div>

        <div className="ag-rail-heading">
          <span>{t("ДИАЛОГИ", "CONVERSATIONS")}</span>
        </div>
        {chats.length > 0 && (
          <input
            className="ag-rail-search"
            value={chatFilter}
            onChange={e => setChatFilter(e.target.value)}
            placeholder={t("Фильтр диалогов…", "Filter chats…")}
            aria-label={t("Фильтр диалогов", "Filter chats")}
          />
        )}
        <div className="hub-chat-list">
          {visibleChats.map(c => (
            <div key={c.id} className={"ag-chat-item" + (chatId === c.id ? " selected" : "")}>
              <button disabled={busy} className={chatId === c.id ? "selected" : ""} onClick={() => void openChat(c.id)}>
                <MessageSquare size={15} />
                <span>{c.title}</span>
              </button>
              <button
                type="button"
                className="ag-row-del"
                disabled={busy}
                aria-label={t("Удалить чат", "Delete chat")}
                onClick={() => void removeChat(c.id)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        <small>{t("Общий контекст ChatGPT, Gemini и Grok сохраняется при смене модели.", "Shared ChatGPT, Gemini & Grok context stays across turns.")}</small>
      </aside>,sidebarTarget)}

      <section
        className={"hub-conversation" + (dragging ? " is-dragging" : "")}
        onDragOver={e => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={e => {
          if (e.currentTarget === e.target) setDragging(false);
        }}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          if (!busy && e.dataTransfer.files?.length) void upload(e.dataTransfer.files);
        }}
      >
        <div className="ag-canvas-header"><div className="reference-breadcrumb">{projects.find(p=>p.path===workDir)?.name||t("Рабочее пространство","Workspace")}{chatId&&<> <span>/</span> {chats.find(c=>c.id===chatId)?.title}</>}</div>

          <div className="ag-header-actions">

            <button className="icon-button" onClick={() => void refresh()} aria-label={t("Обновить модели", "Refresh models")}>
              <RefreshCw size={15} />
            </button>

            <button
              type="button"
              className={"icon-button ag-pane-toggle" + (auxOpen ? " active" : "")}
              onClick={() => setAuxOpen(!auxOpen)}
              aria-label={t("Панель проекта", "Workspace pane")}
              title={t("Проводник, изменения, терминал и квоты", "Files, changes, terminal & quotas")}
            >
              <PanelRight size={16} />
            </button>
          </div>
        </div>

        {work && (
          <div className="work-controls">
            <FolderOpen size={14} className="ag-folder-icon" />
            <input
              aria-label={t("Рабочая папка ПК", "PC working folder")}
              placeholder="C:\Users\…\Project"
              value={workDir}
              disabled={busy}
              onChange={e => setWorkDir(e.target.value)}
            />
            {hasDesktopPicker && (
              <button type="button" className="secondary" disabled={busy} onClick={() => void pickNativeFolder(true)}>
                {t("Выбрать папку…", "Choose folder…")}
              </button>
            )}
            {workDir.trim() && !projects.some(p => p.path.toLowerCase() === workDir.trim().toLowerCase()) && (
              <button
                type="button"
                className="icon-button"
                disabled={busy}
                onClick={() => void saveProject(workDir)}
                title={t("Сохранить папку в проекты", "Save folder to Projects")}
                aria-label={t("Сохранить папку в проекты", "Save folder to Projects")}
              >
                <BookmarkPlus size={15} />
              </button>
            )}
          </div>
        )}

        {workStatus && (
          <div className="work-status" role="status">
            <LoaderCircle size={13} className="spin" />
            <span>{workStatus}</span>
          </div>
        )}

        {approval && <ApprovalCard approval={approval} deciding={deciding} lang={lang} onDecide={allow => void decide(allow)} />}

        <div
          className="hub-messages"
          onScroll={e => {
            const pane = e.currentTarget;
            followBottom.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 80;
          }}
        >
          {!messages.length && (
            <div className="hub-welcome"><div className="reference-mark" aria-hidden="true">H</div><h2>{t("Привет, что сделаем сегодня?","Hi, what can we get done today?")}</h2></div>
          )}

          {messages.map(m => {
            const isJournal = m.model === "Работа · журнал";
            if (isJournal) {
              return (
                <div key={m.id} className="hub-message assistant journal-entry">
                  <StepCard content={m.content} provider={m.provider} lang={lang} />
                </div>
              );
            }
            return (
              <article key={m.id} className={"hub-message " + m.role + (m.model === "error" ? " failed" : "")}>
                <div className="message-heading">
                  <strong>
                    {m.role === "user"
                      ? t("Вы", "You")
                      : m.model === "error"
                        ? t("Ошибка модели", "Model error")
                        : m.model || m.provider || "AI"}
                  </strong>
                  {m.role !== "user" && m.provider && <small>{m.provider}</small>}
                  <button
                    className="icon-button"
                    aria-label={t("Копировать ответ", "Copy answer")}
                    onClick={() => void navigator.clipboard.writeText(m.content).catch(e => setError(String(e)))}
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <div className="message-body">{m.content ? <MessageMarkdown text={m.content} /> : <LoaderCircle className="spin" size={19} />}</div>
              </article>
            );
          })}
          <div ref={bottom} />
        </div>

        {error && (
          <div className="hub-error" role="alert">
            <span>{error}</span>
            <button className="icon-button" onClick={() => setError("")} aria-label={t("Закрыть ошибку", "Dismiss error")}>
              <X size={15} />
            </button>
          </div>
        )}

        <div className="hub-compose">
          {picker && (
            <div className="hub-model-picker">
              <div className="provider-switch" aria-label={t("Выбор провайдера", "Provider selection")}>
                {(["openai", "gemini", "grok"] as const).map(provider => (
                  <button
                    key={provider}
                    disabled={busy}
                    className={targets.some(k => k.startsWith(provider + ":")) ? "selected" : ""}
                    onClick={() => {
                      const available = models.filter(m => m.provider === provider);
                      if (!available.length) {
                        setError(
                          accounts?.[provider]?.error ||
                            t("Подключение проверяется. Откройте «Настройки → Аккаунты» для входа.", "Checking connection. Open Settings → Accounts to sign in.")
                        );
                        void refresh();
                        return;
                      }
                      const chosen =
                        available.find(m =>
                          provider === "gemini"
                            ? m.id === "gemini-4-argon-medium"
                            : provider === "grok"
                              ? m.id === "grok-4"
                              : m.id === "gpt-6-astra"
                        ) || available[0];
                      setMode("single");
                      setTargets([key(chosen)]);
                      setError("");
                      setPicker(false);
                    }}
                  >
                    <span className={"ag-conn-dot" + (accounts?.[provider]?.connected ? " on" : "")} />
                    <strong>{provider === "gemini" ? "Gemini" : provider === "grok" ? "Grok" : "ChatGPT"}</strong>
                    <small>
                      {!accounts
                        ? t("Проверка…", "Checking…")
                        : accounts[provider]?.connected
                          ? t("Подключён", "Connected")
                          : t("Нет подключения", "Disconnected")}
                    </small>
                  </button>
                ))}
              </div>

              {models.map(m => (
                <button
                  key={key(m)}
                  className={targets.includes(key(m)) ? "selected" : ""}
                  onClick={() => {
                    const k = key(m);
                    setTargets(old => (mode === "single" ? [k] : old.includes(k) ? old.filter(x => x !== k) : [...old, k].slice(0, 3)));
                    if (mode === "single") setPicker(false);
                  }}
                >
                  <span>
                    <strong>{m.name}</strong>
                    <small>{m.provider === "openai" ? "ChatGPT · Codex" : m.provider === "grok" ? "Grok · Аккаунт" : "Google · Antigravity"}</small>
                  </span>
                  {targets.includes(key(m)) && <Check size={16} />}
                </button>
              ))}
              {!accounts?.gemini?.connected && (
                <p>
                  {accounts?.gemini?.error ||
                    t(
                      "Gemini 4 Argon: требуется вход Google в разделе «Аккаунты». Доступ к модели будет проверен после входа.",
                      "Gemini 4 Argon: sign in with Google under Accounts. Model access will be checked after sign-in."
                    )}
                </p>
              )}
              {!models.length && <p>{t("Нет подключённых моделей. Откройте «Аккаунты».", "No connected models. Open Accounts.")}</p>}
            </div>
          )}

          {matchingSlash.length > 0 && (
            <div className="ag-popup-menu" role="listbox" aria-label={t("Быстрые команды", "Slash commands")}>
              {matchingSlash.map(item => (
                <button key={item.cmd} type="button" onClick={() => applySlash(item)}>
                  <code>{item.cmd}</code>
                  <span>{lang === "ru" ? item.ru : item.en}</span>
                </button>
              ))}
            </div>
          )}

          {mentionQuery !== null && (mentionFiles.length > 0 || matchingRules.length > 0) && (
            <div className="ag-popup-menu" role="listbox" aria-label={t("Упоминание контекста", "Context mentions")}>
              {matchingRules.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setMentionQuery(null);
                    setPrompt(old => old.replace(/@[^\s@]*$/, "") + `\n[Правило ${r.name}]: ${r.systemPrompt}\n`);
                    textareaRef.current?.focus();
                  }}
                >
                  <code>@{r.name}</code>
                  <span>{t("Инструкция", "Instruction")}</span>
                </button>
              ))}
              {mentionFiles.slice(0, 12).map(fp => (
                <button key={fp} type="button" onClick={() => insertMention(fp)}>
                  <code>@{fp}</code>
                  <span>{t("Файл проекта", "Workspace file")}</span>
                </button>
              ))}
            </div>
          )}

          {files.length > 0 && (
            <div className="file-chips">
              {files.map(f => (
                <span key={f.id}>
                  <FileText size={14} />
                  {f.name}
                  <button
                    disabled={busy}
                    aria-label={t("Убрать файл", "Remove file")}
                    onClick={() => setFiles(old => old.filter(x => x.id !== f.id))}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={prompt}
            disabled={busy}
            aria-label={t("Сообщение", "Message")}
            placeholder={t(
              "Спросите что угодно, @ — контекст, / — действия",
              "Ask anything, @ to mention, / for actions"
            )}
            onChange={e => handlePromptChange(e.target.value)}
            onPaste={e => {
              const pasted = Array.from(e.clipboardData.files || []);
              if (pasted.length > 0) void upload(pasted);
            }}
            onKeyDown={e => {
              if (e.key === "Escape") {
                setSlashOpen(false);
                setMentionQuery(null);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                if (matchingSlash.length === 1 && prompt.trim() === matchingSlash[0].cmd) {
                  e.preventDefault();
                  applySlash(matchingSlash[0]);
                  return;
                }
                e.preventDefault();
                void send();
              }
            }}
          />

          <div className="compose-actions">
            <label className="attach-button" title={t("Прикрепить файл", "Attach file")}>
              <Paperclip size={16} />
              <span>{uploading ? t("…", "…") : t("Файл", "File")}</span>
              <input
                type="file"
                multiple
                disabled={busy || uploading}
                accept=".pdf,.docx,.png,.jpg,.jpeg,.txt,.md,.csv,.json,.log,.ts,.tsx,.js,.py,.html,.css"
                onChange={e => {
                  void upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              className="ag-hint-btn"
              disabled={busy}
              onClick={() => {
                setPrompt(old => (old.startsWith("/") ? old : "/" + old));
                setSlashOpen(true);
                textareaRef.current?.focus();
              }}
              title={t("Быстрые команды /", "Slash commands /")}
            >
              <Slash size={13} />
            </button>
            <button
              type="button"
              className="ag-hint-btn"
              disabled={busy}
              onClick={() => {
                setPrompt(old => (old.endsWith("@") ? old : (old ? old + " @" : "@")));
                setMentionQuery("");
                textareaRef.current?.focus();
              }}
              title={t("Упомянуть файл или правило @", "Mention file or rule @")}
            >
              <AtSign size={13} />
            </button>

            <button type="button" className="model-trigger" disabled={busy} onClick={() => setPicker(!picker)}>
              <Sparkles size={13} />
              <span>
                {targets.length === 1
                  ? models.find(m => key(m) === targets[0])?.name || targets[0].split(":")[1]
                  : t("Моделей: ", "Models: ") + targets.length}
              </span>
              <ChevronDown size={13} />
            </button>

            <select
              className="ag-mode-select"
              aria-label={t("Режим работы", "Chat mode")}
              disabled={busy || work}
              value={mode}
              onChange={e => {
                setMode(e.target.value);
                if (e.target.value === "single") setTargets(targets.slice(0, 1));
              }}
            >
              <option value="single">{t("Одна модель", "Single")}</option>
              <option value="compare">{t("Сравнить", "Compare")}</option>
              <option value="team">{t("Синтез", "Team")}</option>
            </select>

            <label className={"ag-agent-pill" + (work ? " active" : "")}>
              <input
                type="checkbox"
                checked={work}
                disabled={busy}
                onChange={e => {
                  setWork(e.target.checked);
                  if (e.target.checked) {
                    setMode("single");
                    setTargets(targets.slice(0, 1));
                    if (!workDir && projects[0]?.path) setWorkDir(projects[0].path);
                    if (typeof window !== "undefined" && window.innerWidth >= 1220) setAuxOpen(true);
                  }
                }}
              />
              <TerminalSquare size={14} />
              {t("Работа на ПК", "Work on PC")}
            </label>

            {busy ? (
              <button
                className="send-button stop"
                aria-label={t("Остановить", "Stop")}
                onClick={() => void api("hub-chat", { chatId: currentId.current }, "DELETE").catch(e => setError(String(e)))}
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                className="send-button"
                disabled={!prompt.trim() || !targets.length || uploading}
                aria-label={t("Отправить", "Send")}
                onClick={() => void send()}
              >
                <ArrowUp size={17} />
              </button>
            )}
          </div>
        </div>

        <div className="hub-footnote">
          {t(
            "Подписки и аккаунты ChatGPT (Codex), Gemini (Antigravity) и Grok без API-ключей. Прямой выбор модели расходует квоту только выбранного сервиса.",
            "ChatGPT (Codex), Gemini (Antigravity) & Grok accounts without API keys. Selecting a single model spends only that provider's quota."
          )}
        </div>
      </section>

      {auxOpen && (
        <AuxPane
          workDir={workDir}
          messages={messages}
          accounts={accounts}
          lang={lang}
          onMentionFile={rel => insertMention(rel)}
          onAttachWorkspaceFile={attachWorkspaceFile}
          onClose={() => setAuxOpen(false)}
        />
      )}
    </div>
  );
}
