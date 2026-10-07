import assert from "node:assert";
import { test } from "node:test";

import { parseProjectSelection, SELECT_PROJECT_ACTION_ID } from "@/lib/actions/slack/handle-interaction";

const buildPayload = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "block_actions",
    team: { id: "T123" },
    channel: { id: "C456", name: "general" },
    response_url: "https://hooks.slack.com/actions/abc",
    actions: [
      {
        action_id: SELECT_PROJECT_ACTION_ID,
        selected_option: { value: "11111111-1111-1111-1111-111111111111" },
      },
    ],
    ...overrides,
  });

test("parseProjectSelection extracts the picked project + context", () => {
  const selection = parseProjectSelection(buildPayload());
  assert.deepStrictEqual(selection, {
    projectId: "11111111-1111-1111-1111-111111111111",
    teamId: "T123",
    channelId: "C456",
    channelName: "general",
    responseUrl: "https://hooks.slack.com/actions/abc",
  });
});

test("parseProjectSelection returns null for non-block_actions", () => {
  assert.strictEqual(parseProjectSelection(buildPayload({ type: "view_submission" })), null);
});

test("parseProjectSelection returns null when the picker action is absent", () => {
  const payload = buildPayload({
    actions: [{ action_id: "some_other_action", selected_option: { value: "x" } }],
  });
  assert.strictEqual(parseProjectSelection(payload), null);
});

test("parseProjectSelection returns null without a team/channel", () => {
  assert.strictEqual(parseProjectSelection(buildPayload({ channel: undefined })), null);
});

test("parseProjectSelection tolerates a missing channel name", () => {
  const selection = parseProjectSelection(buildPayload({ channel: { id: "C456" } }));
  assert.strictEqual(selection?.channelName, undefined);
  assert.strictEqual(selection?.channelId, "C456");
});
