"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import DebuggerTerminalEntry from "./debugger-terminal-entry";
import type { Entry } from "./debugger-types";

const MONO_TEXT = "font-mono text-[12px] leading-5";
const USER_COLOR = "var(--color-foreground-300)";
const SUBTEXT_COLOR = "var(--color-foreground-600)";

const Cursor = () => (
  <span
    className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse align-middle"
    style={{ backgroundColor: USER_COLOR }}
  />
);

interface Props {
  entries: Entry[];
  typed: string;
  isTyping: boolean;
  finished: boolean;
  prompt: string;
  className?: string;
}

const DebuggerTerminalMock = ({ entries, typed, isTyping, finished, prompt, className }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [entries.length, isTyping]);

  return (
    <div
      className={cn(
        "flex h-[480px] w-[600px] shrink-0 flex-col rounded-md border border-surface-300 bg-surface-150",
        className
      )}
    >
      <div
        ref={scrollRef}
        className="scrollbar-none min-h-0 flex-1 overflow-x-hidden overflow-y-hidden scroll-smooth px-5 pt-4 scroll-fade-y md:overflow-y-auto"
      >
        <div className="flex min-h-full flex-col justify-end gap-0">
          {!isTyping && (
            <p className={MONO_TEXT} style={{ color: USER_COLOR }}>
              <span>&gt;</span> {prompt}
            </p>
          )}
          {entries.map((entry, index) => (
            <DebuggerTerminalEntry key={index} entry={entry} active={index === entries.length - 1 && !finished} />
          ))}
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-1.5 px-5 pb-4 pt-4">
        <div className="flex items-center gap-2 rounded-md border border-surface-300 bg-surface-200 px-3 py-2.5">
          <span className={cn(MONO_TEXT, "font-medium")} style={{ color: USER_COLOR }}>
            &gt;
          </span>
          <span className={MONO_TEXT} style={{ color: USER_COLOR }}>
            {isTyping ? typed : ""}
            {isTyping && <Cursor />}
          </span>
        </div>
        <div className="flex items-center justify-between px-1">
          <span className="font-mono text-xs leading-[18px]" style={{ color: SUBTEXT_COLOR }}>
            ? for shortcuts
          </span>
          <span className="font-mono text-xs leading-[18px]" style={{ color: SUBTEXT_COLOR }}>
            claude-opus-5 · 1M context
          </span>
        </div>
      </div>
    </div>
  );
};

export default DebuggerTerminalMock;
