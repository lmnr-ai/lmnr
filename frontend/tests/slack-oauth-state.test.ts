import assert from "node:assert";
import { test } from "node:test";

import { consumeSlackOauthState, mintSlackOauthState } from "@/lib/actions/slack/oauth-state";

const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";

test("state is opaque and carries no workspace context", async () => {
  const { state, codeChallenge } = await mintSlackOauthState({ userId: "user-a", workspaceId: WORKSPACE_ID });
  assert.ok(!state.includes(WORKSPACE_ID));
  assert.match(state, /^[A-Za-z0-9_-]{43}$/);
  assert.match(codeChallenge, /^[A-Za-z0-9_-]{43}$/);
});

test("only the initiating user can consume, and only once", async () => {
  const { state } = await mintSlackOauthState({
    userId: "user-a",
    workspaceId: WORKSPACE_ID,
    returnPath: "/onboarding",
  });

  // A different user (e.g. a victim lured into the attacker's callback) gets nothing
  // and does not burn the record.
  assert.strictEqual(await consumeSlackOauthState(state, "user-b"), null);

  const flow = await consumeSlackOauthState(state, "user-a");
  assert.strictEqual(flow?.workspaceId, WORKSPACE_ID);
  assert.strictEqual(flow?.returnPath, "/onboarding");
  assert.ok(flow?.codeVerifier);

  assert.strictEqual(await consumeSlackOauthState(state, "user-a"), null);
});

test("unknown or forged states are rejected", async () => {
  assert.strictEqual(await consumeSlackOauthState(WORKSPACE_ID, "user-a"), null);
  assert.strictEqual(await consumeSlackOauthState(`${WORKSPACE_ID}:/onboarding`, "user-a"), null);
});
