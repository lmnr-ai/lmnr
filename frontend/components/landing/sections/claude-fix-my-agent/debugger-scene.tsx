"use client";

import { useInView } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

import DebuggerSessionMock, { InlineCode, type MockTrace, SpanChip, type VisibleTrace } from "./debugger-session-mock";
import DebuggerTerminalMock, { type Entry } from "./debugger-terminal-mock";

const PROMPT = "I don't see anything written to MEMORY.md, fix please.";

// The session's real name, revealed once the agent has understood the run (the
// debugger names sessions a beat after the first trace is analysed).
const SESSION_NAME = "Fix: memory file never written";

// --- The "store" data: every trace the session can ever show. The scene
// controls which of these are live at any moment; the session is dumb. --------
const TRACES: MockTrace[] = [
  {
    duration: "6.2s",
    inTokens: "12.4K",
    outTokens: "842",
    cost: "$0.0391",
    relativeTime: "4m ago",
    inputPreview: "Read the repo and update MEMORY.md with anything you learned.",
    spans: [
      {
        kind: "llm",
        name: "anthropic.messages",
        model: "claude-sonnet-4-5",
        preview: "I'll read the repository structure first.",
        duration: "1.10s",
        inTokens: "4.1K",
        outTokens: "120",
        cost: "$0.0121",
      },
      { kind: "tool", name: "read_file", preview: "README.md · 2.1 KB", duration: "0.08s" },
      {
        kind: "llm",
        name: "anthropic.messages",
        model: "claude-sonnet-4-5",
        preview: "Here's a summary of what the repo does.",
        duration: "2.40s",
        inTokens: "8.3K",
        outTokens: "722",
        cost: "$0.0270",
      },
    ],
    note: {
      heading: "Reproduced the issue",
      body: (
        <>
          The run finished without ever writing to <InlineCode>MEMORY.md</InlineCode>. The save step is skipped after
          the <SpanChip>final response</SpanChip>.
        </>
      ),
    },
  },
  {
    duration: "7.5s",
    inTokens: "13.0K",
    outTokens: "1.1K",
    cost: "$0.0431",
    relativeTime: "just now",
    inputPreview: "Read the repo and update MEMORY.md with anything you learned.",
    spans: [
      {
        kind: "cached",
        name: "anthropic.messages",
        model: "claude-sonnet-4-5",
        preview: "Reading the repo, then I'll record findings.",
        duration: "0.00s",
        inTokens: "4.1K",
        outTokens: "120",
        cost: "$0.0000",
      },
      { kind: "tool", name: "read_file", preview: "README.md · 2.1 KB", duration: "0.08s" },
      {
        kind: "llm",
        name: "anthropic.messages",
        model: "claude-sonnet-4-5",
        preview: "Writing what I learned to MEMORY.md.",
        duration: "1.80s",
        inTokens: "8.4K",
        outTokens: "540",
        cost: "$0.0241",
      },
      { kind: "tool", name: "write_file", preview: 'path="MEMORY.md" · 312 bytes', duration: "0.10s" },
      // Vercel AI SDK always closes a run with a final assistant message.
      {
        kind: "llm",
        name: "anthropic.messages",
        model: "claude-sonnet-4-5",
        preview: "Done. I've written what I learned to MEMORY.md.",
        duration: "0.90s",
        inTokens: "9.0K",
        outTokens: "190",
        cost: "$0.0190",
      },
    ],
    note: {
      heading: "Fix confirmed",
      body: (
        <>
          <InlineCode>MEMORY.md</InlineCode> now contains the new entry. The agent calls <SpanChip>write_file</SpanChip>{" "}
          before exit. Verified with a SQL query over the latest run.
        </>
      ),
    },
  },
];

// One ordered timeline drives BOTH panes. Each step reveals a terminal entry
// and/or mutates the session "store": `trace` = how many runs are now visible,
// `note` = the (0-based) trace whose agent note is written, `name` = the session
// gets named, `expand` = a trace to auto-expand. `delay` is the pause before it.
type Step = {
  entry?: Entry;
  trace?: number;
  note?: number;
  name?: boolean;
  expand?: number;
  delay: number;
};

const SEQUENCE: Step[] = [
  { entry: { kind: "status", text: "Step 1: Running agent with Laminar Debugger" }, trace: 1, delay: 700 },
  { entry: { kind: "tool", text: "Bash(LMNR_DEBUG=1 uv run agent.py)" }, delay: 240 },
  { entry: { kind: "result", text: "Session fix-memory-md · 12 spans" }, delay: 360 },

  { entry: { kind: "status", text: "Step 2: Querying trace via Laminar CLI SQL" }, delay: 700 },
  { entry: { kind: "tool", text: 'Bash(lmnr-cli sql query "SELECT name, span_type' }, delay: 240 },
  { entry: { kind: "tool", text: "  FROM spans WHERE trace_id='7f3a…'\")" }, delay: 220 },
  { entry: { kind: "result", text: "12 rows · no write_file span found" }, note: 0, name: true, delay: 440 },

  {
    entry: {
      kind: "thought",
      text: "The agent never persists what it learned. The prompt never tells it to write MEMORY.md.",
    },
    delay: 560,
  },

  { entry: { kind: "status", text: "Step 3: Implementing the fix" }, delay: 700 },
  { entry: { kind: "update", text: "Update(agent/prompt.py)" }, delay: 420 },
  { entry: { kind: "diff", sign: " ", text: "  'Answer the user's question.'," }, delay: 150 },
  { entry: { kind: "diff", sign: "+", text: "  'When done, write what you learned'," }, delay: 130 },
  { entry: { kind: "diff", sign: "+", text: "  'to MEMORY.md via write_file.'," }, delay: 130 },

  { entry: { kind: "status", text: "Step 4: Verifying the fix" }, trace: 2, delay: 740 },
  { entry: { kind: "tool", text: 'Bash(lmnr-cli sql query "SELECT count() FROM spans' }, delay: 240 },
  { entry: { kind: "tool", text: "  WHERE name='write_file'\")" }, delay: 220 },
  { entry: { kind: "result", text: "1 row · write_file → MEMORY.md" }, note: 1, delay: 440 },

  { entry: { kind: "status", text: "Step 5: Fix confirmed!" }, expand: 1, delay: 740 },
];

const TYPE_MS = 22;

// Owns the single animation clock + the session store, and renders both panes.
// Gated on `useInView`, runs once when scrolled into view.
const DebuggerScene = () => {
  const ref = useRef<HTMLDivElement>(null);
  // `amount: 0.3` so it fires once ~30% of the scene is actually on screen — not
  // the instant the top edge clips the viewport (which reads as "on page load").
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  const [typed, setTyped] = useState("");
  const [revealed, setRevealed] = useState(0);
  // User clicks override the scene-driven expansion (so an auto-expanded card can
  // still be collapsed). Stored by trace index.
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});

  const isTyping = typed.length < PROMPT.length;

  // Phase 0: type the prompt one char at a time.
  useEffect(() => {
    if (!isInView || !isTyping) return;
    const t = setTimeout(() => setTyped(PROMPT.slice(0, typed.length + 1)), TYPE_MS);
    return () => clearTimeout(t);
  }, [isInView, isTyping, typed]);

  // Phase 1: reveal one timeline step at a time, paced by each step's delay.
  // SEQUENCE[0].delay doubles as the post-typing pause before the first step.
  useEffect(() => {
    if (!isInView || isTyping || revealed >= SEQUENCE.length) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), SEQUENCE[revealed].delay);
    return () => clearTimeout(t);
  }, [isInView, isTyping, revealed]);

  // Derive both panes' view-models from the revealed steps + user overrides.
  const { entries, terminalFinished, sessionName, sessionTraces, revealKey, sceneExpand } = useMemo(() => {
    const steps = SEQUENCE.slice(0, revealed);
    const entries = steps.map((s) => s.entry).filter((e): e is Entry => !!e);
    const traceCount = steps.reduce((m, s) => Math.max(m, s.trace ?? 0), 0);
    const notes = steps.filter((s) => s.note !== undefined).map((s) => s.note as number);
    const sceneExpand = steps.filter((s) => s.expand !== undefined).map((s) => s.expand as number);
    const named = steps.some((s) => s.name);
    // Bumps only when session content streams in, so autoscroll fires on real growth.
    const revealKey = steps.filter((s) => s.trace || s.note !== undefined || s.expand !== undefined).length;

    const sessionTraces: VisibleTrace[] = TRACES.slice(0, traceCount).map((t, i) => ({
      ...t,
      noteVisible: notes.includes(i),
      expanded: i in overrides ? overrides[i] : sceneExpand.includes(i),
    }));

    return {
      entries,
      terminalFinished: revealed >= SEQUENCE.length,
      sessionName: named ? SESSION_NAME : null,
      sessionTraces,
      revealKey,
      sceneExpand,
    };
  }, [revealed, overrides]);

  const onToggle = (i: number) =>
    setOverrides((prev) => ({ ...prev, [i]: !(i in prev ? prev[i] : sceneExpand.includes(i)) }));

  // Padded outer is justify-start; the inner row is w-full + min-w-min so it
  // centers the two fixed-width windows when there's room, but never shrinks
  // below their combined width — when the viewport is too narrow it stays content-
  // width, pins left, and the browser runs off the right (clipped by the panel's
  // overflow-hidden).
  return (
    <div ref={ref} className="flex w-full justify-start px-8 py-12 md:py-[72px]">
      <div className="flex w-full min-w-min justify-center gap-4">
        <DebuggerTerminalMock
          entries={entries}
          typed={typed}
          isTyping={isTyping}
          finished={terminalFinished}
          prompt={PROMPT}
        />
        <DebuggerSessionMock name={sessionName} traces={sessionTraces} revealKey={revealKey} onToggle={onToggle} />
      </div>
    </div>
  );
};

export default DebuggerScene;
