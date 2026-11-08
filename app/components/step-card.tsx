"use client";
import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Eye, FileCode2, FilePenLine, FolderOpen, Search, Terminal, XCircle } from "lucide-react";

export function parseJournalEntry(content: string) {
  const splitIdx = content.indexOf("\n\n");
  if (splitIdx < 0) return null;
  try {
    const action = JSON.parse(content.slice(0, splitIdx));
    if (!action || typeof action !== "object" || !action.tool) return null;
    const result = content.slice(splitIdx + 2);
    return { action, result, failed: result.startsWith("Ошибка:") };
  } catch {
    return null;
  }
}

export default function StepCard({
  content,
  provider,
  lang,
}: {
  content: string;
  provider?: string;
  lang: string;
}) {
  const [open, setOpen] = useState(false);
  const t = (ru: string, en: string) => (lang === "ru" ? ru : en);
  const parsed = parseJournalEntry(content);
  if (!parsed) return <div className="step-raw">{content}</div>;

  const { action, result, failed } = parsed;
  const labels: Record<string, { ru: string; en: string; icon: any }> = {
    write: { ru: "Запись файла", en: "Write file", icon: FileCode2 },
    edit: { ru: "Правка файла", en: "Edit file", icon: FilePenLine },
    read: { ru: "Чтение файла", en: "Read file", icon: Eye },
    search: { ru: "Поиск", en: "Search", icon: Search },
    list: { ru: "Список папки", en: "List folder", icon: FolderOpen },
    command: { ru: "PowerShell", en: "PowerShell", icon: Terminal },
  };
  const info = labels[action.tool] || { ru: action.tool, en: action.tool, icon: Terminal };
  const Icon = info.icon;
  const rawTarget = String(action.path || action.command || action.query || "");
  const shortTarget =
    action.tool === "command"
      ? rawTarget.replace(/\s+/g, " ").slice(0, 72)
      : rawTarget.split(/[\\/]/).slice(-2).join("/");

  return (
    <div className={"ag-step-card" + (failed ? " is-error" : "")}>
      <button type="button" className="ag-step-header" onClick={() => setOpen(!open)}>
        <span className="ag-step-status">
          {failed ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
        </span>
        <span className="ag-step-kind">
          <Icon size={14} />
          {lang === "ru" ? info.ru : info.en}
        </span>
        <code className="ag-step-target">{shortTarget}</code>
        <span className="ag-step-tag">
          Работа · журнал{provider ? ` · ${provider === "openai" ? "ChatGPT" : "Gemini"}` : ""}
        </span>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </button>
      {open && (
        <div className="ag-step-body">
          <div className="ag-step-section">
            <small>{t("Параметры действия", "Action payload")}</small>
            <pre>{JSON.stringify(action, null, 2)}</pre>
          </div>
          <div className="ag-step-section">
            <small>{t("Результат выполнения", "Execution output")}</small>
            <pre>{result}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
