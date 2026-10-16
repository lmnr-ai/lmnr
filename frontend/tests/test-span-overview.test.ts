import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildOverview } from "@/components/traces/span-view/span-overview-utils";

// LAM-2372: the Overview detects input and output independently and renders each side in its own
// format. Formats overlap, so flattening mismatched sides into one list loses structure.

describe("buildOverview", () => {
  it("keeps an OpenAI-shaped input and an Anthropic tool_use output in their own formats", () => {
    const input = [{ role: "user", content: "What is the weather in San Francisco?" }];
    const output = [
      {
        role: "assistant",
        content: [
          {
            id: "toolu_01E9yz4aXxEQwyTSpbtQU1oc",
            caller: { type: "direct" },
            input: { location: "San Francisco, CA" },
            name: "get_weather",
            type: "tool_use",
          },
        ],
        stop_reason: "tool_use",
      },
    ];

    const { processedMessages, messageLabels } = buildOverview(input, output);

    assert.deepEqual(
      processedMessages?.map((s) => s.type),
      ["openai", "anthropic"]
    );
    const [outputMessage] = processedMessages![1].messages as { content: { type: string; name?: string }[] }[];
    assert.equal(outputMessage.content[0].type, "tool_use");
    assert.equal(outputMessage.content[0].name, "get_weather");
    assert.deepEqual(messageLabels, [
      { beforeIndex: 0, text: "Input", subtext: "(last message)" },
      { beforeIndex: 1, text: "Output" },
    ]);
  });

  it("keeps only the last two input messages", () => {
    const input = [
      { role: "system", content: "s" },
      { role: "user", content: "a" },
      { role: "user", content: "b" },
    ];
    const output = [{ role: "assistant", content: "c" }];

    const { processedMessages, messageLabels } = buildOverview(input, output);

    assert.equal(processedMessages?.length, 2);
    assert.deepEqual(
      (processedMessages![0].messages as { content: string }[]).map((m) => m.content),
      ["a", "b"]
    );
    assert.deepEqual(messageLabels[1], { beforeIndex: 2, text: "Output" });
  });

  it("returns a single segment when only one side is present", () => {
    const { processedMessages, messageLabels } = buildOverview(null, [{ role: "assistant", content: "hi" }]);

    assert.equal(processedMessages?.length, 1);
    assert.deepEqual(messageLabels, [{ beforeIndex: 0, text: "Output" }]);
  });

  it("returns no segments when both sides are missing", () => {
    assert.equal(buildOverview(null, undefined).processedMessages, undefined);
  });
});
