import type { Step } from "./debugger-types";

export const DEBUGGER_PROMPT = "I don't see anything written to MEMORY.md, fix please.";

export const DEBUGGER_SEQUENCE: Step[] = [
  { entry: { kind: "status", text: "Step 1: Running agent with Laminar Debugger" }, delay: 700 },
  { entry: { kind: "tool", text: "LMNR_DEBUG=1 uv run agent.py" }, delay: 240 },
  { entry: { kind: "result", text: "Session fix-memory-md · 12 spans" }, delay: 360 },
  { entry: { kind: "status", text: "Step 2: Querying trace via Laminar CLI SQL" }, delay: 700 },
  { entry: { kind: "tool", text: `lmnr-cli sql query "SELECT name FROM spans WHERE trace_id='7f…'"` }, delay: 240 },
  {
    entry: { kind: "result", text: "12 rows · no write_file span found", transferLabel: "spans", transferTotal: 12 },
    delay: 440,
  },
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
  { entry: { kind: "status", text: "Step 4: Re-running with cached spans" }, delay: 740 },
  { entry: { kind: "tool", text: "LMNR_DEBUG=true LMNR_DEBUG_CACHE_UNTIL=a91c… uv run agent.py" }, delay: 240 },
  { entry: { kind: "result", text: "Replayed 8 cached spans · 4 ran live" }, delay: 420 },
  { entry: { kind: "status", text: "Step 5: Checking the write_file tool ran" }, delay: 700 },
  {
    entry: { kind: "tool", text: `lmnr-cli sql query "SELECT count() FROM spans WHERE name='write_file'"` },
    delay: 240,
  },
  {
    entry: { kind: "result", text: "1 row · write_file span found", transferLabel: "span", transferTotal: 1 },
    delay: 440,
  },
  { entry: { kind: "status", text: "Step 6: Reviewing recent write_file outputs" }, delay: 700 },
  {
    entry: {
      kind: "tool",
      text: `lmnr-cli sql query "SELECT output FROM spans WHERE name='write_file'..."`,
    },
    delay: 240,
  },
  {
    entry: {
      kind: "result",
      text: "12 rows · latest: Successfully wrote 58 bytes to MEMORY.md",
      transferLabel: "outputs",
      transferTotal: 12,
    },
    delay: 440,
  },
  { entry: { kind: "status", text: "Step 7: Fix confirmed!" }, delay: 740 },
];
