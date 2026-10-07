import { cn } from "@/lib/utils";

import type { Entry } from "./debugger-types";

const MONO_TEXT = "font-mono text-[12px] leading-5";
const COLORS = {
  bashTool: "var(--color-foreground-200)",
  sql: "var(--color-foreground-100)",
  status: "var(--color-foreground-600)",
  subtext: "var(--color-foreground-600)",
} as const;
const progressBar = (current: number, total: number) => {
  const width = 42;
  const filled = Math.max(1, Math.round((current / total) * width));
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
};

interface Props {
  active: boolean;
  entry: Entry;
}

const DebuggerTerminalEntry = ({ active, entry }: Props) => {
  switch (entry.kind) {
    case "status":
      return (
        <p className={cn(MONO_TEXT, "mt-3")} style={{ color: COLORS.status }}>
          <span className={cn(active && "animate-pulse")}>●</span> {entry.text}
        </p>
      );
    case "update":
      return (
        <p className={MONO_TEXT} style={{ color: COLORS.status }}>
          <span className={cn(active && "animate-pulse")}>●</span> {entry.text}
        </p>
      );
    case "thought":
      return (
        <p className={MONO_TEXT} style={{ color: COLORS.subtext }}>
          <span>✻</span> {entry.text}
        </p>
      );
    case "tool": {
      const sqlStart = entry.text.startsWith('lmnr-cli sql query "') ? entry.text.indexOf('"') : -1;
      const bashText = sqlStart === -1 ? entry.text : entry.text.slice(0, sqlStart);
      const sqlText = sqlStart === -1 ? "" : entry.text.slice(sqlStart);

      return (
        <p className={cn(MONO_TEXT, "-mx-2 whitespace-pre rounded-sm px-2")}>
          <span className="text-foreground-200/85">
            <span className="opacity-60">●</span> {bashText}
          </span>
          {sqlText && <span style={{ color: COLORS.sql }}>{sqlText}</span>}
        </p>
      );
    }
    case "result":
      return (
        <p className={cn(MONO_TEXT, "whitespace-pre")} style={{ color: COLORS.subtext }}>
          {`  └─ ${entry.text}`}
        </p>
      );
    case "progress":
      return (
        <p
          className={cn(MONO_TEXT, "flex w-full items-center whitespace-pre")}
          style={{ color: COLORS.subtext }}
          data-transfer-active
        >
          <span className="shrink-0">{`  └─ ${entry.current}/${entry.total} ${entry.label} `}</span>
          <span className="shrink-0 text-primary-400">{progressBar(entry.current, entry.total)}</span>
          <span className="ml-1 h-px min-w-2 flex-1 bg-primary-400/60" />
        </p>
      );
    case "diff":
      return (
        <div className="flex items-center pl-1 pr-2" style={{ color: COLORS.subtext }}>
          <span className={cn(MONO_TEXT, "w-4 shrink-0 text-center")}>{entry.sign === " " ? "" : entry.sign}</span>
          <span className={cn(MONO_TEXT, "whitespace-pre")}>{entry.text}</span>
        </div>
      );
  }
};

export default DebuggerTerminalEntry;
