"use client";
import { Eye, FileCode2, FilePenLine, FolderOpen, Search, ShieldAlert, Terminal } from "lucide-react";

type DiffLine = { type: "ctx" | "del" | "add"; line: number; text: string };
type Preview =
  | { kind: "diff"; isNewFile: boolean; added: number; removed: number; truncated?: boolean; lines: DiffLine[] }
  | { kind: "warning"; text: string }
  | null;

export default function ApprovalCard({
  approval,
  deciding,
  lang,
  onDecide,
}: {
  approval: { id: string; action: any; preview?: Preview };
  deciding: boolean;
  lang: string;
  onDecide: (allow: boolean) => void;
}) {
  const t = (ru: string, en: string) => (lang === "ru" ? ru : en);
  const a = approval.action || {};
  const p = approval.preview || null;

  const meta: Record<string, { label: string; icon: any }> = {
    write: {
      label: p && p.kind === "diff" && p.isNewFile ? t("Создание файла", "Create file") : t("Запись файла", "Write file"),
      icon: FileCode2,
    },
    edit: { label: t("Точечная правка", "Edit file"), icon: FilePenLine },
    read: { label: t("Чтение файла", "Read file"), icon: Eye },
    search: { label: t("Поиск по проекту", "Search workspace"), icon: Search },
    list: { label: t("Обзор папки", "List directory"), icon: FolderOpen },
    command: { label: t("Команда PowerShell", "PowerShell command"), icon: Terminal },
  };
  const info = meta[a.tool] || { label: a.tool || t("Действие", "Action"), icon: ShieldAlert };
  const Icon = info.icon;
  const target = a.path || a.command || a.query || "";

  return (
    <div className="work-approval" role="region" aria-label="Разрешение действия">
      <div className="approval-head">
        <span className="approval-badge">
          <Icon size={15} />
          {info.label}
        </span>
        <strong>{t("Разрешить действие на ПК?", "Allow this PC action?")}</strong>
        {p?.kind === "diff" && (
          <span className="diff-stats">
            <b className="add">+{p.added}</b>
            <b className="del">-{p.removed}</b>
          </span>
        )}
      </div>
      {target && <div className="approval-target">{target}</div>}
      {p?.kind === "warning" && <div className="approval-warn">{p.text}</div>}
      {p?.kind === "diff" && p.lines.length > 0 && (
        <div className="diff-preview" aria-label={t("Предпросмотр изменений", "Diff preview")}>
          {p.lines.map((line, idx) => (
            <div key={idx} className={"diff-row " + line.type}>
              <span className="diff-num">{line.line}</span>
              <span className="diff-sign">{line.type === "add" ? "+" : line.type === "del" ? "−" : " "}</span>
              <span className="diff-code">{line.text || " "}</span>
            </div>
          ))}
          {p.truncated && (
            <div className="diff-more">
              {t("Показаны первые строки изменений…", "Showing initial diff lines…")}
            </div>
          )}
        </div>
      )}
      <pre className="approval-json">{JSON.stringify(approval.action, null, 2)}</pre>
      <div className="approval-actions">
        <button className="primary" disabled={deciding} onClick={() => onDecide(true)}>
          {t("Разрешить один раз", "Allow once")}
        </button>
        <button className="secondary" disabled={deciding} onClick={() => onDecide(false)}>
          {t("Отклонить и остановить", "Deny and stop")}
        </button>
      </div>
    </div>
  );
}
