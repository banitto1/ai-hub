"use client";
import { useEffect, useState } from "react";
import {
  PanelLeft, ArrowLeft, ArrowRight, Clock3, BriefcaseBusiness,
  Copy,
  Gauge,
  KeyRound,
  LoaderCircle,
  MessageSquare,
  Monitor,
  Palette,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  X,
  Check,
} from "lucide-react";
import PhonePanel from "./phone-panel";
import HubChat, { AccountPanel } from "./hub-chat";

declare global {
  interface Window {
    desktop?: {
      openService: (id: string, external?: boolean) => Promise<void>;
      clearService: (id: string) => Promise<void>;
      pickDirectory?: () => Promise<string | null>;
      zoom: (value: number) => Promise<void>;
    };
  }
}

type Agent = { id: string; name: string; systemPrompt: string };
type Lang = "ru" | "en";
type SettingsTab = "general" | "limits" | "accounts" | "phone";

// Antigravity 2.0 layout: Chat, Skills & rules, Settings. Limits, accounts and phone live inside Settings.
const navigation = [
  { id: "chat", ru: "Чат", en: "Chat", icon: MessageSquare },
  { id: "agents", ru: "Навыки и правила", en: "Skills & rules", icon: Sparkles },
  { id: "settings", ru: "Настройки", en: "Settings", icon: Settings2 },
] as const;

const settingsTabs: { id: SettingsTab; ru: string; en: string; icon: typeof Gauge }[] = [
  { id: "general", ru: "Общие", en: "General", icon: Palette },
  { id: "limits", ru: "Лимиты", en: "Limits", icon: Gauge },
  { id: "accounts", ru: "Аккаунты", en: "Accounts", icon: KeyRound },
  { id: "phone", ru: "Телефон", en: "Phone", icon: Smartphone },
];

async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch("/api/" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || String(r.status));
  return d;
}

export default function Home() {
  const [lang, setLang] = useState<Lang>("ru");
  const [tab, setTab] = useState<string>("chat");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [query, setQuery] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentText, setAgentText] = useState("");
  const [zoom, setZoom] = useState(1);
  const [motion, setMotion] = useState(true);
  const [glass, setGlass] = useState(true);
  const [collapsed,setCollapsed]=useState(false);

  const t = (ru: string, en: string) => (lang === "ru" ? ru : en);

  async function refreshAgents() {
    const d = await api("agents");
    setAgents(d.agents || []);
  }

  async function act(fn: () => Promise<void>) {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    async function boot() {
      try {
        setCollapsed(window.innerWidth <= 900);
        const prefs = JSON.parse(localStorage.getItem("aihub-preferences") || "{}");
        if (prefs.lang === "en") setLang("en");
        const z = [1, 1.1, 1.2, 1.3].includes(prefs.zoom) ? prefs.zoom : 1;
        setZoom(z);
        await window.desktop?.zoom(z);
        if (prefs.motion === false) setMotion(false);
        if (prefs.glassVersion === 2 && prefs.glass === false) setGlass(false);
        const ticket = new URLSearchParams(location.hash.slice(1)).get("launch");
        history.replaceState(null, "", location.pathname);
        if (ticket) await api("auth", "POST", { ticket });
        const auth = await api("auth");
        if (!auth.authenticated) {
          setLocked(true);
          return;
        }
        await refreshAgents();
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    void boot();
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dataset.motion = motion ? "on" : "off";
    document.documentElement.dataset.glass = glass ? "on" : "off";
    if (ready) localStorage.setItem("aihub-preferences", JSON.stringify({ lang, zoom, motion, glass, glassVersion: 2 }));
  }, [lang, zoom, motion, glass, ready]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(id);
  }, [notice]);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setNotice(t("Скопировано", "Copied"));
  }

  if (!ready) {
    return (
      <div className="boot">
        <div className="ambient" aria-hidden="true" />
        <span className="brand-icon boot-logo">
          <Sparkles size={24} />
        </span>
        <h1>Hub</h1>
        {error ? (
          <p role="alert">{error}</p>
        ) : locked ? (
          <p>
            {t(
              "Сеанс не подключён. На компьютере откройте Hub. На телефоне создайте новый код в «Настройки → Телефон» и подключитесь снова.",
              "Session is not connected. Open Hub on your computer, or pair your phone again from Settings → Phone."
            )}
          </p>
        ) : (
          <p>
            <LoaderCircle className="spin" size={16} /> {t("Открываем рабочее пространство…", "Opening your workspace…")}
          </p>
        )}
      </div>
    );
  }

  const currentNav = navigation.find(n => n.id === tab);
  const visibleAgents = agents.filter(a => a.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <main className={"app-shell reference-shell"+(collapsed?" sidebar-collapsed":"")}>
      <header className="hub-menubar"><button onClick={()=>setTab("chat")}>Hub</button><details><summary>{t("Рабочее пространство","Workspace")}</summary><div><button onClick={()=>{setTab("chat");window.dispatchEvent(new Event("hub-new-chat"));}}>{t("Новый чат","New Conversation")}</button><button onClick={()=>setTab("agents")}>{t("Персонализация","Customizations")}</button><button onClick={()=>setTab("settings")}>{t("Настройки","Settings")}</button></div></details><details><summary>{t("Вид","View")}</summary><div><button onClick={()=>setCollapsed(!collapsed)}>{t("Боковая панель","Toggle Sidebar")}</button><button onClick={()=>{setTab("chat");window.dispatchEvent(new Event("hub-toggle-aux"));}}>{t("Панель проекта","Toggle Side Panel")}</button></div></details><details><summary>{t("Окно","Window")}</summary><div><button onClick={()=>void (window.desktop as any)?.windowAction("minimize")}>{t("Свернуть","Minimize")}</button><button onClick={()=>void (window.desktop as any)?.windowAction("maximize")}>{t("Развернуть / восстановить","Maximize / Restore")}</button></div></details></header>
      <div className="ambient" aria-hidden="true" />
      <aside className="sidebar">
        <div className="reference-sidebar-tools"><button className="hub-monogram" onClick={()=>setTab('chat')} aria-label="Hub">H</button><button aria-label="Toggle Sidebar" onClick={()=>setCollapsed(!collapsed)}><PanelLeft size={16}/></button><button aria-label="Назад к чату" onClick={()=>setTab('chat')}><ArrowLeft size={16}/></button><button aria-label="Поиск диалогов" onClick={()=>{setTab('chat');window.dispatchEvent(new Event('hub-search'));}}><Search size={16}/></button></div>
        <nav onClick={()=>{if(window.innerWidth<=900)setCollapsed(true);}}><button className="reference-new" aria-label={t('Чат','Chat')} onClick={()=>{setTab('chat');window.dispatchEvent(new Event('hub-new-chat'));}}><Plus size={16}/><span>{t('Новый чат','New Conversation')}</span></button><button onClick={()=>setTab('tasks')}><Clock3 size={16}/><span>{t('Автоматизации','Automations')}</span></button><button aria-label={t('Навыки и правила','Skills & rules')} onClick={()=>setTab('agents')}><BriefcaseBusiness size={16}/><span>{t('Персонализация','Customizations')}</span></button></nav>
        <div id="hub-project-sidebar"/>
        <button className="reference-settings" aria-label={t('Настройки','Settings')} onClick={()=>{setTab('settings');if(window.innerWidth<=900)setCollapsed(true);}}><Settings2 size={16}/><span>{t('Настройки','Settings')}</span></button>
      </aside>
      <button className="reference-backdrop" aria-label="Закрыть боковую панель" onClick={()=>setCollapsed(true)}/>
      <button className="reference-expand" aria-label="Открыть боковую панель" onClick={()=>setCollapsed(false)}><PanelLeft size={17}/></button>
      <section className="main-column">
        <div className={"content" + (tab === "chat" ? " content-chat" : "")}>
          {tab !== "chat" && (
            <div className="page-title">
              <div>
                <h1>{currentNav?.[lang]}</h1>
                <p>
                  {tab === "agents"
                    ? t("Правила и навыки для агента. Вставляются в сообщение через @.", "Rules and skills for the agent. Insert them into a message with @.")
                    : t("Внешний вид, лимиты подписок, аккаунты и подключение телефона.", "Appearance, subscription limits, accounts and phone pairing.")}
                </p>
              </div>
              {tab === "agents" && (
                <label className="search glass">
                  <Search size={15} />
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Найти…", "Search…")} aria-label={t("Поиск", "Search")} />
                </label>
              )}
            </div>
          )}

          {error && (
            <div className="alert" role="alert">
              {error}
              <button className="icon-button" onClick={() => setError("")} aria-label={t("Закрыть", "Dismiss")}>
                <X size={15} />
              </button>
            </div>
          )}

          <div className="page-enter">
            <div hidden={tab!=="chat"}><HubChat lang={lang} /></div>
            {tab === "tasks" && <section className="panel"><h2>{t("Автоматизации","Automations")}</h2><p>{t("Запуск по расписанию пока не подключён.","Scheduled execution is not connected yet.")}</p></section>}

            {tab === "agents" && (
              <>
                <section className="panel glass">
                  <form
                    className="instruction-form"
                    onSubmit={e => {
                      e.preventDefault();
                      void act(async () => {
                        await api("agents", "POST", { name: agentName, prompt: agentText, provider: "openai", model: "manual" });
                        setAgentName("");
                        setAgentText("");
                        await refreshAgents();
                        setNotice(t("Правило сохранено", "Rule saved"));
                      });
                    }}
                  >
                    <label>
                      {t("Название правила или навыка", "Rule or skill name")}
                      <input required maxLength={80} value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="typescript-strict" />
                    </label>
                    <label>
                      {t("Инструкция для агента", "Agent instruction")}
                      <textarea
                        required
                        maxLength={5000}
                        value={agentText}
                        onChange={e => setAgentText(e.target.value)}
                        placeholder={t("Стиль кода, ограничения или шаги выполнения…", "Coding conventions, constraints or steps…")}
                      />
                    </label>
                    <button className="primary">
                      <Plus size={15} />
                      {t("Сохранить правило", "Save rule")}
                    </button>
                  </form>
                </section>
                <div className="instructions">
                  {visibleAgents.map(a => (
                    <section className="panel glass" key={a.id}>
                      <h2>@{a.name}</h2>
                      <p className="instruction-text">{a.systemPrompt}</p>
                      <div className="row-actions">
                        <button className="secondary" onClick={() => void act(() => copy(a.systemPrompt))}>
                          <Copy size={14} />
                          {t("Скопировать", "Copy")}
                        </button>
                        <button
                          className="icon-button"
                          aria-label={t("Удалить правило", "Delete rule")}
                          onClick={() =>
                            void act(async () => {
                              await api("agents/" + a.id, "DELETE");
                              await refreshAgents();
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </section>
                  ))}
                  {!visibleAgents.length && <div className="empty">{t("Правил пока нет.", "No rules yet.")}</div>}
                </div>
              </>
            )}

            {tab === "settings" && (
              <div className="settings-layout">
                <div className="settings-nav glass" role="tablist" aria-label={t("Разделы настроек", "Settings sections")}>
                  {settingsTabs.map(s => (
                    <button
                      key={s.id}
                      role="tab"
                      aria-selected={settingsTab === s.id}
                      className={settingsTab === s.id ? "active" : ""}
                      onClick={() => setSettingsTab(s.id)}
                    >
                      <s.icon size={15} />
                      <span>{s[lang]}</span>
                    </button>
                  ))}
                </div>

                <div className="settings-body page-enter" key={settingsTab}>
                  {settingsTab === "general" && (
                    <section className="panel glass">
                      <h2>{t("Внешний вид", "Appearance")}</h2>
                      <div className="setting">
                        <div>
                          <strong>{t("Язык интерфейса", "Interface language")}</strong>
                          <p>{t("Язык оболочки и элементов управления", "Shell and controls language")}</p>
                        </div>
                        <select value={lang} onChange={e => setLang(e.target.value as Lang)} aria-label="Language">
                          <option value="ru">Русский</option>
                          <option value="en">English</option>
                        </select>
                      </div>
                      <div className="setting">
                        <div>
                          <strong>{t("Масштаб", "Scale")}</strong>
                          <p>{t("Размер текста и панелей окна", "Window text and panel scale")}</p>
                        </div>
                        <select
                          value={zoom}
                          onChange={e =>
                            void act(async () => {
                              const z = Number(e.target.value);
                              await window.desktop?.zoom(z);
                              setZoom(z);
                            })
                          }
                          aria-label={t("Масштаб", "Scale")}
                        >
                          {[1, 1.1, 1.2, 1.3].map(z => (
                            <option value={z} key={z}>
                              {Math.round(z * 100)}%
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="setting">
                        <div>
                          <strong>{t("Плавные анимации", "Smooth animations")}</strong>
                          <p>{t("Учитывается системное уменьшение движения", "Respects system reduced motion")}</p>
                        </div>
                        <button className={"toggle " + (motion ? "on" : "")} role="switch" aria-checked={motion} aria-label={t("Анимации", "Animations")} onClick={() => setMotion(!motion)}>
                          <span />
                        </button>
                      </div>
                      <div className="setting">
                        <div>
                          <strong>{t("Жидкое стекло", "Liquid glass")}</strong>
                          <p>{t("Полупрозрачные панели с размытием. Отключите на слабом ПК.", "Translucent blurred panels. Turn off on slow hardware.")}</p>
                        </div>
                        <button className={"toggle " + (glass ? "on" : "")} role="switch" aria-checked={glass} aria-label={t("Жидкое стекло", "Liquid glass")} onClick={() => setGlass(!glass)}>
                          <span />
                        </button>
                      </div>
                      <div className="about">
                        <Monitor size={17} />
                        <span>
                          Hub · 1.2.0
                          <small>{t("Antigravity + ChatGPT, Gemini и Grok без API-ключей", "Antigravity + ChatGPT, Gemini & Grok accounts")}</small>
                        </span>
                      </div>
                    </section>
                  )}
                  {(settingsTab === "limits" || settingsTab === "accounts") && <AccountPanel lang={lang} limitsOnly={settingsTab === "limits"} />}
                  {settingsTab === "phone" && <PhonePanel />}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {notice && (
        <div className="toast glass" role="status">
          <Check size={15} />
          {notice}
        </div>
      )}
    </main>
  );
}
