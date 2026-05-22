import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const DIFF_LINES: Array<{ kind: "context" | "removed" | "added"; text: string }> = [
  { kind: "context", text: "const prompt = [" },
  { kind: "context", text: "  'You are a report refinement assistant.'," },
  { kind: "removed", text: "  'Summarize the report in a few sentences.'," },
  { kind: "added", text: "  'Summarize the report in EXACTLY 3-4 sentences.'," },
  { kind: "added", text: "  'Do not exceed 4 sentences under any circumstance.'," },
  { kind: "context", text: "].join('\\n');" },
];

const monoBase = "font-mono text-[13px] leading-5";

// Faithful port of the Claude Code session card from Figma (4054:7405).
// Sized to roughly 530×420; height is hug-based so any text-wrap differences
// across browsers are absorbed cleanly.
const ClaudeCodeSessionMock = ({ className }: Props) => (
  <div
    className={cn(
      "w-[600px] rounded-md border border-landing-surface-500 bg-landing-surface-700 px-5 py-4 flex flex-col gap-[18px]",
      className
    )}
  >
    <div className="flex flex-col gap-0.5">
      <p className={cn(monoBase, "text-landing-text-200")}>
        <span className="text-landing-primary-300">●</span>
        {` `}laminar - query_laminar_sql(query: &quot;SELECT trace_id, output_chars FROM refine_report …&quot;)
      </p>
      <p className={cn(monoBase, "text-landing-text-400")}>
        {"  └─ Returned 5 rows · avg output: 612 chars (target ≤ 300)"}
      </p>
    </div>

    <p className={cn(monoBase, "text-landing-text-300")}>
      <span className="text-landing-primary-300">✻</span> {` `}The prompt says &quot;a few sentences&quot; but never
      enforces a length — I&apos;ll make it explicit.
    </p>

    <div className="flex flex-col gap-0.5">
      <p className={cn(monoBase, "text-landing-text-200")}>
        <span className="text-landing-primary-300">●</span> Update(refine-report.ts)
      </p>
      <div className="h-1.5" />
      {DIFF_LINES.map((line, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center pl-1 pr-2",
            line.kind === "removed" && "bg-landing-surface-500/60",
            line.kind === "added" && "bg-landing-primary-400/10"
          )}
        >
          <span className={cn(monoBase, "w-7 text-right pr-2 text-landing-text-500 select-none shrink-0")}>
            {i + 1}
          </span>
          <span
            className={cn(
              monoBase,
              "w-4 text-center shrink-0",
              line.kind === "added" && "text-landing-primary-300",
              line.kind === "removed" && "text-landing-text-400",
              line.kind === "context" && "text-landing-text-500"
            )}
          >
            {line.kind === "added" ? "+" : line.kind === "removed" ? "-" : ""}
          </span>
          <span
            className={cn(
              monoBase,
              "whitespace-pre",
              line.kind === "added" && "text-landing-primary-300",
              line.kind === "removed" && "text-landing-text-400",
              line.kind === "context" && "text-landing-text-300"
            )}
          >
            {line.text}
          </span>
        </div>
      ))}
    </div>

    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 rounded-md border border-landing-surface-500 bg-landing-surface-600 px-3 py-2.5">
        <span className={cn(monoBase, "font-medium text-landing-primary-300")}>&gt;</span>
        <span className={cn(monoBase, "text-landing-text-200")}>&nbsp;</span>
      </div>
      <div className="flex items-center justify-between px-1">
        <span className={cn("font-mono text-xs leading-[18px] text-landing-text-600")}>? for shortcuts</span>
        <span className={cn("font-mono text-xs leading-[18px] text-landing-text-600")}>
          claude-opus-4-7 · 1M context
        </span>
      </div>
    </div>
  </div>
);

export default ClaudeCodeSessionMock;
