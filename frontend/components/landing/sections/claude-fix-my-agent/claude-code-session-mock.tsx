"use client";

import { useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";

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

const USER_PROMPT = "reports too long, check recent runs via laminar MCP";

const monoBase = "font-mono text-[13px] leading-5";

const TYPE_MS = 25;
const POST_TYPE_MS = 350;
const LINE_MS = 150;
const BLOCK_MS = 380;
const DIFF_MS = 90;

// Single stage counter, chained timers advance one at a time:
//   0: typing prompt into input
//   1: > user msg
//   2: ● tool call
//   3: └─ result
//   4: ✻ thought
//   5: ● Update label
//   6..11: diff lines (one per stage)
const TOTAL_STAGES = 6 + DIFF_LINES.length;

const Cursor = () => <span className="inline-block w-1.5 h-3.5 bg-foreground-300 ml-0.5 align-middle animate-pulse" />;

// Faithful port of the Claude Code session card from Figma (4054:7405),
// with a line-by-line reveal that mimics a live session. Fixed-height
// shell: messages region is `flex-1 justify-end` so reveals start at the
// bottom and push older content upward; the footer stays pinned. Animation
// is gated on `useInView` and only fires once per page load.
const ClaudeCodeSessionMock = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  const [typed, setTyped] = useState("");
  const [stage, setStage] = useState(0);

  // Phase 0: type prompt one char at a time, then pause before advancing.
  useEffect(() => {
    if (!isInView || stage !== 0) return;
    if (typed.length >= USER_PROMPT.length) {
      const t = setTimeout(() => setStage(1), POST_TYPE_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTyped(USER_PROMPT.slice(0, typed.length + 1)), TYPE_MS);
    return () => clearTimeout(t);
  }, [isInView, stage, typed]);

  // Phases 1..TOTAL_STAGES-1: advance with a per-stage delay. BLOCK between
  // blocks, LINE between lines within a block, DIFF between consecutive diff
  // lines (fastest, for the "streaming" feel).
  useEffect(() => {
    if (!isInView || stage === 0 || stage >= TOTAL_STAGES - 1) return;
    const next = stage + 1;
    const delay = next === 2 || next === 4 || next === 5 ? BLOCK_MS : next === 3 || next === 6 ? LINE_MS : DIFF_MS;
    const t = setTimeout(() => setStage(next), delay);
    return () => clearTimeout(t);
  }, [isInView, stage]);

  const isTyping = stage === 0;
  const diffShown = Math.min(DIFF_LINES.length, Math.max(0, stage - 5));

  return (
    <div
      ref={ref}
      className={cn(
        "w-[600px] h-[450px] rounded-md border border-surface-400 bg-surface-700 px-5 py-4 flex flex-col gap-[18px]",
        className
      )}
    >
      {/* Messages region — flex-1 with justify-end so content sits at the
          bottom and grows up as more is revealed. overflow-hidden clips
          anything past the top edge (reads as a longer session). */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col justify-end gap-[18px]">
        {stage >= 1 && (
          <p className={cn(monoBase, "text-foreground-300")}>
            <span className="text-primary-300">&gt;</span> {USER_PROMPT}
          </p>
        )}

        {stage >= 2 && (
          <div className="flex flex-col gap-0.5">
            <p className={cn(monoBase, "text-foreground-200")}>
              <span className="text-primary-300">●</span>
              {` `}laminar - query_laminar_sql(query: &quot;SELECT trace_id, output_chars FROM refine_report …&quot;)
            </p>
            {stage >= 3 && (
              <p className={cn(monoBase, "text-foreground-400")}>
                {"  └─ Returned 5 rows · avg output: 612 chars (target ≤ 300)"}
              </p>
            )}
          </div>
        )}

        {stage >= 4 && (
          <p className={cn(monoBase, "text-foreground-300")}>
            <span className="text-primary-300">✻</span> {` `}The prompt says &quot;a few sentences&quot; but never
            enforces a length — I&apos;ll make it explicit.
          </p>
        )}

        {stage >= 5 && (
          <div className="flex flex-col gap-0.5">
            <p className={cn(monoBase, "text-foreground-200")}>
              <span className="text-primary-300">●</span> Update(refine-report.ts)
            </p>
            <div className="h-1.5" />
            {DIFF_LINES.slice(0, diffShown).map((line, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center pl-1 pr-2",
                  line.kind === "removed" && "bg-surface-400/60",
                  line.kind === "added" && "bg-primary-400/10"
                )}
              >
                <span className={cn(monoBase, "w-7 text-right pr-2 text-foreground-500 select-none shrink-0")}>
                  {i + 1}
                </span>
                <span
                  className={cn(
                    monoBase,
                    "w-4 text-center shrink-0",
                    line.kind === "added" && "text-primary-300",
                    line.kind === "removed" && "text-foreground-400",
                    line.kind === "context" && "text-foreground-500"
                  )}
                >
                  {line.kind === "added" ? "+" : line.kind === "removed" ? "-" : ""}
                </span>
                <span
                  className={cn(
                    monoBase,
                    "whitespace-pre",
                    line.kind === "added" && "text-primary-300",
                    line.kind === "removed" && "text-foreground-400",
                    line.kind === "context" && "text-foreground-300"
                  )}
                >
                  {line.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer — input + status. Input shows the user typing during stage 0
          then clears once the prompt is "submitted" (stage ≥ 1). */}
      <div className="shrink-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 rounded-md border border-surface-400 bg-surface-600 px-3 py-2.5">
          <span className={cn(monoBase, "font-medium text-primary-300")}>&gt;</span>
          <span className={cn(monoBase, "text-foreground-200")}>
            {isTyping ? typed : ""}
            {isTyping && <Cursor />}
          </span>
        </div>
        <div className="flex items-center justify-between px-1">
          <span className={cn("font-mono text-xs leading-[18px] text-foreground-600")}>? for shortcuts</span>
          <span className={cn("font-mono text-xs leading-[18px] text-foreground-600")}>
            claude-opus-4-7 · 1M context
          </span>
        </div>
      </div>
    </div>
  );
};

export default ClaudeCodeSessionMock;
