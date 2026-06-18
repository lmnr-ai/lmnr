"use client";

import { useInView } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

import DebuggerSessionMock from "./debugger-session-mock";
import DebuggerTerminalMock, { type Entry } from "./debugger-terminal-mock";

const PROMPT = "I don't see anything written to MEMORY.md, fix please.";

// One ordered timeline drives BOTH panes. Each step reveals a terminal entry
// and/or a session side-effect, so an agent run in the terminal makes the trace
// stream into the side panel — `trace` = how many runs are now visible, `note` =
// the (0-based) trace whose agent note is written, `expand` = a trace to expand.
// `delay` is the pause before this step appears.
type Step = {
  entry?: Entry;
  trace?: number;
  note?: number;
  expand?: number;
  delay: number;
};

const SEQUENCE: Step[] = [
  { entry: { kind: "status", text: "Running agent with Laminar Debugger" }, trace: 1, delay: 700 },
  { entry: { kind: "tool", text: 'Bash(LMNR_DEBUG=true python agent.py "update MEMORY.md")' }, delay: 240 },
  { entry: { kind: "result", text: "Session fix-memory-md · trace 7f3a… · 12 spans" }, delay: 360 },

  { entry: { kind: "status", text: "Querying trace with Laminar CLI SQL command" }, delay: 700 },
  { entry: { kind: "tool", text: 'Bash(lmnr sql "SELECT name, span_type FROM spans' }, delay: 240 },
  { entry: { kind: "tool", text: "         WHERE trace_id = '7f3a…' ORDER BY start_time\")" }, delay: 220 },
  { entry: { kind: "result", text: "12 rows · no write_file / save_memory span found" }, note: 0, delay: 440 },

  {
    entry: {
      kind: "thought",
      text: "The agent never persists what it learned — the system prompt doesn't tell it to write MEMORY.md.",
    },
    delay: 560,
  },

  { entry: { kind: "status", text: "I found the issue! Implementing a fix." }, delay: 700 },
  { entry: { kind: "update", text: "Update(agent/prompt.py)" }, delay: 420 },
  { entry: { kind: "diff", sign: " ", text: "  'Answer the user's question concisely.'," }, delay: 150 },
  { entry: { kind: "diff", sign: "+", text: "  'When you finish, append what you learned'," }, delay: 130 },
  { entry: { kind: "diff", sign: "+", text: "  'to MEMORY.md with the write_file tool.'," }, delay: 130 },

  { entry: { kind: "status", text: "Verifying the fix." }, trace: 2, delay: 740 },
  { entry: { kind: "tool", text: 'Bash(lmnr sql "SELECT count() FROM spans' }, delay: 240 },
  { entry: { kind: "tool", text: "         WHERE name = 'write_file' AND trace_id = '9c1b…'\")" }, delay: 220 },
  { entry: { kind: "result", text: "1 row · write_file → MEMORY.md (312 bytes)" }, note: 1, delay: 440 },

  { entry: { kind: "status", text: "Fix confirmed!" }, expand: 1, delay: 740 },
];

const TYPE_MS = 22;
const POST_TYPE_MS = 400;

// Owns the single animation clock and renders both panes. Gated on `useInView`,
// runs once per page load.
const DebuggerScene = () => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  const [typed, setTyped] = useState("");
  const [revealed, setRevealed] = useState(0);

  const isTyping = typed.length < PROMPT.length;

  // Phase 0: type the prompt one char at a time.
  useEffect(() => {
    if (!isInView || !isTyping) return;
    const t = setTimeout(() => setTyped(PROMPT.slice(0, typed.length + 1)), TYPE_MS);
    return () => clearTimeout(t);
  }, [isInView, isTyping, typed]);

  // Phase 1: reveal one timeline step at a time, paced by each step's delay.
  useEffect(() => {
    if (!isInView || isTyping || revealed >= SEQUENCE.length) return;
    const delay = revealed === 0 ? POST_TYPE_MS : SEQUENCE[revealed].delay;
    const t = setTimeout(() => setRevealed((r) => r + 1), delay);
    return () => clearTimeout(t);
  }, [isInView, isTyping, revealed]);

  const derived = useMemo(() => {
    const steps = SEQUENCE.slice(0, revealed);
    const entries = steps.map((s) => s.entry).filter((e): e is Entry => !!e);
    const traces = steps.reduce((m, s) => Math.max(m, s.trace ?? 0), 0);
    const notes = steps.filter((s) => s.note !== undefined).map((s) => s.note as number);
    const expand = steps.filter((s) => s.expand !== undefined).map((s) => s.expand as number);
    // Bumps only when session content streams in, so autoscroll fires on real growth.
    const revealKey = steps.filter((s) => s.trace || s.note !== undefined || s.expand !== undefined).length;
    return { entries, traces, notes, expand, revealKey };
  }, [revealed]);

  return (
    <div ref={ref} className="flex w-full flex-col gap-4 md:flex-row md:items-stretch">
      <DebuggerTerminalMock
        className="flex-1 min-w-0"
        entries={derived.entries}
        typed={typed}
        isTyping={isTyping}
        finished={revealed >= SEQUENCE.length}
        prompt={PROMPT}
      />
      <DebuggerSessionMock
        className="flex-1 min-w-0"
        traces={derived.traces}
        notes={derived.notes}
        expand={derived.expand}
        revealKey={derived.revealKey}
      />
    </div>
  );
};

export default DebuggerScene;
