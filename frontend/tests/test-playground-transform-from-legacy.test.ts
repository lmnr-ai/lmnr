import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type Message } from "@/lib/playground/types";
import { transformFromLegacy } from "@/lib/playground/utils";

describe("transformFromLegacy", () => {
  it("normalizes legacy plain-string content into a text part", () => {
    // Rows saved before the AI SDK v5 migration store content as a string.
    const messages = [{ role: "user", content: "hello world" }] as unknown as Message[];

    const result = transformFromLegacy(messages);

    assert.deepStrictEqual(result, [
      {
        role: "user",
        content: [{ type: "text", text: "hello world" }],
      },
    ]);
  });

  it("leaves array content untouched and upgrades V4 tool parts", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "calling a tool" },
          { type: "tool-call", toolCallId: "1", toolName: "search", args: '{"q":"x"}' },
        ],
      },
    ] as unknown as Message[];

    const result = transformFromLegacy(messages);

    assert.deepStrictEqual(result, [
      {
        role: "assistant",
        content: [
          { type: "text", text: "calling a tool" },
          { type: "tool-call", toolCallId: "1", toolName: "search", input: { q: "x" } },
        ],
      },
    ]);
  });
});
