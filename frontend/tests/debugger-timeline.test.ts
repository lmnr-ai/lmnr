import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEBUGGER_PROMPT,
  DEBUGGER_SEQUENCE,
} from "@/components/landing/sections/claude-fix-my-agent/debugger-sequence";
import {
  frameAtElapsed,
  PIPE_DURATION_MS,
  timelineDuration,
  TYPE_DURATION_MS,
} from "@/components/landing/sections/claude-fix-my-agent/debugger-timeline";

const firstTransferStart =
  DEBUGGER_PROMPT.length * TYPE_DURATION_MS + DEBUGGER_SEQUENCE.slice(0, 5).reduce((duration) => duration + 200, 0);

describe("debugger timeline", () => {
  it("fills the pipe before displaying transfer progress", () => {
    const duringPipe = frameAtElapsed(DEBUGGER_PROMPT, DEBUGGER_SEQUENCE, firstTransferStart + PIPE_DURATION_MS / 2);
    const afterPipe = frameAtElapsed(DEBUGGER_PROMPT, DEBUGGER_SEQUENCE, firstTransferStart + PIPE_DURATION_MS + 1);

    assert.equal(duringPipe.transfer?.pipe, 0.5);
    assert.equal(duringPipe.transfer?.progressBar, undefined);
    assert.equal(afterPipe.transfer?.pipe, 1);
    assert.ok(afterPipe.transfer?.progressBar !== undefined);
  });

  it("reveals the complete transcript at the end", () => {
    const frame = frameAtElapsed(
      DEBUGGER_PROMPT,
      DEBUGGER_SEQUENCE,
      timelineDuration(DEBUGGER_PROMPT, DEBUGGER_SEQUENCE)
    );

    assert.equal(frame.revealed, DEBUGGER_SEQUENCE.length);
    assert.equal(frame.transfer, undefined);
    assert.equal(frame.isTyping, false);
  });
});
