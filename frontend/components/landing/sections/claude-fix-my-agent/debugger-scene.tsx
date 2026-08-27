"use client";

import { useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import DebuggerTerminalMock, { type Entry } from "./debugger-terminal-mock";

const PROMPT = "I don't see anything written to MEMORY.md, fix please.";

// One ordered timeline. Each step reveals a terminal entry; `delay` is the pause
// before it.
type Step = { entry: Entry; delay: number };

// Commands run one to a line. They used to wrap across two `tool` entries to
// fit a narrower terminal; at 600px the longest of them is ~75 monospace
// characters against ~77 of content width, so keep any new one under that or
// it will clip rather than wrap (`whitespace-pre`).
const SEQUENCE: Step[] = [
  { entry: { kind: "status", text: "Step 1: Running agent with Laminar Debugger" }, delay: 700 },
  { entry: { kind: "tool", text: "LMNR_DEBUG=1 uv run agent.py" }, delay: 240 },
  { entry: { kind: "result", text: "Session fix-memory-md · 12 spans" }, delay: 360 },

  { entry: { kind: "status", text: "Step 2: Querying trace via Laminar CLI SQL" }, delay: 700 },
  { entry: { kind: "tool", text: `lmnr-cli sql query "SELECT name FROM spans WHERE trace_id='7f3a…'"` }, delay: 240 },
  { entry: { kind: "result", text: "12 rows · no write_file span found" }, delay: 440 },

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

  // Re-run with span caching: replay the recorded trace, serving cached LLM
  // responses up to the boundary and running the changed tail live.
  { entry: { kind: "status", text: "Step 4: Re-running with cached spans" }, delay: 740 },
  { entry: { kind: "tool", text: "LMNR_DEBUG=true LMNR_DEBUG_CACHE_UNTIL=a91c… uv run agent.py" }, delay: 240 },
  { entry: { kind: "result", text: "Replayed 8 cached spans · 4 ran live" }, delay: 420 },

  { entry: { kind: "status", text: "Step 5: Verifying the fix" }, delay: 700 },
  {
    entry: { kind: "tool", text: `lmnr-cli sql query "SELECT count() FROM spans WHERE name='write_file'"` },
    delay: 240,
  },
  { entry: { kind: "result", text: "1 row · write_file → MEMORY.md" }, delay: 440 },

  { entry: { kind: "status", text: "Step 6: Fix confirmed!" }, delay: 740 },
];

const TYPE_MS = 22;

/** Every `delay` above is multiplied by this. The RHYTHM between steps is
 *  authored in the table; this is the single dial for how fast the run reads. */
const PACE = 1.4;

// Owns the animation clock and renders the terminal.
// Gated on `useInView`, runs once when scrolled into view.
const DebuggerScene = () => {
  const ref = useRef<HTMLDivElement>(null);
  // `amount: 0.3` so it fires once ~30% of the scene is actually on screen — not
  // the instant the top edge clips the viewport (which reads as "on page load").
  const isInView = useInView(ref, { once: true, amount: 0.3 });

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
  // SEQUENCE[0].delay doubles as the post-typing pause before the first step.
  useEffect(() => {
    if (!isInView || isTyping || revealed >= SEQUENCE.length) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), SEQUENCE[revealed].delay * PACE);
    return () => clearTimeout(t);
  }, [isInView, isTyping, revealed]);

  const entries = SEQUENCE.slice(0, revealed).map((step) => step.entry);

  // Padded outer is justify-start; the inner row is w-full + min-w-min so it
  // centers the terminal when there's room, but never shrinks below its width —
  // when the viewport is too narrow it stays content-width, pins left, and runs
  // off the right (clipped by the panel's overflow-hidden).
  return (
    <div ref={ref} className="flex w-full justify-start px-8 py-12 md:py-[72px]">
      <div className="flex w-full min-w-min items-center justify-center">
        <DebuggerTerminalMock
          entries={entries}
          typed={typed}
          isTyping={isTyping}
          finished={revealed >= SEQUENCE.length}
          prompt={PROMPT}
        />
      </div>
    </div>
  );
};

export default DebuggerScene;
