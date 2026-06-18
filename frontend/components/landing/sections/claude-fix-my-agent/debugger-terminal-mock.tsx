"use client";

import { cn } from "@/lib/utils";

// One transcript entry. The five `status` milestones are the copy spec; the
// tool / result / thought / diff entries around them fill in the gaps so it
// reads like a real Claude Code session driving the Laminar debugger.
export type Entry =
  | { kind: "status"; text: string }
  | { kind: "tool"; text: string }
  | { kind: "result"; text: string }
  | { kind: "thought"; text: string }
  | { kind: "update"; text: string }
  | { kind: "diff"; sign: "+" | "-" | " "; text: string };

export const monoBase = "font-mono text-[12px] leading-5";

const Cursor = () => <span className="inline-block w-1.5 h-3.5 bg-foreground-300 ml-0.5 align-middle animate-pulse" />;

const EntryRow = ({ entry, active }: { entry: Entry; active: boolean }) => {
  switch (entry.kind) {
    case "status":
    case "update":
      return (
        <p className={cn(monoBase, "text-foreground-200")}>
          <span className={cn("text-primary-300", active && "animate-pulse")}>●</span> {entry.text}
        </p>
      );
    case "thought":
      return (
        <p className={cn(monoBase, "text-foreground-300")}>
          <span className="text-primary-300">✻</span> {entry.text}
        </p>
      );
    case "tool":
      return (
        <p className={cn(monoBase, "text-foreground-400 whitespace-pre")}>
          <span className="text-foreground-500">●</span> {entry.text}
        </p>
      );
    case "result":
      return <p className={cn(monoBase, "text-foreground-500 whitespace-pre")}>{`  └─ ${entry.text}`}</p>;
    case "diff":
      return (
        <div
          className={cn(
            "flex items-center pl-1 pr-2",
            entry.sign === "-" && "bg-surface-400/60",
            entry.sign === "+" && "bg-primary-400/10"
          )}
        >
          <span
            className={cn(
              monoBase,
              "w-4 text-center shrink-0",
              entry.sign === "+" && "text-primary-300",
              entry.sign === "-" && "text-foreground-400",
              entry.sign === " " && "text-foreground-500"
            )}
          >
            {entry.sign === " " ? "" : entry.sign}
          </span>
          <span
            className={cn(
              monoBase,
              "whitespace-pre",
              entry.sign === "+" && "text-primary-300",
              entry.sign === "-" && "text-foreground-400",
              entry.sign === " " && "text-foreground-300"
            )}
          >
            {entry.text}
          </span>
        </div>
      );
  }
};

interface Props {
  entries: Entry[];
  typed: string;
  isTyping: boolean;
  finished: boolean;
  prompt: string;
  className?: string;
}

// Debugger terminal: the coding agent driving Laminar's debugger. Purely
// presentational — the parent scene owns the clock and feeds in the prompt
// typing + the revealed transcript entries.
const DebuggerTerminalMock = ({ entries, typed, isTyping, finished, prompt, className }: Props) => (
  <div
    className={cn(
      "h-[480px] w-full rounded-md border border-surface-400 bg-surface-700 px-5 py-4 flex flex-col gap-4",
      className
    )}
  >
    {/* Messages region — flex-1 with justify-end so content sits at the bottom
        and grows up as more is revealed; overflow clips older lines off the top,
        reading as a longer live session. */}
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col justify-end gap-2.5">
      {!isTyping && (
        <p className={cn(monoBase, "text-foreground-300")}>
          <span className="text-primary-300">&gt;</span> {prompt}
        </p>
      )}
      {entries.map((entry, i) => (
        <EntryRow key={i} entry={entry} active={i === entries.length - 1 && !finished} />
      ))}
    </div>

    {/* Footer — input + status. Input shows the user typing then clears once the
        prompt is "submitted". */}
    <div className="shrink-0 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 rounded-md border border-surface-400 bg-surface-600 px-3 py-2.5">
        <span className={cn(monoBase, "font-medium text-primary-300")}>&gt;</span>
        <span className={cn(monoBase, "text-foreground-200")}>
          {isTyping ? typed : ""}
          {isTyping && <Cursor />}
        </span>
      </div>
      <div className="flex items-center justify-between px-1">
        <span className="font-mono text-xs leading-[18px] text-foreground-600">? for shortcuts</span>
        <span className="font-mono text-xs leading-[18px] text-foreground-600">claude-opus-4-7 · 1M context</span>
      </div>
    </div>
  </div>
);

export default DebuggerTerminalMock;
