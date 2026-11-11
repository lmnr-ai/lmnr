import assert from "node:assert";
import { test } from "node:test";

import {
  mergeSlackChannelSelection,
  redactSlackChannel,
  SlackChannelNotVisibleError,
  toVisibleChannels,
} from "@/lib/actions/slack/visibility";

// The viewer sees #general (public) and #team-secret (private, shared with the bot).
// C_HIDDEN is a private channel they aren't in.
const visible = toVisibleChannels([
  { id: "C_PUBLIC", name: "general", isMember: true, isPrivate: false },
  { id: "C_SHARED", name: "team-secret", isMember: true, isPrivate: true },
]);

const stored = [
  { channelId: "C_PUBLIC", channelName: "general-old" },
  { channelId: "C_SHARED", channelName: "team-secret" },
  { channelId: "C_HIDDEN", channelName: "acquisition-talks" },
];

test("redactSlackChannel withholds names of channels the viewer can't see", () => {
  assert.deepStrictEqual(redactSlackChannel(stored[2], visible), {
    channelId: "C_HIDDEN",
    channelName: null,
    hidden: true,
  });
  assert.deepStrictEqual(redactSlackChannel({ channelId: null, channelName: "x" }, visible), {
    channelId: null,
    channelName: null,
    hidden: true,
  });
});

test("redactSlackChannel shows Slack's current name for visible channels", () => {
  assert.deepStrictEqual(redactSlackChannel(stored[0], visible), {
    channelId: "C_PUBLIC",
    channelName: "general",
    hidden: false,
  });
});

test("mergeSlackChannelSelection keeps hidden targets when the viewer clears the selection", () => {
  const { kept, added } = mergeSlackChannelSelection({ stored, requestedIds: [], visible });
  assert.deepStrictEqual(kept, [stored[2]]);
  assert.deepStrictEqual(added, []);
});

test("mergeSlackChannelSelection keeps requested stored channels and adds visible new ones", () => {
  const { kept, added } = mergeSlackChannelSelection({
    stored: [stored[0], stored[2]],
    requestedIds: ["C_PUBLIC", "C_SHARED"],
    visible,
  });
  assert.deepStrictEqual(kept, [stored[0], stored[2]]);
  assert.deepStrictEqual(
    added.map((c) => c.id),
    ["C_SHARED"]
  );
});

test("mergeSlackChannelSelection keeps a stored channel a rate-limited listing missed", () => {
  const { kept } = mergeSlackChannelSelection({
    stored: [stored[0]],
    requestedIds: ["C_PUBLIC"],
    visible: new Map(),
  });
  assert.deepStrictEqual(kept, [stored[0]]);
});

test("mergeSlackChannelSelection rejects adding a channel the viewer can't see", () => {
  assert.throws(
    () => mergeSlackChannelSelection({ stored: [], requestedIds: ["C_HIDDEN"], visible }),
    SlackChannelNotVisibleError
  );
});
