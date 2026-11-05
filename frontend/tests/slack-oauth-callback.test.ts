import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  authorizeSlackCallbackWorkspace,
  buildRedirectUrl,
  isRelativePath,
  parseState,
} from "@/lib/actions/slack/callback";

describe("Slack OAuth Callback Authorization", () => {
  const validWorkspaceId = "11111111-1111-1111-1111-111111111111";
  const otherWorkspaceId = "22222222-2222-2222-2222-222222222222";
  const userId = "user-12345";

  describe("parseState", () => {
    it("extracts bare workspaceId when no colon is present", () => {
      const res = parseState(validWorkspaceId);
      assert.deepEqual(res, { workspaceId: validWorkspaceId });
    });

    it("extracts workspaceId and returnPath when colon is present", () => {
      const res = parseState(`${validWorkspaceId}:/project/abc/settings?tab=integrations`);
      assert.deepEqual(res, {
        workspaceId: validWorkspaceId,
        returnPath: "/project/abc/settings?tab=integrations",
      });
    });

    it("preserves additional colons inside returnPath", () => {
      const res = parseState(`${validWorkspaceId}:/path/with:colon:in:url`);
      assert.deepEqual(res, {
        workspaceId: validWorkspaceId,
        returnPath: "/path/with:colon:in:url",
      });
    });
  });

  describe("isRelativePath", () => {
    it("returns true for root-relative paths", () => {
      assert.equal(isRelativePath("/project/123/settings"), true);
      assert.equal(isRelativePath("/projects?foo=bar"), true);
    });

    it("returns false for protocol-relative or absolute URLs to prevent open redirect", () => {
      assert.equal(isRelativePath("//attacker.com"), false);
      assert.equal(isRelativePath("//attacker.com/path"), false);
      assert.equal(isRelativePath("https://attacker.com"), false);
      assert.equal(isRelativePath("http://attacker.com"), false);
      assert.equal(isRelativePath("javascript:alert(1)"), false);
      assert.equal(isRelativePath("relative/without/slash"), false);
      assert.equal(isRelativePath(""), false);
    });
  });

  describe("buildRedirectUrl", () => {
    it("safely routes to /projects when workspaceId is invalid and no returnPath", async () => {
      const url = await buildRedirectUrl("invalid-guid", undefined, true);
      assert.ok(
        url.endsWith("/projects?slack=error"),
        `Expected redirect to end with /projects?slack=error, got: ${url}`
      );
    });

    it("appends status to returnPath preserving existing query parameters", async () => {
      const url = await buildRedirectUrl(validWorkspaceId, "/project/abc/settings?tab=integrations", false);
      assert.ok(url.includes("/project/abc/settings?tab=integrations&slack=success"));

      const errorUrl = await buildRedirectUrl(validWorkspaceId, "/project/abc/settings", true);
      assert.ok(errorUrl.includes("/project/abc/settings?slack=error"));
    });
  });

  describe("authorizeSlackCallbackWorkspace (Vulnerability Prevention)", () => {
    it("rejects non-UUID workspace identifiers before checking database", async () => {
      let membershipChecked = false;
      const res = await authorizeSlackCallbackWorkspace("not-a-valid-uuid", {
        getSession: async () => ({ user: { id: userId, name: "Alice", email: "alice@example.com" } }),
        checkMembership: async () => {
          membershipChecked = true;
          return true;
        },
      });

      assert.equal(res.authorized, false);
      assert.equal(res.reason, "invalid_workspace_id");
      assert.equal(membershipChecked, false, "Should not query membership for malformed UUIDs");
    });

    it("rejects unauthenticated requests (missing session)", async () => {
      let membershipChecked = false;
      const res = await authorizeSlackCallbackWorkspace(validWorkspaceId, {
        getSession: async () => null,
        checkMembership: async () => {
          membershipChecked = true;
          return true;
        },
      });

      assert.equal(res.authorized, false);
      assert.equal(res.reason, "unauthenticated");
      assert.equal(membershipChecked, false, "Should not query membership when unauthenticated");
    });

    it("rejects cross-workspace takeover when user is not a member of the target workspace", async () => {
      const res = await authorizeSlackCallbackWorkspace(otherWorkspaceId, {
        getSession: async () => ({ user: { id: userId, name: "Attacker", email: "attacker@example.com" } }),
        checkMembership: async (wsId, uId) => wsId === validWorkspaceId && uId === userId,
      });

      assert.equal(res.authorized, false);
      assert.equal(res.reason, "unauthorized");
    });

    it("authorizes when user is an active member of the workspace in state", async () => {
      const res = await authorizeSlackCallbackWorkspace(validWorkspaceId, {
        getSession: async () => ({ user: { id: userId, name: "Alice", email: "alice@example.com" } }),
        checkMembership: async (wsId, uId) => wsId === validWorkspaceId && uId === userId,
      });

      assert.equal(res.authorized, true);
    });
  });
});
