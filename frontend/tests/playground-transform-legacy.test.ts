import assert from "node:assert/strict";
import { test } from "node:test";

import { type Message } from "@/lib/playground/types";
import { transformFromLegacy } from "@/lib/playground/utils";

test("transformFromLegacy normalizes legacy string content into a text part", () => {
  // Pre AI SDK v5 rows stored content as a plain string.
  const legacy = [{ role: "user", content: "hello world" }] as unknown as Message[];

  const result = transformFromLegacy(legacy);

  assert.deepEqual(result[0].content, [{ type: "text", text: "hello world" }]);
});

test("transformFromLegacy preserves array content and upgrades v4 tool-call/result parts", () => {
  const messages = [
    {
      role: "assistant",
      content: [
        { type: "text", text: "hi" },
        { type: "tool-call", toolCallId: "1", toolName: "t", args: '{"a":1}' },
        { type: "tool-result", toolCallId: "1", toolName: "t", result: "ok" },
      ],
    },
  ] as unknown as Message[];

  const result = transformFromLegacy(messages);
  const parts = result[0].content as any[];

  assert.deepEqual(parts[0], { type: "text", text: "hi" });
  assert.deepEqual(parts[1], { type: "tool-call", toolCallId: "1", toolName: "t", input: { a: 1 } });
  assert.deepEqual(parts[2], {
    type: "tool-result",
    toolCallId: "1",
    toolName: "t",
    output: { type: "text", value: "ok" },
  });
});

test("transformFromLegacy handles nullish legacy content without throwing", () => {
  const legacy = [{ role: "assistant", content: null }] as unknown as Message[];

  const result = transformFromLegacy(legacy);

  assert.deepEqual(result[0].content, [{ type: "text", text: "" }]);
});
