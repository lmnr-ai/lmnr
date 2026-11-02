import assert from "node:assert";
import crypto from "node:crypto";
import { test } from "node:test";

import { findWorkflowFiles } from "@/lib/github/pull-request";
import {
  type ConnectStatePayload,
  signConnectState,
  verifyConnectState,
  verifyWebhookSignature,
} from "@/lib/github/signing";

const SECRET = "state-secret";
const NOW = 1_800_000_000_000;

const payload: ConnectStatePayload = {
  nonce: "abc",
  userId: "u1",
  workspaceId: "w1",
  projectId: "p1",
  returnTo: "/onboarding",
  exp: NOW / 1000 + 600,
};

test("connect state round-trips", () => {
  assert.deepStrictEqual(verifyConnectState(signConnectState(payload, SECRET), SECRET, NOW), payload);
});

test("connect state rejects a different secret", () => {
  assert.strictEqual(verifyConnectState(signConnectState(payload, SECRET), "other", NOW), null);
});

test("connect state rejects a tampered payload", () => {
  const [, signature] = signConnectState(payload, SECRET).split(".");
  const forged = Buffer.from(JSON.stringify({ ...payload, workspaceId: "w2" })).toString("base64url");
  assert.strictEqual(verifyConnectState(`${forged}.${signature}`, SECRET, NOW), null);
});

test("connect state rejects an expired state", () => {
  assert.strictEqual(verifyConnectState(signConnectState(payload, SECRET), SECRET, NOW + 601_000), null);
});

test("connect state rejects garbage", () => {
  for (const state of ["", "abc", "a.b.c", "."]) {
    assert.strictEqual(verifyConnectState(state, SECRET, NOW), null);
  }
});

test("webhook signature accepts the GitHub format", () => {
  const body = '{"action":"deleted"}';
  const signature = `sha256=${crypto.createHmac("sha256", "hook").update(body).digest("hex")}`;
  assert.strictEqual(verifyWebhookSignature(body, signature, "hook"), true);
});

test("webhook signature rejects a wrong secret, an altered body or a missing header", () => {
  const body = '{"action":"deleted"}';
  const signature = `sha256=${crypto.createHmac("sha256", "hook").update(body).digest("hex")}`;
  assert.strictEqual(verifyWebhookSignature(body, signature, "other"), false);
  assert.strictEqual(verifyWebhookSignature(`${body} `, signature, "hook"), false);
  assert.strictEqual(verifyWebhookSignature(body, null, "hook"), false);
  assert.strictEqual(verifyWebhookSignature(body, "sha256=short", "hook"), false);
});

test("findWorkflowFiles flags only .github/workflows paths", () => {
  assert.deepStrictEqual(
    findWorkflowFiles([
      { path: ".github/workflows/ci.yml", content: "" },
      { path: "./.github/workflows/old.yml", deleted: true },
      { path: ".github/dependabot.yml", content: "" },
      { path: "src/.github/workflows/x.yml", content: "" },
      { path: "src/index.ts", content: "" },
    ]),
    [".github/workflows/ci.yml", ".github/workflows/old.yml"]
  );
});
