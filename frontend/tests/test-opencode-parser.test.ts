import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractToolsIfToolOnly } from "@/lib/actions/spans/previews/tool-detection";
import { parseSystemMessageFromInput } from "@/lib/actions/spans/system-messages";
import { processMessages } from "@/lib/spans/process-messages";
import { detectProvider } from "@/lib/spans/providers";
import { parseAiSdkMessages } from "@/lib/spans/types/ai-sdk";
import { parseOpenCodeMessages } from "@/lib/spans/types/opencode";

const request = [
  { role: "system", content: [{ type: "text", text: "You are opencode." }] },
  {
    role: "user",
    content: [
      { type: "text", text: "What is this?" },
      { type: "media", media: { source: { type: "base64", data: "iVBOR", mediaType: "image/png" } } },
    ],
  },
  {
    role: "assistant",
    content: [
      { type: "reasoning", text: "Check." },
      { type: "tool-call", id: "call_1", name: "read", input: { path: "a" } },
    ],
  },
  {
    role: "tool",
    content: [{ type: "tool-result", id: "call_1", name: "read", result: { type: "text", value: "ok" } }],
  },
];

// How ingestion stores it: non-system content stringified.
const stored = request.map((m, i) => (i === 0 ? m : { ...m, content: JSON.stringify(m.content) }));

const expected = [
  [{ type: "text", text: "You are opencode." }],
  [
    { type: "text", text: "What is this?" },
    { type: "image", image: "data:image/png;base64,iVBOR" },
  ],
  [
    { type: "reasoning", text: "Check." },
    { type: "tool-call", toolCallId: "call_1", toolName: "read", input: { path: "a" } },
  ],
  [{ type: "tool-result", toolCallId: "call_1", toolName: "read", output: { type: "text", value: "ok" } }],
];

describe("OpenCode V2 messages", () => {
  it("converts raw and stored inputs", () => {
    for (const input of [request, stored]) {
      const result = processMessages(input);
      assert.strictEqual(result.type, "generic");
      assert.deepStrictEqual(
        result.messages.map((m) => m.content),
        expected
      );
    }
  });

  it("does not claim text-only or AI SDK payloads", () => {
    assert.strictEqual(parseOpenCodeMessages([{ role: "user", content: [{ type: "text", text: "hi" }] }]), null);
    const aiSdk = [{ role: "assistant", content: [{ type: "tool-call", toolCallId: "c", toolName: "t", input: {} }] }];
    assert.deepStrictEqual(processMessages(aiSdk).messages, parseAiSdkMessages(aiSdk));
    const aiSdkV4 = [
      { role: "tool", content: [{ type: "tool-result", toolCallId: "c", toolName: "t", result: "ok" }] },
    ];
    assert.strictEqual(parseOpenCodeMessages(aiSdkV4), null);
  });

  it("works with the provider adapter", () => {
    assert.strictEqual(detectProvider(stored), "opencode");
    assert.strictEqual(parseSystemMessageFromInput(JSON.stringify(stored)), "You are opencode.");
    const toolOnly = [
      { role: "assistant", content: [{ type: "tool-call", id: "c", name: "bash", input: { cmd: "ls" } }] },
    ];
    assert.deepStrictEqual(extractToolsIfToolOnly(toolOnly, "opencode"), [{ name: "bash", input: { cmd: "ls" } }]);
  });
});
