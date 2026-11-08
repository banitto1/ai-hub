"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, AtSign, FileCode2, FilePenLine, FileText, Folder, FolderOpen, Gauge, Paperclip, RefreshCw, Terminal, X } from "lucide-react";
import { GeminiQuotas, QuotaPie } from "../quota-pie";
import { parseJournalEntry } from "./step-card";

type Entry = { name: string; path: string; kind: "dir" | "file" };

export default function AuxPane({
  workDir,
  messages,
  accounts,
  lang,
  onMentionFile,
  onAttachWorkspaceFile,
  onClose,
}: {
  workDir: string;
  messages: { id: string; role: string; model?: string; content: string }[];
  accounts: any;
  lang: string;
  onMentionFile: (relPath: string) => void;
  onAttachWorkspaceFile: (name: string, content: string) => Promise<void>;
  onClose: () => void;
}) {
  const t = (ru: string, en: string) => (lang === "ru" ? ru : en);
  const [tab, setTab] = useState<"explorer" | "changes" | "terminal" | "quotas">("explorer");
  const [subDir, setSubDir] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [viewing, setViewing] = useState<{ path: string; content: string; binary?: boolean; tooLarge?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function loadDir(targetSub = subDir) {
    if (!workDir.trim()) {
      setEntries([]);
      setViewing(null);
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/workspace?dir=${encodeURIComponent(workDir)}&sub=${encodeURIComponent(targetSub)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ошибка чтения папки");
      setSubDir(d.current || "");
      setEntries(d.entries || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  async function openFile(relPath: string) {
    if (!workDir.trim()) return;
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/workspace?dir=${encodeURIComponent(workDir)}&file=${encodeURIComponent(relPath)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ошибка чтения файла");
      setViewing(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSubDir("");
    setViewing(null);
    if (workDir.trim()) void loadDir("");
  }, [workDir]);

  const { changedFiles, terminalRuns } = useMemo(() => {
    const filesMap = new Map<string, { path: string; tool: string; failed: boolean }>();
    const cmds: { id: string; command: string; output: string; failed: boolean }[] = [];
    for (const m of messages) {
      if (m.model !== "Работа · журнал") continue;
      const parsed = parseJournalEntry(m.content);
      if (!parsed) continue;
      const { action, result, failed } = parsed;
      if (action.tool === "write" || action.tool === "edit") {
        filesMap.set(action.path, { path: action.path, tool: action.tool, failed });
      } else if (action.tool === "command") {
        cmds.push({ id: m.id, command: action.command, output: result, failed });
      }
    }
    return { changedFiles: Array.from(filesMap.values()), terminalRuns: cmds };
  }, [messages]);

  return (
    <aside className="ag-aux-pane" aria-label={t("Вспомогательная панель", "Auxiliary pane")}>
      <div className="ag-aux-tabs">
        <button type="button" className={tab === "explorer" ? "active" : ""} onClick={() => setTab("explorer")}>
          <FolderOpen size={14} />
          <span>{t("Файлы", "Files")}</span>
        </button>
        <button type="button" className={tab === "changes" ? "active" : ""} onClick={() => setTab("changes")}>
          <FilePenLine size={14} />
          <span>{t("Изменения", "Changes")}</span>
          {changedFiles.length > 0 && <b>{changedFiles.length}</b>}
        </button>
        <button type="button" className={tab === "terminal" ? "active" : ""} onClick={() => setTab("terminal")}>
          <Terminal size={14} />
          <span>{t("Терминал", "Terminal")}</span>
          {terminalRuns.length > 0 && <b>{terminalRuns.length}</b>}
        </button>
        <button type="button" className={tab === "quotas" ? "active" : ""} onClick={() => setTab("quotas")}>
          <Gauge size={14} />
          <span>{t("Квоты", "Quotas")}</span>
        </button>
        <button type="button" className="icon-button ag-aux-close" onClick={onClose} aria-label={t("Скрыть панель", "Close pane")}>
          <X size={15} />
        </button>
      </div>

      <div className="ag-aux-body">
        {tab === "explorer" && (
          !workDir.trim() ? (
            <div className="ag-aux-empty">
              <FolderOpen size={24} />
              <p>{t("Выберите папку проекта сверху или в боковой панели, чтобы просматривать файлы и упоминать их через @.", "Select a project folder to browse files and @-mention them.")}</p>
            </div>
          ) : viewing ? (
            <div className="ag-file-viewer">
              <div className="ag-viewer-bar">
                <button type="button" className="icon-button" onClick={() => setViewing(null)} aria-label={t("Назад к списку", "Back")}>
                  <ArrowLeft size={15} />
                </button>
                <code title={viewing.path}>{viewing.path}</code>
              </div>
              <div className="ag-viewer-actions">
                <button type="button" className="secondary" onClick={() => onMentionFile(viewing.path)}>
                  <AtSign size={13} />
                  {t("Упомянуть @", "Mention @")}
                </button>
                {!viewing.binary && !viewing.tooLarge && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void onAttachWorkspaceFile(viewing.path.split("/").pop() || viewing.path, viewing.content)}
                  >
                    <Paperclip size={13} />
                    {t("Прикрепить", "Attach")}
                  </button>
                )}
              </div>
              {viewing.binary ? (
                <p className="muted">{t("Бинарный файл (просмотр текста недоступен).", "Binary file.")}</p>
              ) : viewing.tooLarge ? (
                <p className="muted">{t("Файл больше 120 КБ. Агент может прочитать нужные строки по запросу.", "File exceeds 120 KB. Ask the agent to read line ranges.")}</p>
              ) : (
                <div className="ag-code-box">
                  {viewing.content.split(/\r?\n/).slice(0, 400).map((line, idx) => (
                    <div key={idx} className="ag-code-line">
                      <span>{idx + 1}</span>
                      <code>{line || " "}</code>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="ag-tree">
              <div className="ag-tree-bar">
                {subDir ? (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      const parent = subDir.includes("/") ? subDir.slice(0, subDir.lastIndexOf("/")) : "";
                      void loadDir(parent);
                    }}
                  >
                    <ArrowLeft size={13} /> {subDir}
                  </button>
                ) : (
                  <small>{workDir.split(/[\\/]/).filter(Boolean).pop() || workDir}</small>
                )}
                <button type="button" className="icon-button" onClick={() => void loadDir(subDir)} aria-label={t("Обновить проводник", "Refresh explorer")}>
                  <RefreshCw size={14} className={loading ? "spin" : ""} />
                </button>
              </div>
              {err && <div className="approval-warn">{err}</div>}
              <div className="ag-tree-list">
                {entries.map(e => (
                  <div key={e.path} className="ag-tree-row">
                    <button
                      type="button"
                      className="ag-tree-item"
                      onClick={() => (e.kind === "dir" ? void loadDir(e.path) : void openFile(e.path))}
                    >
                      {e.kind === "dir" ? <Folder size={15} /> : <FileText size={15} />}
                      <span>{e.name}</span>
                    </button>
                    {e.kind === "file" && (
                      <button
                        type="button"
                        className="icon-button"
                        title={t("Упомянуть @ в сообщении", "Mention @ in prompt")}
                        onClick={() => onMentionFile(e.path)}
                      >
                        <AtSign size={13} />
                      </button>
                    )}
                  </div>
                ))}
                {!loading && !entries.length && !err && (
                  <p className="muted">{t("Папка пуста.", "Folder is empty.")}</p>
                )}
              </div>
            </div>
          )
        )}

        {tab === "changes" && (
          changedFiles.length === 0 ? (
            <div className="ag-aux-empty">
              <FileCode2 size={24} />
              <p>{t("В этом диалоге пока нет созданных или изменённых файлов.", "No files created or edited in this chat yet.")}</p>
            </div>
          ) : (
            <div className="ag-changes-list">
              {changedFiles.map(item => {
                const normalized = workDir && item.path.toLowerCase().startsWith(workDir.toLowerCase())
                  ? item.path.slice(workDir.length).replace(/^[\\/]+/, "").replaceAll("\\", "/")
                  : "";
                return (
                  <div key={item.path} className="ag-change-item">
                    <span className={"ag-change-badge " + item.tool}>
                      {item.tool === "write" ? "W" : "E"}
                    </span>
                    <div className="ag-change-path">
                      <strong>{item.path.split(/[\\/]/).pop()}</strong>
                      <small>{item.path}</small>
                    </div>
                    {normalized && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setTab("explorer");
                          void openFile(normalized);
                        }}
                      >
                        {t("Открыть", "Open")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {tab === "terminal" && (
          terminalRuns.length === 0 ? (
            <div className="ag-aux-empty">
              <Terminal size={24} />
              <p>{t("Команды PowerShell в этом диалоге ещё не запускались.", "No PowerShell commands executed in this chat yet.")}</p>
            </div>
          ) : (
            <div className="ag-terminal-list">
              {terminalRuns.map(run => (
                <div key={run.id} className={"ag-term-card" + (run.failed ? " is-error" : "")}>
                  <div className="ag-term-cmd">PS&gt; {run.command}</div>
                  <pre>{run.output}</pre>
                </div>
              ))}
            </div>
          )
        )}

        {tab === "quotas" && (
          <div className="ag-aux-quotas">
            <div className="ag-aux-quota-block">
              <h4>ChatGPT / Codex</h4>
              {accounts?.openai?.limits ? (
                Object.entries(accounts.openai.limits).map(([key, bucket]: [string, any]) => (
                  <div key={key} className="ag-mini-bucket">
                    {bucket.primary && typeof bucket.primary.usedPercent === "number" && (
                      <div className="ag-mini-pie-row">
                        <QuotaPie remaining={100 - bucket.primary.usedPercent} lang={lang} />
                        <div>
                          <strong>{Math.max(0, 100 - bucket.primary.usedPercent)}%</strong>
                          <small>{bucket.primary.windowDurationMins ? `${bucket.primary.windowDurationMins / 60} ч` : key}</small>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="muted">{t("Лимиты не получены.", "Limits unavailable.")}</p>
              )}
            </div>
            <div className="ag-aux-quota-block">
              <h4>Gemini / Antigravity</h4>
              {accounts?.gemini?.limitReport ? (
                <GeminiQuotas report={accounts.gemini.limitReport} lang={lang} />
              ) : (
                <p className="muted">{t("Лимиты не получены.", "Limits unavailable.")}</p>
              )}
            </div>
            <div className="ag-aux-quota-block">
              <h4>Grok / X</h4>
              {accounts?.grok?.limits ? (
                Object.entries(accounts.grok.limits).map(([key, bucket]: [string, any]) => (
                  <div key={key} className="ag-mini-bucket">
                    {bucket.primary && typeof bucket.primary.usedPercent === "number" && (
                      <div className="ag-mini-pie-row">
                        <QuotaPie remaining={100 - bucket.primary.usedPercent} lang={lang} />
                        <div>
                          <strong>
                            {Math.max(0, 100 - bucket.primary.usedPercent)}%
                            {typeof bucket.primary.remainingQueries === "number" && typeof bucket.primary.totalQueries === "number"
                              ? ` (${bucket.primary.remainingQueries}/${bucket.primary.totalQueries})`
                              : ""}
                          </strong>
                          <small>{bucket.primary.label || (bucket.primary.windowDurationMins ? `${bucket.primary.windowDurationMins / 60} ч` : key)}</small>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="muted">{t("Лимиты не получены.", "Limits unavailable.")}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
